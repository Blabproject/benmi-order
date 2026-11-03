import type { Env } from '../types/env';
import type { Order } from '../types';
import type { TenantContext } from '../types/tenant';
import { resolveTenantOrderPrefix } from '../types/tenant';
import { json } from '../utils/http';
import { buildDetailRound, detailStatement, detailProjection, DetailView, readDetail } from './order-detail';
import { getNextDailyOrderSeq } from './orders';
import { resolveTenantContext } from './tenant';
import { verifyStaffSession, sha256Hex, generateBearerToken } from './staff';
import { getStoredPassword } from './auth';
import { prepareOrderReceipt } from './line-order-receipts';
import { buildOrderFlexMessage } from './line/templates/order-receipt';
import { paymentHash, linePayCall } from './line-pay-client';
import { PaymentWorkspaceError, paymentAttentionCount, paymentAttentionRows, paymentTransactions, paymentWorkspaceDetail, paymentSummary } from './payment-workspace';

interface Connection { id:string;tenant_id:string;environment:string;mode:string;channel_id:string;encrypted_secret:string;key_version:string;return_url:string;enabled:number }
interface Payment { id:string;tenant_id:string;order_key:string;connection_id:string;operation_id:string;request_hash:string;capability_hash:string;
 provider_order_id:string;transaction_id:string|null;amount:number;currency:string;status:string;payment_url:string|null;app_url:string|null;
 confirmation_guard_version:number;confirmation_started_at:number|null;cancel_requested_at:number|null;
 result_code:string|null;paid_at:number|null;refunded_at:number|null;lease_token:string|null;lease_until:number;attempts:number;created_at:number;updated_at:number }
class PaymentError extends Error { constructor(readonly code:string,readonly status=400){super(code);} }
const noStore={'Cache-Control':'no-store'};
const reply=(value:unknown,status=200)=>json(value,status,noStore);
const activeStatuses=['REQUESTING','PENDING','CONFIRMING','UNKNOWN','REFUND_PENDING'];
const environment=(env:Env)=>env.BUILD_ENVIRONMENT || 'unconfigured';
async function ready(env:Env) {
 return !!await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='payments'").first();
}
export async function paymentConnection(env:Env,tenant:string) {
 if(!await ready(env)) return null;
 return env.DB.prepare('SELECT * FROM tenant_payment_connections WHERE tenant_id=? AND environment=? AND enabled=1')
  .bind(tenant,environment(env)).first<Connection>();
}
async function secret(env:Env,c:Connection) {
 try {
  const liveAllowed=c.environment==='production' || (c.environment==='dev' && env.PAYMENT_ALLOW_LIVE_IN_DEV==='true');
  if(c.environment!==environment(env) || (c.mode==='production' && !liveAllowed)) throw new Error();
  const ring=JSON.parse(env.PAYMENT_SECRET_KEYS || '{}'), material=ring[c.key_version];
  const decode=(v:string)=>Uint8Array.from(atob(v),x=>x.charCodeAt(0));
  if(typeof material!=='string' || decode(material).length!==32) throw new Error();
  const [version,iv,data,extra]=c.encrypted_secret.split('.');
  if(version!=='v1'||extra||decode(iv).length!==12) throw new Error();
  const key=await crypto.subtle.importKey('raw',decode(material),'AES-GCM',false,['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),
   additionalData:new TextEncoder().encode(JSON.stringify(['benmi-payment-v1',c.environment,c.tenant_id,c.id]))},key,decode(data)));
 } catch {throw new PaymentError('PAYMENT_CREDENTIALS_UNAVAILABLE',503);}
}
function projection(p:Payment) {return {id:p.id,method:'line_pay',status:p.status,amount:p.amount,currency:p.currency,
 cancelRequestedAt:p.cancel_requested_at,canCancel:!p.paid_at&&activeStatuses.includes(p.status)&&!p.cancel_requested_at,
 cancellationReason:p.paid_at?'ALREADY_PAID':p.cancel_requested_at?'VERIFYING':p.confirmation_guard_version!==1?'LEGACY_VERIFICATION':p.confirmation_started_at?'CONFIRM_STARTED':null,
 paidAt:p.paid_at,refundedAmount:p.refunded_at?p.amount:0,orderKey:p.order_key,
 paymentUrl:p.status==='PENDING'&&!p.cancel_requested_at?p.payment_url:null,appUrl:p.status==='PENDING'&&!p.cancel_requested_at?p.app_url:null,resultCode:p.result_code,needsAttention:p.status==='REFUND_FAILED'||
 (activeStatuses.includes(p.status)&&Date.now()-p.created_at>300000)};}
async function get(env:Env,id:string,tenant:string) {
 const p=await env.DB.prepare('SELECT * FROM payments WHERE id=? AND tenant_id=?').bind(id,tenant).first<Payment>();
 if(!p) throw new PaymentError('PAYMENT_NOT_FOUND',404);return p;
}
async function customer(request:Request,p:Payment) {
 const token=request.headers.get('X-Payment-Token')||'';
 if(!/^[a-f0-9]{64}$/.test(token)||await paymentHash(token)!==p.capability_hash) throw new PaymentError('PAYMENT_FORBIDDEN',403);
}
async function event(env:Env,id:string,name:string,code:string|null=null) {
 await env.DB.prepare('INSERT INTO payment_events(payment_id,event,result_code,created_at) VALUES(?,?,?,?)').bind(id,name,code,Date.now()).run();
}
async function set(env:Env,p:Payment,status:string,code:string|null=null) {
 await env.DB.batch([
 env.DB.prepare('UPDATE payments SET status=?,result_code=?,updated_at=?,next_attempt_at=? WHERE id=? AND lease_token=?')
  .bind(status,code,Date.now(),Date.now()+Math.min(3600000,30000*2**Math.min(p.attempts,7)),p.id,p.lease_token),
 env.DB.prepare("UPDATE orders SET updated_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE key=? AND tenant_id=?").bind(p.order_key,p.tenant_id)]);
 await event(env,p.id,status,code);
}
async function publish(env:Env,p:Payment,transaction:string) {
 const row=await env.DB.prepare('SELECT * FROM orders WHERE key=? AND tenant_id=?').bind(p.order_key,p.tenant_id).first<any>();
 const detail=await readDetail(env,p.tenant_id,p.order_key);
 if(!row||!detail) throw new Error('PAYMENT_ORDER_MISSING');
 const ctx=await resolveTenantContext(p.tenant_id,env);
 const order:Order={key:row.key,orderId:row.order_id,displayKey:row.display_key,customer:row.customer_name,time:row.pickup_time,
 status:'NEW',createdAt:Date.now(),userId:row.user_id,payment:{id:p.id,method:'line_pay',status:'PAID',amount:p.amount,currency:p.currency,paidAt:Date.now(),refundedAmount:0},total:p.amount,content:row.order_content,diningOption:'takeaway',detailSnapshot:detail.snapshot};
 const receipt=await prepareOrderReceipt(env,p.tenant_id,p.order_key,order.userId,'create',
  `[${ctx?.brandName||p.tenant_id}] #${row.display_key} LINE Pay`,buildOrderFlexMessage(order,ctx));
 // Only the current lease owner can commit a publication. Guard aborts entire batch.
 const statements=[env.DB.prepare("INSERT INTO payment_events(payment_id,event,result_code,created_at) VALUES(?,'publish',?,?)").bind(p.id,p.lease_token,Date.now()),env.DB.prepare(`UPDATE payments SET status='PAID',transaction_id=?,paid_at=COALESCE(paid_at,?),updated_at=?,result_code='0000'
  WHERE id=? AND lease_token=? AND paid_at IS NULL`).bind(transaction,Date.now(),Date.now(),p.id,p.lease_token),
 env.DB.prepare("UPDATE orders SET status='NEW',updated_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE key=? AND tenant_id=? AND status='PENDING_PAYMENT'").bind(p.order_key,p.tenant_id)];
 // The publication fence and payment update share the same atomic batch as the receipt.
 if(receipt) statements.push(receipt.statement);
 await env.DB.batch(statements);
 await event(env,p.id,'PAID');
}
function paymentDetail(result:any,p:Payment) {
 if(result.returnCode!=='0000'||!Array.isArray(result.info)) return null;
 return result.info.find((d:any)=>
  (!p.transaction_id||String(d.transactionId)===p.transaction_id) &&
  (!d.orderId||d.orderId===p.provider_order_id) &&
  (!d.currency||d.currency===p.currency) &&
  (!d.transactionType||d.transactionType==='PAYMENT'||d.transactionType==='PAYMENT_REFUND') &&
  /^\d+$/.test(String(d.transactionId)));
}
/** One durable lease spans provider calls; UNKNOWN is queried, never blindly recharged. */
export async function reconcilePayment(env:Env,id:string,tenant:string,initialRequest?:boolean) {
 let p=await get(env,id,tenant); if(!activeStatuses.includes(p.status)) return p;
 const lease=crypto.randomUUID(), now=Date.now();
 const locked=await env.DB.prepare(`UPDATE payments SET lease_token=?,lease_until=?,attempts=attempts+1
  WHERE id=? AND tenant_id=? AND lease_until<? AND status IN ('REQUESTING','PENDING','CONFIRMING','UNKNOWN','REFUND_PENDING')`)
  .bind(lease,now+180000,id,tenant,now).run();
 if(!locked.meta.changes) return p;
 p=await get(env,id,tenant);
 try {
  const c=await env.DB.prepare('SELECT * FROM tenant_payment_connections WHERE id=? AND tenant_id=? AND environment=?')
   .bind(p.connection_id,tenant,environment(env)).first<Connection>();
  if(!c) throw new Error('PAYMENT_CONNECTION_MISSING');
  const key=await secret(env,c),call=(path:string,data?:unknown,query?:string)=>linePayCall(c,key,path,data,query);
  if(initialRequest && p.status==='REQUESTING' && !p.transaction_id) {
   // Intent has already been committed. Never repeat this call after a lost response.
   const returnUrl=new URL('/payment-result',c.return_url);returnUrl.searchParams.set('tenant_id',tenant);returnUrl.searchParams.set('payment_id',p.id);
   const result=await call('/v4/payments/request',{amount:p.amount,currency:p.currency,orderId:p.provider_order_id,
    packages:[{id:p.id,amount:p.amount,products:[{name:'Order '+p.order_key,quantity:1,price:p.amount}]}],
    options:{payment:{capture:true}},redirectUrls:{confirmUrl:returnUrl.href,cancelUrl:returnUrl.href}});
   if(result.returnCode==='0000'&&/^\d+$/.test(String(result.info?.transactionId))) {
    const url=String(result.info.paymentUrl?.web||'');
    const parsed=new URL(url);if(parsed.protocol!=='https:'||!['web-pay.line.me','sandbox-web-pay.line.me'].includes(parsed.hostname)) throw new Error('PAYMENT_URL_INVALID');
    const app=c.mode==='production'?String(result.info.paymentUrl?.app||''):'';
    if(app) {const deep=new URL(app);if(deep.protocol!=='line:'||deep.hostname!=='pay'||!deep.pathname.startsWith('/payment/')||deep.username||deep.password)throw new Error('PAYMENT_URL_INVALID');}
    await env.DB.prepare("UPDATE payments SET transaction_id=?,payment_url=?,app_url=?,status='PENDING',updated_at=?,next_attempt_at=? WHERE id=? AND lease_token=?")
     .bind(String(result.info.transactionId),url,app||null,Date.now(),Date.now()+30000,id,lease).run();
   } else await set(env,p,['1104','1105','1106','1124','1178','1183','1194','2101','2102'].includes(result.returnCode)?'FAILED':'UNKNOWN',String(result.returnCode));
  } else if(p.status==='REFUND_PENDING') {
   const refund=await env.DB.prepare('SELECT * FROM payment_refunds WHERE payment_id=?').bind(id).first<any>();
   if(!refund) throw new Error('REFUND_MISSING');
   const query=p.transaction_id?'transactionId='+encodeURIComponent(p.transaction_id):'orderId='+encodeURIComponent(p.provider_order_id);
   let details:any=null;
   try { details=await call('/v4/payments',undefined,query); } catch(err) { console.warn('[Payment Details Query Failed]', err); }
   const d=details ? paymentDetail(details,p) : null;
   const refunded=(d?.refundList||[]).reduce((n:number,r:any)=>n+Math.abs(Number(r.refundAmount)||0),0);
   if(d&&refunded===p.amount) {
    await env.DB.batch([
     env.DB.prepare("UPDATE payment_refunds SET status='SUCCEEDED',updated_at=? WHERE payment_id=?").bind(Date.now(),id),
     env.DB.prepare("UPDATE payments SET status='REFUNDED',refunded_at=?,updated_at=? WHERE id=? AND lease_token=?").bind(Date.now(),Date.now(),id,lease),
     env.DB.prepare("UPDATE orders SET updated_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE key=? AND tenant_id=?").bind(p.order_key,tenant)]);
   } else if(['PENDING','PROCESSING','UNKNOWN'].includes(refund.status) && (refunded===0 || !d)) {
    // Commit PROCESSING before POST; a crash after this point may only QUERY.
    await env.DB.prepare("UPDATE payment_refunds SET status='PROCESSING',updated_at=? WHERE payment_id=? AND status='PENDING'").bind(Date.now(),id).run();
    const result=await call(`/v4/payments/${p.transaction_id}/refund`,{refundAmount:p.amount});
    if(result.returnCode==='0000'||result.returnCode==='1164') {
     await env.DB.batch([
      env.DB.prepare("UPDATE payment_refunds SET status='SUCCEEDED',transaction_id=?,updated_at=? WHERE payment_id=?").bind(String(result.info?.refundTransactionId||''),Date.now(),id),
      env.DB.prepare("UPDATE payments SET status='REFUNDED',refunded_at=?,updated_at=? WHERE id=? AND lease_token=?").bind(Date.now(),Date.now(),id,lease),
      env.DB.prepare("UPDATE orders SET updated_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE key=? AND tenant_id=?").bind(p.order_key,tenant)]);
     await event(env,id,'REFUNDED',result.returnCode);
    } else {
     const definite=['1163'].includes(result.returnCode);
     await env.DB.prepare('UPDATE payment_refunds SET status=?,result_code=?,updated_at=? WHERE payment_id=?')
      .bind(definite?'FAILED':'UNKNOWN',String(result.returnCode),Date.now(),id).run();
     await set(env,p,definite?'REFUND_FAILED':'REFUND_PENDING',String(result.returnCode));
    }
   } else await set(env,p,'REFUND_PENDING','REFUND_VERIFY');
  } else {
   const query=p.transaction_id?'transactionId='+encodeURIComponent(p.transaction_id):'orderId='+encodeURIComponent(p.provider_order_id);
   const result=await call('/v4/payments',undefined,query);
   const d=paymentDetail(result,p);
   if(d) await publish(env,p,String(d.transactionId));
   else if(p.transaction_id) {
    const check=await call(`/v4/payments/requests/${p.transaction_id}/check`);
    if(check.returnCode==='0110') {
     // One atomic winner: cancellation or durable permission to send Confirm.
     const intent=await env.DB.prepare(`UPDATE payments SET confirmation_started_at=?,status='CONFIRMING',updated_at=?
      WHERE id=? AND lease_token=? AND lease_until>? AND cancel_requested_at IS NULL
      AND confirmation_started_at IS NULL AND status IN ('PENDING','UNKNOWN','REQUESTING')`)
      .bind(Date.now(),Date.now(),id,lease,Date.now()).run();
     if(!intent.meta.changes){await set(env,p,'UNKNOWN','CONFIRM_OR_CANCEL_VERIFY');return await get(env,id,tenant);}
     await event(env,id,'CONFIRM_STARTED');
     const confirmed=await call(`/v4/payments/${p.transaction_id}/confirm`,{amount:p.amount,currency:p.currency});
     if(confirmed.returnCode==='0000' && confirmed.info?.orderId===p.provider_order_id && String(confirmed.info?.transactionId)===p.transaction_id)
      await publish(env,p,p.transaction_id);
     else await set(env,p,'UNKNOWN',String(confirmed.returnCode));
    } else if(check.returnCode==='0121'||check.returnCode==='0122') await set(env,p,check.returnCode==='0121'?'CANCELLED':'FAILED',check.returnCode);
    else await set(env,p,check.returnCode==='0000'&&!p.cancel_requested_at&&!p.confirmation_started_at?'PENDING':'UNKNOWN',String(check.returnCode));
   } else await set(env,p,'UNKNOWN','REQUEST_RESPONSE_MISSING');
  }
 } catch {
  await set(env,p,p.status==='REFUND_PENDING'?'REFUND_PENDING':'UNKNOWN','VERIFY_REQUIRED');
 } finally {
  await env.DB.prepare('UPDATE payments SET lease_until=0,lease_token=NULL,next_attempt_at=MAX(next_attempt_at,?) WHERE id=? AND lease_token=?')
   .bind(Date.now()+30000,id,lease).run();
 }
 return get(env,id,tenant);
}
async function create(request:Request,env:Env,tenant:TenantContext) {
 const input:any=await request.json();
 if(input.detailVersion!==1||input.parent_order_key||input.order_key||input.dining_option!=='takeaway') throw new PaymentError('PAYMENT_TAKEAWAY_ONLY');
 const capability=request.headers.get('X-Payment-Token')||'',operation=input.operationId;
 if(!/^[a-f0-9]{64}$/.test(capability)||typeof operation!=='string'||operation.length<16||operation.length>128) throw new PaymentError('PAYMENT_INVALID_SESSION');
 const {lineAccessToken:_token,...businessInput}=input;
 const hash=await paymentHash(JSON.stringify(businessInput));
 const old=await env.DB.prepare('SELECT * FROM payments WHERE tenant_id=? AND operation_id=?').bind(tenant.tenantId,operation).first<Payment>();
 if(old){await customer(request,old);if(old.request_hash!==hash)throw new PaymentError('PAYMENT_OPERATION_REUSED',409);return reply(projection(old));}
 const c=await paymentConnection(env,tenant.tenantId);
 if(!c||tenant.storeStatus==='paused') throw new PaymentError('PAYMENT_DISABLED',409);
 await secret(env,c); // Fail before creating an order if credential material is unavailable.
 const round=await buildDetailRound(env,tenant.tenantId,input,1);
 if(!Number.isSafeInteger(round.total)||round.total<=0) throw new PaymentError('PAYMENT_TWD_INTEGER_REQUIRED');
 const snapshot={schemaVersion:1 as const,rounds:[round],total:round.total},id=crypto.randomUUID(),orderId=crypto.randomUUID();
 const next=await getNextDailyOrderSeq(env,tenant.tenantId,'takeaway',new Date(),resolveTenantOrderPrefix(tenant,tenant.tenantId));
 // Verify the LIFF access token and its channel before accepting a recipient ID.
 let verifiedUser:string|null=null;
 if(typeof input.lineAccessToken==='string' && tenant.liffId) {
  try {
   const verification=await fetch('https://api.line.me/oauth2/v2.1/verify?access_token='+encodeURIComponent(input.lineAccessToken),{signal:AbortSignal.timeout(8000)});
   const v:any=await verification.json();
   if(verification.ok && String(v.client_id)===tenant.liffId.split('-')[0] && v.expires_in>0) {
    const profile=await fetch('https://api.line.me/v2/profile',{headers:{Authorization:'Bearer '+input.lineAccessToken},signal:AbortSignal.timeout(8000)});
    const user:any=await profile.json();if(profile.ok && /^U[0-9a-f]{32}$/i.test(user.userId))verifiedUser=user.userId;
   }
  }catch{} // Web receipt remains available when LINE identity cannot be verified.
 }
 const now=Date.now();
 try {await env.DB.batch([
 env.DB.prepare(`INSERT INTO orders(key,order_id,display_key,business_date,uuid,tenant_id,user_id,customer_name,pickup_time,status,total_amount,order_content,note,dining_option,round_count,detail_revision,created_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,'PENDING_PAYMENT',?,?,?,'takeaway',1,0,datetime('now'),strftime('%Y-%m-%d %H:%M:%f','now'))`)
  .bind(orderId,orderId,next.key,new Date(now+8*3600000).toISOString().slice(0,10),operation,tenant.tenantId,verifiedUser,String(input.customer||'顧客').slice(0,200),String(input.time||'').slice(0,100),round.total,DetailView.text(snapshot),DetailView.notes(snapshot)),
 detailStatement(env,tenant.tenantId,orderId,1,operation,hash,snapshot,'create'),
 env.DB.prepare('UPDATE orders SET detail_revision=1 WHERE key=? AND tenant_id=?').bind(orderId,tenant.tenantId),
 ...detailProjection(env,tenant.tenantId,orderId,snapshot),
 env.DB.prepare(`INSERT INTO payments(id,tenant_id,order_key,connection_id,operation_id,request_hash,capability_hash,provider_order_id,amount,status,next_attempt_at,created_at,updated_at,confirmation_guard_version)
 VALUES(?,?,?,?,?,?,?,?,?,'REQUESTING',?,?,?,1)`).bind(id,tenant.tenantId,orderId,c.id,operation,hash,await paymentHash(capability),'BLAB-'+id,round.total,now,now,now)
 ]);}catch(error){const replay=await env.DB.prepare('SELECT * FROM payments WHERE tenant_id=? AND operation_id=?').bind(tenant.tenantId,operation).first<Payment>();
 if(replay){await customer(request,replay);if(replay.request_hash!==hash)throw new PaymentError('PAYMENT_OPERATION_REUSED',409);return reply(projection(replay));}throw error;}
 return reply(projection(await reconcilePayment(env,id,tenant.tenantId,true)));
}
/** Cancellation and Confirm share a D1 compare-and-set boundary, not a browser flag. */
async function cancelPayment(env:Env,p:Payment) {
 const now=Date.now();
 await env.DB.prepare(`UPDATE payments SET cancel_requested_at=COALESCE(cancel_requested_at,?),updated_at=?,next_attempt_at=?,
  status=CASE WHEN confirmation_guard_version=1 AND confirmation_started_at IS NULL THEN 'CANCELLED' WHEN status='CONFIRMING' THEN 'UNKNOWN' ELSE status END,
  result_code=CASE WHEN confirmation_guard_version=1 AND confirmation_started_at IS NULL THEN 'CUSTOMER_CANCELLED' ELSE result_code END,
  lease_token=CASE WHEN confirmation_guard_version=1 AND confirmation_started_at IS NULL THEN NULL ELSE lease_token END,
  lease_until=CASE WHEN confirmation_guard_version=1 AND confirmation_started_at IS NULL THEN 0 ELSE lease_until END
  WHERE id=? AND tenant_id=? AND paid_at IS NULL AND status IN ('REQUESTING','PENDING','CONFIRMING','UNKNOWN')`)
  .bind(now,now,now,p.id,p.tenant_id).run();
 p=await get(env,p.id,p.tenant_id);
 await event(env,p.id,'CANCEL_REQUESTED',p.status);
 if(activeStatuses.includes(p.status)&&!p.paid_at)p=await reconcilePayment(env,p.id,p.tenant_id);
 if(p.paid_at)await event(env,p.id,'CANCEL_ALREADY_PAID');
 return p;
}
async function customerProjection(env:Env,p:Payment,tenant:TenantContext) {
 const order=await env.DB.prepare('SELECT display_key,status,pickup_time FROM orders WHERE key=? AND tenant_id=?').bind(p.order_key,p.tenant_id).first<any>();
 const detail=p.paid_at?await readDetail(env,p.tenant_id,p.order_key):null;
 const connection=await env.DB.prepare('SELECT return_url FROM tenant_payment_connections WHERE id=? AND tenant_id=? AND environment=?').bind(p.connection_id,p.tenant_id,environment(env)).first<{return_url:string}>();
 return {...projection(p),displayKey:order?.display_key,orderStatus:order?.status,pickupTime:order?.pickup_time,
  merchant:{brandName:tenant.brandName,logoUrl:tenant.logoUrl||null,locale:tenant.locale},menuUrl:connection?.return_url,receipt:detail?.snapshot||null};
}
async function paymentStaffSession(request:Request,env:Env,tenantId:string) {
 const valid=await verifyStaffSession(request,env,tenantId);
 if(!valid)return null;
 const context=await resolveTenantContext(tenantId,env);
 if(await getStoredPassword(env,tenantId,context)==='12345678')throw new PaymentError('PAYMENT_PIN_CHANGE_REQUIRED',409);
 return valid;
}
async function session(request:Request,env:Env,tenant:TenantContext) {
 const input:any=await request.json(),stored=await getStoredPassword(env,tenant.tenantId,tenant);
 const password=typeof input.password==='string'?input.password.trim():'';
 if(!password||await sha256Hex(password)!==await sha256Hex(stored))throw new PaymentError('INVALID_PASSWORD',401);
 if(stored==='12345678')throw new PaymentError('PAYMENT_PIN_CHANGE_REQUIRED',409);
 const token=generateBearerToken();
 await env.DB.prepare(`INSERT INTO staff_sessions(token_hash,tenant_id,pin_hash,expires_at,created_at)
 VALUES(?,?,?,datetime('now','+8 hours'),datetime('now'))`).bind(await sha256Hex(token),tenant.tenantId,await sha256Hex(stored)).run();
 return reply({token});
}
export async function handlePaymentRoute(request:Request,env:Env,tenant:TenantContext|null|undefined,path:string):Promise<Response> {
 try {
  if(!tenant)throw new PaymentError('TENANT_REQUIRED',404);
  const tenantId=tenant.tenantId;
  if(path==='/api/payments/config'&&request.method==='GET') {
   const configured=await ready(env) && !!await env.DB.prepare('SELECT 1 FROM tenant_payment_connections WHERE tenant_id=? AND environment=?').bind(tenantId,environment(env)).first();
   return reply({linePay:{enabled:tenant.storeStatus!=='paused' && !!await paymentConnection(env,tenantId),configured,currency:'TWD',orderTypes:['takeaway']}});
  }
  if(!await ready(env))throw new PaymentError('PAYMENTS_NOT_READY',503);
  if(path==='/api/payments/attention/count'&&request.method==='GET')return reply(await paymentAttentionCount(env,tenantId));
  if(path==='/api/payments/transactions'&&request.method==='GET') {
   if(!await paymentStaffSession(request,env,tenantId))throw new PaymentError('SESSION_REQUIRED',401);
   return reply(await paymentTransactions(env,tenantId,new URL(request.url).searchParams));
  }
  if(request.method==='POST' && ['/api/payments/session','/api/payments/linepay/request'].includes(path)) {
   const window=Math.floor(Date.now()/60000),scope=tenantId+':'+path;
   const rate=await env.DB.prepare(`INSERT INTO payment_rate_limits(scope,window,count) VALUES(?,?,1)
    ON CONFLICT(scope) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count`).bind(scope,window).first<{count:number}>();
   if(!rate||rate.count>(path.endsWith('session')?10:60))throw new PaymentError('PAYMENT_RATE_LIMIT',429);
  }
  if(path==='/api/payments/session'&&request.method==='GET') {
   if(!await paymentStaffSession(request,env,tenantId))throw new PaymentError('SESSION_REQUIRED',401);
   return reply({ok:true});
  }
  if(path==='/api/payments/session'&&request.method==='POST')return await session(request,env,tenant);
  if(path==='/api/payments/linepay/request'&&request.method==='POST')return await create(request,env,tenant);
  if(path==='/api/payments/checkout'&&request.method==='GET') {
   const operation=new URL(request.url).searchParams.get('operationId')||'';
   const p=await env.DB.prepare('SELECT * FROM payments WHERE tenant_id=? AND operation_id=?').bind(tenantId,operation).first<Payment>();
   if(!p)throw new PaymentError('PAYMENT_NOT_FOUND',404);
   await customer(request,p);return reply(await customerProjection(env,p,tenant));
  }
  if(path==='/api/payments/summary'&&request.method==='GET') {
   if(!await paymentStaffSession(request,env,tenantId))throw new PaymentError('SESSION_REQUIRED',401);
   return reply(await paymentSummary(env,tenantId,new URL(request.url).searchParams));
  }
  if(path==='/api/payments/attention'&&request.method==='GET') {
   if(!await paymentStaffSession(request,env,tenantId))throw new PaymentError('SESSION_REQUIRED',401);
   const results=await paymentAttentionRows<Payment>(env,tenantId);
   return reply(results.map(projection));
  }
  const match=path.match(/^\/api\/payments\/([a-f0-9-]{36})(?:\/(confirm|refunds|reconcile|cancel))?$/);
  if(!match)throw new PaymentError('PAYMENT_ROUTE_NOT_FOUND',404);
  let p=await get(env,match[1],tenantId);
  if(match[2]==='cancel') {
   if(request.method!=='POST')throw new PaymentError('METHOD_NOT_ALLOWED',405);
   await customer(request,p);p=await cancelPayment(env,p);
   return reply({...await customerProjection(env,p,tenant),outcome:p.paid_at?'already_paid':['CANCELLED','FAILED'].includes(p.status)?'cancelled':'verifying'});
  }
  const staff=await paymentStaffSession(request,env,tenantId);
  if(match[2]==='refunds'&&request.method==='POST') {
   if(!staff)throw new PaymentError('SESSION_REQUIRED',401);
   const input:any=await request.json();
   if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000||typeof input.operationId!=='string'||input.operationId.length<16)throw new PaymentError('REFUND_REASON_REQUIRED');
   if(p.status==='PAID') {
    await env.DB.batch([
     env.DB.prepare(`INSERT OR IGNORE INTO payment_refunds(id,payment_id,tenant_id,operation_id,amount,reason,actor,status,created_at,updated_at)
      SELECT ?,id,tenant_id,?,amount,?,?,'PENDING',?,? FROM payments WHERE id=? AND status='PAID'`).bind(crypto.randomUUID(),input.operationId,input.reason.trim(),staff.tokenHash,Date.now(),Date.now(),p.id),
     env.DB.prepare("UPDATE payments SET status='REFUND_PENDING',next_attempt_at=?,updated_at=? WHERE id=? AND status='PAID' AND EXISTS(SELECT 1 FROM payment_refunds WHERE payment_id=?)").bind(Date.now(),Date.now(),p.id,p.id),
     env.DB.prepare("UPDATE orders SET updated_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE key=? AND tenant_id=?").bind(p.order_key,tenantId)]);
   } else if(!['REFUND_PENDING','REFUNDED','REFUND_FAILED'].includes(p.status))throw new PaymentError('PAYMENT_NOT_REFUNDABLE',409);
   await event(env,p.id,'REFUND_REQUESTED');
   p=await reconcilePayment(env,p.id,tenantId);
  } else if(match[2]==='reconcile'&&request.method==='POST') {
   if(!staff)throw new PaymentError('SESSION_REQUIRED',401);p=await reconcilePayment(env,p.id,tenantId);
  } else {
   if(!staff)await customer(request,p);
   if(match[2]==='confirm'&&request.method==='POST')p=await reconcilePayment(env,p.id,tenantId);
   else if(request.method!=='GET'||match[2])throw new PaymentError('METHOD_NOT_ALLOWED',405);
  }
  const result=await customerProjection(env,p,tenant);
  return reply(staff?{...result,...await paymentWorkspaceDetail(env,tenantId,p.id)}:result);
 }catch(e){const code=e instanceof Error?e.message:'PAYMENT_FAILED';console.warn('[Payment]',{code:code.slice(0,100)});
  return reply({code:e instanceof PaymentError||e instanceof PaymentWorkspaceError?e.code:code,error:code},e instanceof PaymentError||e instanceof PaymentWorkspaceError?e.status:code.startsWith('ORDER_')||code.startsWith('OPTION_')?409:500);}
}
export async function processPayments(env:Env) {
 if(!await ready(env))return;
 const {results}=await env.DB.prepare(`SELECT id,tenant_id FROM payments WHERE status IN ('REQUESTING','PENDING','CONFIRMING','UNKNOWN','REFUND_PENDING')
 AND next_attempt_at<=? AND lease_until<? ORDER BY next_attempt_at LIMIT 12`).bind(Date.now(),Date.now()).all<{id:string;tenant_id:string}>();
 for(let i=0;i<results.length;i+=4)await Promise.allSettled(results.slice(i,i+4).map(p=>reconcilePayment(env,p.id,p.tenant_id)));
}
export async function attachPayments(env:Env,tenant:string,orders:Order[]) {
 if(!orders.length||!await ready(env))return;
 for(let i=0;i<orders.length;i+=50){const chunk=orders.slice(i,i+50);
  const {results}=await env.DB.prepare(`SELECT * FROM payments WHERE tenant_id=? AND order_key IN (${chunk.map(()=>'?').join(',')})`).bind(tenant,...chunk.map(o=>o.key)).all<Payment>();
  for(const p of results){const order=chunk.find(o=>o.key===p.order_key);if(order)order.payment=projection(p);}
 }
}
