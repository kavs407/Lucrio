import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
await rm('sales-dist',{recursive:true,force:true});await mkdir('sales-dist');
let html=await readFile('public/landing.html','utf8');
html=html.replaceAll('href="/login"','href="https://uselucrio.onrender.com/login"').replaceAll('href="/ativar"','href="https://uselucrio.onrender.com/ativar"').replaceAll('href="/comprar"','href="https://pay.kiwify.com.br/JdY9x46"');
await writeFile('sales-dist/index.html',html);
const js=(await readFile('public/landing.js','utf8')).split("fetch('/api/public-config')")[0];
await writeFile('sales-dist/landing.js',js);
for(const name of ['landing.css','logo.png'])await copyFile('public/'+name,'sales-dist/'+name);
console.log('Página de vendas estática pronta.');
