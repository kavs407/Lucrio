import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createStore} from './database.mjs';
import {createApp} from './server.mjs';
const dir=await mkdtemp(path.join(tmpdir(),'lucrio-pg-test-'));
let engine,db,server,base;
function adapt(engine){return {query:(sql,args)=>engine.query(sql,args),connect:async()=>({query:(sql,args)=>args?engine.query(sql,args):engine.exec(sql).then(results=>results[0]),release(){}}),end:()=>engine.close()}}
async function start(){engine=await PGlite.create(dir);db=createStore(adapt(engine));await db.migrate();server=createApp(db,{NODE_ENV:'test'});server.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port}
async function stop(){if(server?.listening)await new Promise(resolve=>server.close(resolve));await db?.close();db=null}
async function request(route,method='GET',data,cookie,origin=base){return fetch(base+route,{method,redirect:'manual',headers:{...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(method!=='GET'?{Origin:origin}:{})},body:data?JSON.stringify(data):undefined})}
const cookie=r=>r.headers.get('set-cookie').split(';')[0];
test('PostgreSQL: cadastro, login, isolamento, reinício e alterações concorrentes',async()=>{try{
await start();let r=await request('/api/workspace');assert.equal(r.status,401);r=await request('/app');assert.equal(r.status,303);assert.equal((await request('/readyz')).status,200);
r=await request('/api/auth/register','POST',{email:'alice@example.test',password:'senha-forte-teste',business:'Doces da Alice'});assert.equal(r.status,201);const a=cookie(r);assert(r.headers.get('set-cookie').includes('HttpOnly'));
r=await request('/api/auth/register','POST',{email:'bob@example.test',password:'senha-forte-teste',business:'Ateliê do Bob'});assert.equal(r.status,201);const b=cookie(r);
r=await request('/api/auth/register','POST',{email:'alice@example.test',password:'senha-forte-teste',business:'Duplicado'});assert.equal(r.status,409);
r=await request('/api/auth/login','POST',{email:'alice@example.test',password:'senha-incorreta'});assert.equal(r.status,401);
r=await request('/api/workspace','GET',null,a);const d=await r.json();assert.equal(d.workspace.settings.name,'Doces da Alice');
const product={id:'p1',name:'Brigadeiro',segment:'Alimentação',materials:[{name:'Chocolate (g)',price:10,total:1000,used:500}],yield:10,time:60,hour:20,pack:1,other:0,power:1000,eqtime:60,gas:0,wear:0,loss:0,margin:30,tax:5,fee:5,fixedfee:0,discount:0};d.workspace.products.push(product);
r=await request('/api/workspace','PUT',{workspace:d.workspace,revision:1},a);assert.equal(r.status,200);assert.equal((await r.json()).revision,2);
r=await request('/api/workspace','PUT',{workspace:d.workspace,revision:1},a);assert.equal(r.status,409);
r=await request('/api/workspace','PUT',{workspace:d.workspace,revision:2},a,'https://invalid.test');assert.equal(r.status,403);
r=await request('/api/workspace','GET',null,b);assert.equal((await r.json()).workspace.products.length,0);
r=await request('/api/workspace','PUT',{workspace:{...d.workspace,products:[{...product,fee:90}]},revision:2},a);assert.equal(r.status,400);
const key=await engine.query("SELECT password FROM lucrio.users WHERE email='alice@example.test'");assert(!key.rows[0].password.includes('senha-forte-teste'));
const policies=await engine.query("SELECT relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='lucrio' AND relname IN ('users','sessions','workspaces')");assert.equal(policies.rows.length,3);assert(policies.rows.every(r=>r.relrowsecurity));
await stop();await start(); // Same database, new server; no local sessions required.
r=await request('/api/workspace','GET',null,a);assert.equal(r.status,200);assert.equal((await r.json()).workspace.products[0].name,'Brigadeiro');
r=await request('/api/auth/login','POST',{email:'alice@example.test',password:'senha-forte-teste'});assert.equal(r.status,200);const c=cookie(r);r=await request('/api/auth/logout','POST',null,c);assert.equal(r.status,200);assert.equal((await request('/api/workspace','GET',null,c)).status,401);
const js=await readFile('public/app.js','utf8'),source=js.slice(js.indexOf('function calc('),js.indexOf('\nfunction goto'));const calc=new Function('db',source+';return calc')({settings:{energy:1,fixed:160,hours:160}});assert.equal(calc(product).unit,3.7);assert(Math.abs(calc(product).margin-30)<1e-8);
const production=createApp(db,{NODE_ENV:'production',RENDER_EXTERNAL_URL:'https://example.onrender.com'});production.close();
}finally{await stop();await rm(dir,{recursive:true,force:true})}});

test('Assinatura: webhook autenticado, e-mail confirmado, expiração e reembolso',async()=>{
 const {purchaseEvent,tokenHash}=await import('./billing.mjs');
 const e=await PGlite.create();const d=createStore(adapt(e));await d.migrate();
 const secret='a'.repeat(64),token='b'.repeat(64),buyer='pessoa@example.test';let mailCount=0;
 const paid={order_id:'order1',webhook_event_type:'order_approved',order_status:'paid',Product:{product_id:'lucrio'},Customer:{email:buyer},Subscription:{plan:{frequency:'monthly'},next_payment:new Date(Date.now()+30*86400000).toISOString()}};
 const app=createApp(d,{NODE_ENV:'test',REQUIRE_PURCHASE:'1',KIWIFY_WEBHOOK_TOKEN:secret,KIWIFY_PRODUCT_ID:'lucrio',sendActivation:async email=>{mailCount++;assert.equal(email,buyer);await d.saveActivation(tokenHash(token),email,Date.now()+3600000)}});
 app.listen(0,'127.0.0.1');await once(app,'listening');const host='http://127.0.0.1:'+app.address().port;
 const req=(route,method='GET',data,c)=>fetch(host+route,{method,redirect:'manual',headers:{Origin:host,...(data?{'Content-Type':'application/json'}:{}),...(c?{Cookie:c}:{})},body:data?JSON.stringify(data):undefined});
 const registration={email:buyer,password:'teste-bem-seguro',business:'Teste',token};
 try{
 assert.equal((await req('/')).status,200);assert.equal((await req('/comprar')).headers.get('location'),'/assinatura?status=preparando');
 assert.equal((await req('/api/auth/register','POST',registration)).status,403);
 assert.equal((await req('/api/billing/kiwify','POST',paid)).status,401);
 assert.equal((await req('/api/billing/kiwify?token='+secret,'POST',{...paid,Product:{product_id:'outro'}})).status,200);assert.equal(await d.hasAccess(buyer),false);
 // Real provider calls do not carry a browser Origin header.
 const webhook=()=>fetch(host+'/api/billing/kiwify?token='+secret,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(paid)});
 assert.equal((await webhook()).status,200);assert.equal(await d.hasAccess(buyer),true);assert.equal(mailCount,1);
 assert.equal((await webhook()).status,200);assert.equal(mailCount,1);
 assert.equal((await req('/api/auth/register','POST',{...registration,email:'intruso@example.test'})).status,403);
 const r=await req('/api/auth/register','POST',registration);assert.equal(r.status,201);const c=cookie(r);
 assert.equal(await d.getActivation(tokenHash(token)),undefined);assert.equal((await req('/api/workspace','GET',null,c)).status,200);
 assert.equal((await req('/api/auth/register','POST',registration)).status,403);
 assert.equal((await req('/api/auth/login','POST',registration)).status,200);
 const revoked={...paid,webhook_event_type:'order_refunded'};
 assert.equal((await req('/api/billing/kiwify?token='+secret,'POST',revoked)).status,200);
 assert.equal((await req('/api/workspace','GET',null,c)).status,403);assert.equal((await req('/app','GET',null,c)).headers.get('location'),'/assinatura');
 assert.equal((await req('/api/auth/login','POST',registration)).status,403);
 await webhook();assert.equal(await d.hasAccess(buyer),false); // A delayed approval cannot undo a refund.
 await d.recordPurchase({order:'expired',email:buyer,status:'paid',until:Date.now()-1});assert.equal(await d.hasAccess(buyer),false);
 assert.throws(()=>purchaseEvent({...paid,Subscription:{plan:{frequency:'monthly'},next_payment:'bad'}},'lucrio'),/Período/);
 const a=await req('/api/auth/activation','POST',{token});assert.equal(a.status,403);
 assert.equal((await req('/api/auth/request-access','POST',{email:'nobody@example.test'})).status,200);assert.equal(mailCount,1);
 const rows=await e.query("SELECT relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='lucrio' AND relname IN ('purchases','activations')");assert(rows.rows.every(r=>r.relrowsecurity));
 }finally{await new Promise(resolve=>app.close(resolve));await d.close()}
});

test('Envio Google por HTTPS: assinatura, destinatário fixo, repetição e falhas',async()=>{
 const {runInNewContext}=await import('node:vm');
 const {createHmac}=await import('node:crypto');
 const {sendActivation,emailConfigured,checkoutConfigured}=await import('./billing.mjs');
 const source=await readFile('integrations/google-mail/Code.gs','utf8');
 const relaySecret='c'.repeat(64),cache=new Map(),outbox=[];
 let quota=100;
 const scope={Date,JSON,Number,PropertiesService:{getScriptProperties:()=>({getProperty:()=>relaySecret})},Utilities:{Charset:{UTF_8:'utf8'},computeHmacSha256Signature:(s,k)=>Array.from(createHmac('sha256',k).update(s).digest())},ContentService:{MimeType:{JSON:'application/json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})},MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:m=>outbox.push(m)},LockService:{getScriptLock:()=>({tryLock:()=>true,hasLock:()=>true,releaseLock(){}})},CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})}};
 runInNewContext(source,scope);
 const config={EMAIL_TRANSPORT:'google-apps-script',GMAIL_RELAY_URL:'https://script.google.com/macros/s/test-only/exec',GMAIL_RELAY_SECRET:relaySecret,RENDER_EXTERNAL_URL:'https://uselucrio.onrender.com'};
 let savedHash,envelope;
 const fakeDb={saveActivation:async hash=>{savedHash=hash}};
 const transport=async(url,options)=>{assert.equal(url,config.GMAIL_RELAY_URL);assert.equal(options.method,'POST');assert(!options.body.includes(relaySecret));envelope=JSON.parse(options.body);const data=scope.doPost({postData:{contents:options.body}});return {ok:true,json:async()=>data}};
 assert.equal(emailConfigured(config),true);assert.equal(emailConfigured({...config,GMAIL_RELAY_URL:'https://evil.test/exec'}),false);
 assert.equal(checkoutConfigured({...config,KIWIFY_CHECKOUT_URL:'url',KIWIFY_PRODUCT_ID:'id',KIWIFY_WEBHOOK_TOKEN:'a'.repeat(64)}),false);
 await sendActivation(fakeDb,'buyer@example.test',config,transport);
 assert.equal(outbox.length,1);assert.equal(outbox[0].to,'buyer@example.test');assert.match(outbox[0].body,/https:\/\/uselucrio.onrender.com\/cadastro#token=[a-f0-9]{64}/);assert.equal(JSON.parse(envelope.payload).id,savedHash);
 assert.equal(scope.doPost({postData:{contents:JSON.stringify(envelope)}}).ok,true);assert.equal(outbox.length,1);
 const changed={...envelope,payload:envelope.payload.replace('buyer@example.test','thief@example.test')};assert.equal(scope.doPost({postData:{contents:JSON.stringify(changed)}}).ok,false);
 const signed=d=>{const payload=JSON.stringify(d);return {payload,signature:createHmac('sha256',relaySecret).update(payload).digest('hex')}};
 for(const changes of [{issued_at:Date.now()-600001},{link:'https://evil.test/cadastro#token='+ 'd'.repeat(64)},{to:'one@example.test,two@example.test'}]){const data={...JSON.parse(envelope.payload),...changes};assert.equal(scope.doPost({postData:{contents:JSON.stringify(signed(data))}}).ok,false)}
 assert.equal(outbox.length,1);quota=0;const data={...JSON.parse(envelope.payload),id:'e'.repeat(64)};assert.equal(scope.doPost({postData:{contents:JSON.stringify(signed(data))}}).ok,false);
 await assert.rejects(()=>sendActivation(fakeDb,'buyer@example.test',config,async()=>({ok:true,json:async()=>({ok:false})})),e=>e.status===503);
 await assert.rejects(()=>sendActivation(fakeDb,'buyer@example.test',config,async()=>{throw Error('credential must not appear')}),e=>e.status===503&&!e.message.includes('credential'));
});

test('Teste de e-mail fica fechado sem credencial temporária e não concede acesso',async()=>{
 const e=await PGlite.create();const d=createStore(adapt(e));await d.migrate();
 const app=createApp(d,{NODE_ENV:'test'});app.listen(0,'127.0.0.1');await once(app,'listening');const host='http://127.0.0.1:'+app.address().port;
 try{const r=await fetch(host+'/api/admin/mail-test',{method:'POST',headers:{Origin:host,'Content-Type':'application/json'},body:JSON.stringify({secret:'bad',to:'attacker@example.test'})});assert.equal(r.status,403);const rows=await e.query('SELECT count(*) AS n FROM lucrio.purchases');assert.equal(Number(rows.rows[0].n),0)}finally{await new Promise(resolve=>app.close(resolve));await d.close()}
});
