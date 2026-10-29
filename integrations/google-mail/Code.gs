// Lucrio: enviar apenas links de ativação, sem ler a caixa de entrada.
// Configure LUCRIO_RELAY_SECRET nas Propriedades do script (não neste arquivo).
function jsonResult(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function doGet() { return jsonResult({service:'lucrio-mail',ok:true}); }
function autorizarEnvio() { return MailApp.getRemainingDailyQuota(); }
function constantEqual(a,b) {
  if(typeof a!=='string'||typeof b!=='string'||a.length!==64||b.length!==64)return false;
  var diff=0;for(var i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
function doPost(e) {
  var lock;
  try {
    if(!e||!e.postData||typeof e.postData.contents!=='string'||e.postData.contents.length>6000)return jsonResult({ok:false});
    var envelope=JSON.parse(e.postData.contents);
    var secret=PropertiesService.getScriptProperties().getProperty('LUCRIO_RELAY_SECRET');
    if(!secret||secret.length<32||typeof envelope.payload!=='string'||typeof envelope.signature!=='string')return jsonResult({ok:false});
    var signed=Utilities.computeHmacSha256Signature(envelope.payload,secret,Utilities.Charset.UTF_8);
    var expected=signed.map(function(b){return ('0'+(b&255).toString(16)).slice(-2)}).join('');
    if(!constantEqual(envelope.signature,expected))return jsonResult({ok:false});
    var data=JSON.parse(envelope.payload);
    if(!Number.isSafeInteger(data.issued_at)||Math.abs(Date.now()-data.issued_at)>300000)return jsonResult({ok:false});
    if(typeof data.to!=='string'||data.to.length>254||!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(data.to))return jsonResult({ok:false});
    if(typeof data.link!=='string'||!/^https:\/\/uselucrio\.onrender\.com\/cadastro#token=[a-f0-9]{64}$/.test(data.link))return jsonResult({ok:false});
    if(typeof data.id!=='string'||!/^[a-f0-9]{64}$/.test(data.id))return jsonResult({ok:false});
    lock=LockService.getScriptLock();if(!lock.tryLock(5000))return jsonResult({ok:false});
    var cache=CacheService.getScriptCache();
    if(cache.get('sent:'+data.id))return jsonResult({ok:true,duplicate:true});
    if(MailApp.getRemainingDailyQuota()<1)return jsonResult({ok:false});
    MailApp.sendEmail({to:data.to,name:'Lucrio',subject:'Seu acesso à Lucrio está pronto',body:'Seu pagamento foi confirmado. Crie sua conta com o e-mail da compra: '+data.link+'\n\nLink pessoal, válido por 48 horas. Se já tem conta, abra o link e escolha Entrar. Não compartilhe.',htmlBody:'<h1>Boas-vindas à Lucrio</h1><p>Seu pagamento foi confirmado. Crie sua conta com o e-mail desta compra.</p><p><a href="'+data.link+'">Criar minha conta</a></p><p>Link pessoal, válido por 48 horas. Se você já tem uma conta, abra o link e escolha Entrar. Não compartilhe o link.</p>'});
    cache.put('sent:'+data.id,'1',600);
    return jsonResult({ok:true});
  } catch(error) { return jsonResult({ok:false}); }
  finally {if(lock&&lock.hasLock())lock.releaseLock();}
}
