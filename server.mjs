import http from 'node:http';
import {validSecret,purchaseEvent,sendActivation,tokenHash,checkoutConfigured,emailConfigured} from './billing.mjs';
import {connectDatabase,createStore} from './database.mjs';
import { randomBytes,scrypt,timingSafeEqual,createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const publicDir=path.join(root,'public');
const hash=s=>createHash('sha256').update(s).digest('hex'), kdf=promisify(scrypt);
export function createApp(db,config=process.env){
const publicUrl=config.PUBLIC_URL||config.RENDER_EXTERNAL_URL||(config.KOYEB_PUBLIC_DOMAIN?'https://'+config.KOYEB_PUBLIC_DOMAIN:null);
const maxAge=7*24*60*60,base=publicUrl?new URL(publicUrl).origin:null,production=config.NODE_ENV==='production';
if(production&&(!base||!base.startsWith('https://')))throw Error('Em produção, configure PUBLIC_URL com o domínio HTTPS da aplicação.');
const secure=production||base?.startsWith('https://');
const paidMode=production||config.REQUIRE_PURCHASE==='1';
const adminEmail=String(config.ADMIN_EMAIL||'').trim().toLowerCase();
const ownerEmail=email=>!!adminEmail&&email===adminEmail;
const admin=user=>!!(user?.verified_at&&ownerEmail(user.email));
const deliver=config.sendActivation||((email)=>sendActivation(db,email,config));
const limiter=new Map();
let mailTestUsed=false;
function allowed(key,limit=15){const now=Date.now();let entry=limiter.get(key);if(!entry||entry.reset<now)entry={n:0,reset:now+15*60*1000};entry.n++;limiter.set(key,entry);return entry.n<=limit}
const cleanup=setInterval(()=>{for(const [k,v] of limiter)if(v.reset<Date.now())limiter.delete(k);db.cleanSessions(Date.now()).catch(e=>console.error('Falha na limpeza de sessões:',e.code||e.name));},60000);cleanup.unref();
function json(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(data))}
async function body(req,max=2_000_000){let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>max){const e=Error('Arquivo muito grande.');e.status=413;throw e}parts.push(chunk)}try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{const e=Error('Dados inválidos.');e.status=400;throw e}}
function originOK(req){const expected=base||`http://${req.headers.host}`;return req.headers.origin===expected}
async function session(req){const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('lucrio_session='))?.slice(15);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;return db.findSession(hash(token),Date.now())}
function cookie(token,age=maxAge){return `lucrio_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure?'; Secure':''}`}
async function createSession(id){const token=randomBytes(32).toString('hex');await db.addSession(hash(token),id,Date.now()+maxAge*1000);return cookie(token)}
const segments=['Alimentação','Artesanato','Impressão 3D','Serviços','Revenda'];
function validWorkspace(d){if(!d?.settings||typeof d.settings.name!=='string'||!d.settings.name.trim()||d.settings.name.length>100||!Array.isArray(d.products)||d.products.length>2000)return false;for(const k of ['hour','fixed','hours','energy'])if(typeof d.settings[k]!=='number'||!Number.isFinite(d.settings[k])||d.settings[k]<0||d.settings[k]>1e12)return false;if(d.settings.hours<1)return false;const ids=new Set();for(const p of d.products){if(!p||typeof p.id!=='string'||p.id.length>100||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>120||!segments.includes(p.segment)||!Array.isArray(p.materials)||p.materials.length>500)return false;ids.add(p.id);for(const k of ['yield','time','hour','pack','other','power','eqtime','gas','wear','loss','margin','tax','fee','fixedfee','discount'])if(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<0||p[k]>1e12)return false;if(p.yield<1||p.discount>100||p.margin+p.tax+p.fee>=100)return false;for(const m of p.materials)if(!m||typeof m.name!=='string'||m.name.length>300||!Number.isFinite(m.price)||m.price<0||!Number.isFinite(m.total)||m.total<=0||!Number.isFinite(m.used)||m.used<0)return false}return true}
function redirect(res,to){res.writeHead(303,{Location:to,'Cache-Control':'no-store'});res.end()}
const files={'/recuperar-senha':'recover.html','/recover.js':'recover.js','/admin':'admin.html','/admin.css':'admin.css','/admin.js':'admin.js','/':'landing.html','/landing.css':'landing.css','/landing.js':'landing.js','/ativar':'activate.html','/activate.js':'activate.js','/obrigado':'thanks.html','/assinatura':'subscription.html','/login':'login.html','/cadastro':'login.html','/app':'app.html','/logo.png':'logo.png','/auth.js':'auth.js','/app.js':'app.js','/app.css':'app.css'};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
 if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
 try{
 const url=new URL(req.url,'http://local'),route=url.pathname;
 if(route==='/healthz'&&req.method==='GET')return json(res,200,{ok:true});
 if(route==='/readyz'&&req.method==='GET'){try{await db.ready();return json(res,200,{ok:true})}catch{return json(res,503,{error:'Banco temporariamente indisponível.'})}}
 if(route==='/api/billing/kiwify'&&req.method==='POST'){
 if(!validSecret(url.searchParams.get('token'),config.KIWIFY_WEBHOOK_TOKEN))return json(res,401,{error:'Webhook não autorizado.'});
 const event=purchaseEvent(await body(req,100000),config.KIWIFY_PRODUCT_ID);
 if(!event)return json(res,200,{ok:true,ignored:true});
 const saved=await db.recordPurchase(event);
 if(saved?.status==='paid'&&!saved.email_sent){await deliver(event.email);await db.markPurchaseSent(event.order)}
 return json(res,200,{ok:true});
 }
 if(route==='/api/public-config'&&req.method==='GET')return json(res,200,{price:'R$ 19,90',checkoutReady:checkoutConfigured(config)});
 if(route==='/comprar'&&req.method==='GET'){
 if(!checkoutConfigured(config))return redirect(res,'/assinatura?status=preparando');
 const checkout=new URL(config.KIWIFY_CHECKOUT_URL);if(checkout.protocol!=='https:'||checkout.hostname!=='pay.kiwify.com.br')return json(res,503,{error:'Checkout indisponível.'});return redirect(res,checkout.href);
 }
 if(['POST','PUT','DELETE','PATCH'].includes(req.method)&&!originOK(req))return json(res,403,{error:'Origem inválida. Atualize a página e tente novamente.'});
 if(route==='/api/admin/mail-test'&&req.method==='POST'){
 const {secret}=await body(req,2000);
 const expires=Number(config.MAIL_TEST_EXPIRES_AT||0);
 if(!validSecret(secret,config.MAIL_TEST_SECRET)||!Number.isSafeInteger(expires)||Date.now()>expires||mailTestUsed)return json(res,403,{error:'Teste não autorizado ou expirado.'});
 const recipient=config.MAIL_TEST_TO;
 if(!recipient||!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient))return json(res,503,{error:'Destinatário de teste não configurado.'});
 // The recipient is fixed in the service config. Test links are never persisted
 // and cannot create accounts or establish a paid entitlement.
 mailTestUsed=true;
 try{await sendActivation({saveActivation:async()=>{}},recipient,config);return json(res,200,{ok:true,test:true,accountCreated:false})}catch(e){mailTestUsed=false;throw e}
 }
 if(route==='/api/auth/forgot-password'&&req.method==='POST'){
 if(!allowed('reset-ip:'+req.socket.remoteAddress,10))return json(res,429,{error:'Aguarde 15 minutos antes de tentar novamente.'});
 const {email:raw}=await body(req,1000);const email=String(raw||'').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return json(res,400,{error:'Informe um e-mail válido.'});
 if(!allowed('reset-email:'+email,3))return json(res,200,{ok:true});
 if(await db.findUser(email)){
 const resetStore={saveActivation:(token,to)=>db.saveReset(token,to,Date.now()+30*60000)};
 try{if(config.sendReset)await config.sendReset(email,resetStore);else await sendActivation(resetStore,email,config)}catch(e){console.error('Falha no envio da recuperação:',e.code||e.name)}
 }
 return json(res,200,{ok:true});
 }
 if(route==='/api/auth/reset-password'&&req.method==='POST'){
 if(!allowed('reset-use:'+req.socket.remoteAddress,30))return json(res,429,{error:'Muitas tentativas. Aguarde 15 minutos.'});
 const {token,password}=await body(req,2000);
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||typeof password!=='string'||password.length<10||password.length>128)return json(res,400,{error:'Use uma senha de 10 a 128 caracteres e um link válido.'});
 const salt=randomBytes(16).toString('hex'),derived=Buffer.from(await kdf(password,salt,64)).toString('hex');
 await db.resetPassword(tokenHash(token),salt+':'+derived);
 return json(res,200,{ok:true},{'Set-Cookie':cookie('',0)});
 }
 if(route==='/api/auth/activation'&&req.method==='POST'){
 const {token}=await body(req,10000);if(typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)){const resetEmail=await db.getReset(tokenHash(token));if(resetEmail)return json(res,200,{email:resetEmail,reset:true})}const email=typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)?await db.getActivation(tokenHash(token)):null;
 if(!email||(!ownerEmail(email)&&!await db.hasAccess(email)))return json(res,403,{error:'Link inválido, expirado ou assinatura sem pagamento ativo.'});return json(res,200,{email});
 }
 if(route==='/api/auth/request-access'&&req.method==='POST'){
 const ip=req.socket.remoteAddress;if(!allowed('access:'+ip,5))return json(res,429,{error:'Aguarde antes de solicitar outro link.'});
 const {email:raw}=await body(req,10000);const email=String(raw||'').trim().toLowerCase();
 if(ownerEmail(email)||await db.hasAccess(email))await deliver(email);
 return json(res,200,{ok:true,message:'Se houver pagamento ativo para este e-mail, enviaremos seu link. Confira também o spam.'});
 }
 if((route==='/api/auth/register' ||route==='/api/auth/login')&&req.method==='POST'){
 const ip=config.TRUST_PROXY==='1'?(req.headers['x-forwarded-for']?.split(',')[0]?.trim()||req.socket.remoteAddress):req.socket.remoteAddress;
 if(!allowed('ip:'+ip,60))return json(res,429,{error:'Muitas tentativas. Aguarde 15 minutos.'});
 const input=await body(req,10000);const email=String(input.email||'').trim().toLowerCase(),password=input.password;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=='string'||password.length<10||password.length>128)return json(res,400,{error:'Informe um e-mail válido e uma senha de 10 a 128 caracteres.'});
 if(!allowed('email:'+email,15))return json(res,429,{error:'Muitas tentativas para este e-mail. Aguarde 15 minutos.'});
 const paid=paidMode;const activation=typeof input.token==='string'&&/^[a-f0-9]{64}$/.test(input.token)?tokenHash(input.token):null;
 if(route.endsWith('register')){
 if(paid&&(!activation||await db.getActivation(activation)!==email||(!ownerEmail(email)&&!await db.hasAccess(email))))return json(res,403,{error:'Para se cadastrar, use o link enviado ao e-mail da compra com pagamento ativo.'});
 const name=String(input.business||'').trim();if(!name||name.length>100)return json(res,400,{error:'Informe o nome do seu negócio (até 100 caracteres).'});
 const salt=randomBytes(16).toString('hex'),derived=Buffer.from(await kdf(password,salt,64)).toString('hex'),id=randomBytes(16).toString('hex');
 try{await db.createUser(id,email,salt+':'+derived,Date.now(),{settings:{name,hour:20,fixed:0,hours:160,energy:1},products:[]},paid?activation:null)}catch(e){if(e.code==='23505')return json(res,409,{error:'Não foi possível criar esta conta. Se já tem cadastro, faça login.'});throw e}
 return json(res,201,{ok:true,...(ownerEmail(email)?{redirect:'/admin'}:{})},{'Set-Cookie':await createSession(id)});
 }
 const user=await db.findUser(email);
 // Run the same expensive derivation even when the account does not exist.
 const [salt,stored]=(user?.password||('00000000000000000000000000000000:'+ '0'.repeat(128))).split(':');
 const derived=Buffer.from(await kdf(password,salt,64));if(!user||!timingSafeEqual(derived,Buffer.from(stored,'hex')))return json(res,401,{error:'E-mail ou senha incorretos.'});
 if(paid){if(!ownerEmail(email)&&!await db.hasAccess(email))return json(res,403,{error:'Sua assinatura precisa de um pagamento ativo.',redirect:'/assinatura'});if(!user.verified_at){if(!activation||await db.getActivation(activation)!==email)return json(res,403,{error:'Confirme seu e-mail pelo link de acesso da compra.',redirect:'/ativar'});await db.verifyUser(user.id,email,activation)}}
 return json(res,200,{ok:true,...(ownerEmail(email)?{redirect:'/admin'}:{})},{'Set-Cookie':await createSession(user.id)});
 }
 if(route==='/api/auth/logout'&&req.method==='POST'){const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('lucrio_session='))?.slice(15);if(token)await db.deleteSession(hash(token));return json(res,200,{ok:true},{'Set-Cookie':cookie('',0)})}
 const user=await session(req);
 const isAdmin=admin(user);
 const entitled=user&&(!paidMode||isAdmin||(user.verified_at&&await db.hasAccess(user.email)));
 if(route==='/admin'&&!user)return redirect(res,'/login');
 if((route==='/admin'||route.startsWith('/api/admin/'))&&!isAdmin)return json(res,user?403:401,{error:'Acesso exclusivo do administrador.'});
 if(route==='/api/admin/overview'&&req.method==='GET')return json(res,200,{...(await db.adminOverview()),adminEmail:user.email,setup:{emailConfigured:emailConfigured(config),checkoutEnabled:checkoutConfigured(config)}});
 if(route==='/api/admin/resend'&&req.method==='POST'){
 if(!allowed('admin-resend:'+user.id,10))return json(res,429,{error:'Aguarde antes de reenviar mais acessos.'});
 const {email:raw}=await body(req,1000);const email=String(raw||'').trim().toLowerCase();
 if(!await db.hasAccess(email))return json(res,409,{error:'Este e-mail não tem pagamento ativo.'});
 await deliver(email);await db.markAccessSent(email);return json(res,200,{ok:true});
 }
 if(user&&!entitled&&(route==='/api/workspace'||route==='/app')){if(route==='/app')return redirect(res,'/assinatura');return json(res,403,{error:'Assinatura sem acesso ativo. Confira seu pagamento.',redirect:'/assinatura'})}
 if(route==='/api/workspace'){
 if(!user)return json(res,401,{error:'Entre novamente para continuar.'});
 if(req.method==='GET'){const w=await db.getWorkspace(user.id);return json(res,200,{user:{email:user.email,name:user.email},workspace:w?w.data:null,revision:w?.revision||0})}
 if(req.method==='PUT'){const {workspace,revision}=await body(req);if(!validWorkspace(workspace)||!Number.isSafeInteger(revision)||revision<0)return json(res,400,{error:'Revise os dados e tente novamente.'});const next=await db.saveWorkspace(user.id,workspace,revision);if(next===null)return json(res,409,{error:'Os dados mudaram em outra aba. Exporte um backup e recarregue.'});return json(res,200,{revision:next})}
 return json(res,405,{error:'Método não permitido.'},{Allow:'GET, PUT'});
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Método não permitido.'});
 if(route==='/conta')return redirect(res,'/cadastro');
 if(route==='/app'&&!user)return redirect(res,'/login');
 if(route==='/login'&&entitled)return redirect(res,isAdmin?'/admin':'/app');
 if(!files[route])return json(res,404,{error:'Página não encontrada.'});
 const file=files[route];res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':file.endsWith('.html')?'no-store':'public, max-age=300'});res.end(req.method==='HEAD'?undefined:readFileSync(path.join(publicDir,file)));
 }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'Não foi possível concluir a operação. Tente novamente.'});else res.end();if(!e.status)console.error('Falha na requisição:',e.code||e.name)}
});
server.on('close',()=>clearInterval(cleanup));
return server;
}
async function main(){
 let db;
 try{db=createStore(connectDatabase());await db.migrate();const server=createApp(db);server.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>console.log(`Lucrio disponível na porta ${server.address().port}`));
 for(const event of ['SIGTERM','SIGINT'])process.on(event,()=>server.close(async()=>{await db.close();process.exit(0)}));
 }catch(e){console.error('Falha ao iniciar. Confira DATABASE_URL, PUBLIC_URL e o certificado do Supabase:',e.code||e.name);await db?.close();process.exitCode=1}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
