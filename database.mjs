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
 async findSession(tokenHash,now){const r=await pool.query('SELECT u.id,u.email FROM lucrio.sessions s JOIN lucrio.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2',[tokenHash,now]);return r.rows[0]||null},
 async addSession(hash,userId,expiresAt){await pool.query('INSERT INTO lucrio.sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[hash,userId,expiresAt])},
 async deleteSession(hash){await pool.query('DELETE FROM lucrio.sessions WHERE token_hash=$1',[hash])},
 async cleanSessions(now){await pool.query('DELETE FROM lucrio.sessions WHERE expires_at<$1',[now])},
 async createUser(id,email,password,createdAt,workspace){const c=await pool.connect();try{await c.query('BEGIN');await c.query('INSERT INTO lucrio.users(id,email,password,created_at) VALUES($1,$2,$3,$4)',[id,email,password,createdAt]);await c.query('INSERT INTO lucrio.workspaces(user_id,data,revision) VALUES($1,$2::jsonb,1)',[id,JSON.stringify(workspace)]);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}},
 async findUser(email){const r=await pool.query('SELECT id,password FROM lucrio.users WHERE email=$1',[email]);return r.rows[0]||null},
 async getWorkspace(id){const r=await pool.query('SELECT data,revision FROM lucrio.workspaces WHERE user_id=$1',[id]);return r.rows[0]||null},
 async saveWorkspace(id,data,revision){const r=revision===0?await pool.query('INSERT INTO lucrio.workspaces(user_id,data,revision) VALUES($1,$2::jsonb,1) ON CONFLICT(user_id) DO NOTHING RETURNING revision',[id,JSON.stringify(data)]):await pool.query('UPDATE lucrio.workspaces SET data=$1::jsonb,revision=revision+1 WHERE user_id=$2 AND revision=$3 RETURNING revision',[JSON.stringify(data),id,revision]);return r.rows[0]?.revision??null},
 async close(){await pool.end()}
 };
}
