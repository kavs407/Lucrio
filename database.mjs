import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const schema=readFileSync(new URL('./schema.sql',import.meta.url),'utf8');
export function connectDatabase(){
 if(!process.env.DATABASE_URL)throw Error('Configure DATABASE_URL com a conexão Session pooler do Supabase.');
 const url=new URL(process.env.DATABASE_URL);
 if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('DATABASE_URL deve ser uma conexão PostgreSQL.');
 // Driver TLS configuration is authoritative. URI SSL parameters must not overwrite verification.
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
 const local=process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1','::1'].includes(url.hostname);
 const ca=process.env.DATABASE_CA_CERT?.replace(/\\n/g,'\n');
 const pool=new pg.Pool({connectionString:url.toString(),max:3,idleTimeoutMillis:30000,connectionTimeoutMillis:10000,query_timeout:15000,ssl:local?false:{rejectUnauthorized:true,...(ca?{ca}:{})}});
 pool.on('error',error=>console.error('Conexão com o banco interrompida:',error.code||error.name));
 return pool;
}
export function createStore(pool){
 return {
 async migrate(){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(72180129)");await c.query(schema);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}},
 async ready(){await pool.query('SELECT 1 FROM lucrio.users LIMIT 1')},
 async findSession(tokenHash,now){const r=await pool.query('SELECT u.id,u.email,u.verified_at FROM lucrio.sessions s JOIN lucrio.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2',[tokenHash,now]);return r.rows[0]||null},
 async addSession(hash,userId,expiresAt){await pool.query('INSERT INTO lucrio.sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[hash,userId,expiresAt])},
 async deleteSession(hash){await pool.query('DELETE FROM lucrio.sessions WHERE token_hash=$1',[hash])},
 async cleanSessions(now){await pool.query('DELETE FROM lucrio.sessions WHERE expires_at<$1',[now])},
 async createUser(id,email,password,createdAt,workspace,activationHash=null){const c=await pool.connect();try{await c.query('BEGIN');if(activationHash){const a=await c.query('UPDATE lucrio.activations SET used_at=$1 WHERE token_hash=$2 AND email=$3 AND used_at IS NULL AND expires_at>$1 RETURNING email',[createdAt,activationHash,email]);if(!a.rows.length)throw Object.assign(Error('Link expirado ou já utilizado. Solicite outro.'),{status:403})}await c.query('INSERT INTO lucrio.users(id,email,password,created_at,verified_at) VALUES($1,$2,$3,$4,$5)',[id,email,password,createdAt,activationHash?createdAt:null]);await c.query('INSERT INTO lucrio.workspaces(user_id,data,revision) VALUES($1,$2::jsonb,1)',[id,JSON.stringify(workspace)]);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}},
 async findUser(email){const r=await pool.query('SELECT id,password,verified_at FROM lucrio.users WHERE email=$1',[email]);return r.rows[0]||null},
 async getWorkspace(id){const r=await pool.query('SELECT data,revision FROM lucrio.workspaces WHERE user_id=$1',[id]);return r.rows[0]||null},
 async saveWorkspace(id,data,revision){const r=revision===0?await pool.query('INSERT INTO lucrio.workspaces(user_id,data,revision) VALUES($1,$2::jsonb,1) ON CONFLICT(user_id) DO NOTHING RETURNING revision',[id,JSON.stringify(data)]):await pool.query('UPDATE lucrio.workspaces SET data=$1::jsonb,revision=revision+1 WHERE user_id=$2 AND revision=$3 RETURNING revision',[JSON.stringify(data),id,revision]);return r.rows[0]?.revision??null},
 async hasAccess(email,now=Date.now()){const r=await pool.query("SELECT 1 FROM lucrio.purchases WHERE email=$1 AND status='paid' AND access_until>$2 LIMIT 1",[email,now]);return r.rows.length>0},
 async recordPurchase(event){const r=await pool.query("INSERT INTO lucrio.purchases(order_id,email,status,access_until) VALUES($1,$2,$3,$4) ON CONFLICT(order_id) DO UPDATE SET status=CASE WHEN lucrio.purchases.status='revoked' THEN 'revoked' ELSE EXCLUDED.status END, access_until=GREATEST(lucrio.purchases.access_until,EXCLUDED.access_until) WHERE lucrio.purchases.email=EXCLUDED.email RETURNING status,email_sent",[event.order,event.email,event.status,event.until]);return r.rows[0]},
 async markPurchaseSent(order){await pool.query('UPDATE lucrio.purchases SET email_sent=true WHERE order_id=$1',[order])},
 async saveActivation(token,email,expires){await pool.query('INSERT INTO lucrio.activations(token_hash,email,expires_at) VALUES($1,$2,$3)',[token,email,expires])},
 async getActivation(token,now=Date.now()){const r=await pool.query('SELECT email FROM lucrio.activations WHERE token_hash=$1 AND used_at IS NULL AND expires_at>$2',[token,now]);return r.rows[0]?.email},
 async verifyUser(id,email,token){const c=await pool.connect();try{await c.query('BEGIN');const r=await c.query('UPDATE lucrio.activations SET used_at=$1 WHERE token_hash=$2 AND email=$3 AND used_at IS NULL AND expires_at>$1 RETURNING email',[Date.now(),token,email]);if(!r.rows.length)throw Object.assign(Error('Link expirado ou já utilizado.'),{status:403});await c.query('UPDATE lucrio.users SET verified_at=$1 WHERE id=$2',[Date.now(),id]);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}},
 async markAccessSent(email,now=Date.now()){await pool.query("UPDATE lucrio.purchases SET email_sent=true WHERE email=$1 AND status='paid' AND access_until>$2",[email,now])},
 async adminOverview(now=Date.now()){
 const [summary,users,purchases]=await Promise.all([
 pool.query("SELECT (SELECT count(*) FROM lucrio.users) AS users,(SELECT count(DISTINCT email) FROM lucrio.purchases WHERE status='paid' AND access_until>$1) AS active,(SELECT count(*) FROM lucrio.purchases WHERE status='revoked') AS revoked,(SELECT count(*) FROM lucrio.purchases WHERE status='paid' AND access_until>$1 AND email_sent=false) AS pending",[now]),
 pool.query("SELECT u.email,u.created_at,u.verified_at,COALESCE(w.data->'settings'->>'name','') AS business,(SELECT max(p.access_until) FROM lucrio.purchases p WHERE p.email=u.email AND p.status='paid') AS access_until FROM lucrio.users u LEFT JOIN lucrio.workspaces w ON w.user_id=u.id ORDER BY u.created_at DESC LIMIT 100"),
 pool.query('SELECT order_id,email,status,access_until,email_sent FROM lucrio.purchases ORDER BY access_until DESC LIMIT 100')]);
 return {summary:summary.rows[0],users:users.rows,purchases:purchases.rows,generatedAt:now};
 },
 async close(){await pool.end()}
 };
}
