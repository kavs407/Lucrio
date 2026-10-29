import {connectDatabase,createStore} from './database.mjs';
let store;
try{store=createStore(connectDatabase());await store.migrate();console.log('Banco da Lucrio configurado.')}catch(e){console.error('Não foi possível configurar o banco. Verifique a conexão e o certificado:',e.code||e.name);process.exitCode=1}finally{await store?.close()}
