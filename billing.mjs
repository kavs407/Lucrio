import {createHash, timingSafeEqual, randomBytes} from 'node:crypto';
const digest=s=>createHash('sha256').update(s).digest('hex');
export function validSecret(actual,expected){return typeof actual==='string'&&typeof expected==='string'&&expected.length>=32&&timingSafeEqual(Buffer.from(digest(actual),'hex'),Buffer.from(digest(expected),'hex'))}
export function purchaseEvent(payload,productId,now=Date.now()){
 if(!productId||payload?.Product?.product_id!==productId)return null;
 const type=payload.webhook_event_type;
 const email=String(payload.Customer?.email||'').trim().toLowerCase();
 const order=payload.order_id;
 if(typeof order!=='string'||order.length>200||!order||!/^\S+@\S+\.\S+$/.test(email)||email.length>254)throw Object.assign(Error('Evento incompleto.'),{status:400});
 if(['order_refunded','order_chargeback','chargeback','compra_reembolsada'].includes(type))return {order,email,status:'revoked',until:0};
 if(!['order_approved','subscription_renewed'].includes(type))return null;
 if(payload.order_status!=='paid'||payload.Subscription?.plan?.frequency!=='monthly')return null;
 const until=Date.parse(payload.Subscription?.customer_access?.access_until||payload.Subscription?.next_payment||'');
 if(!Number.isSafeInteger(until)||until<=now||until>now+45*86400000)throw Object.assign(Error('Período da assinatura inválido.'),{status:400});
 return {order,email,status:'paid',until};
}
export async function sendActivation(db,email,config){
 if(!config.RESEND_API_KEY||!config.MAIL_FROM)throw Object.assign(Error('O envio de acesso ainda está sendo configurado.'),{status:503});
 const base=new URL(config.PUBLIC_URL||config.RENDER_EXTERNAL_URL).origin;
 const token=randomBytes(32).toString('hex');
 await db.saveActivation(digest(token),email,Date.now()+48*3600000);
 const link=base+'/cadastro#token='+token;
 const r=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+config.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:config.MAIL_FROM,to:[email],subject:'Seu acesso à Lucrio está pronto',html:'<h1>Boas-vindas à Lucrio 💚</h1><p>Seu pagamento foi confirmado. Use o botão para criar sua conta com o e-mail desta compra.</p><p><a href="'+link+'">Criar minha conta</a></p><p>Este link é pessoal e vale por 48 horas. Se você já tem uma conta, abra o link e escolha Entrar. Nunca compartilhe o link.</p>'})});
 if(!r.ok)throw Object.assign(Error('Não foi possível enviar o e-mail de acesso. Tente novamente.'),{status:503});
}
export const tokenHash=digest;
