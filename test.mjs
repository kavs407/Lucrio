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
