const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('../benmi-worker-official/node_modules/typescript');
const {createHmac}=require('node:crypto');
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);
const {handlePaymentRoute,reconcilePayment,attachPayments}=require('../benmi-worker-official/src/modules/payments.ts');
const {parseLinePay,linePaySignature}=require('../benmi-worker-official/src/modules/line-pay-client.ts');
const {getOrders}=require('../benmi-worker-official/src/modules/orders.ts');
const {fixture,provider,tenant}=require('./helpers/payments.cjs');
test('lossless IDs and HMAC match provider contract',async()=>{
 assert.equal(parseLinePay('{"info":{"transactionId":2023042201206549310}}').info.transactionId,'2023042201206549310');
 assert.equal(await linePaySignature('secret','/v4/payments/request','{"amount":100}','nonce'),createHmac('sha256','secret').update('secret/v4/payments/request{"amount":100}nonce').digest('base64'));
});
test('create, duplicate, authorize and publish once; pending hidden from POS',async()=>{
 const f=await fixture();const original=fetch;try{
 const calls=provider(f);const created=await f.route('/api/payments/linepay/request',f.payload);assert.equal(created.status,'PENDING');assert.equal(created.appUrl,null);
 for(const field of ['confirmUrl','cancelUrl']){const url=new URL(f.providerRequest.redirectUrls[field]);assert.equal(url.origin,'https://store.test');assert.equal(url.pathname,'/payment-result');assert.equal(url.searchParams.get('tenant_id'),'a');assert.equal(url.searchParams.get('payment_id'),created.id);assert.equal(url.searchParams.has('token'),false);}
 assert.equal(f.db.prepare('SELECT transaction_id FROM payments').get().transaction_id,'2023042201206549310');
 const live=await getOrders(new Request('https://api.test/api/orders?tenant_id=a'),f.env);assert.deepEqual(await live.json(),[]);
 const repeat=await f.route('/api/payments/linepay/request',f.payload);assert.equal(repeat.id,created.id);assert.equal(calls.filter(x=>x.endsWith('/request')).length,1);
 const paid=await f.route('/api/payments/'+created.id+'/confirm',{});assert.equal(paid.status,'PAID');assert.ok(paid.receipt);assert.equal(paid.merchant.brandName,'Store');assert.equal(paid.menuUrl,'https://store.test/?tenant_id=a');assert.equal(paid.pickupTime,f.payload.time);
 assert.equal(f.db.prepare('SELECT status FROM orders').get().status,'NEW');
 await f.route('/api/payments/'+created.id+'/confirm',{});assert.equal(calls.filter(x=>x.endsWith('/confirm')).length,1);
 assert.throws(()=>f.db.exec('UPDATE orders SET total_amount=1'),/PAYMENT_ORDER_LOCKED/);
 assert.throws(()=>f.db.exec("UPDATE orders SET status='WAITING_CUSTOMER_CHANGE'"),/PAYMENT_ORDER_LOCKED/);
 assert.throws(()=>f.db.exec('DELETE FROM order_items'),/PAYMENT_ORDER_LOCKED/);
 const list=[{key:created.orderKey}];await attachPayments(f.env,'a',list);assert.equal(list[0].payment.status,'PAID');
 }finally{global.fetch=original;f.db.close();}
});
test('pending authentication, cancellation, price tampering and cross-tenant/session access',async()=>{
 const f=await fixture();const original=fetch;try{
 provider(f,{check:'0000'});const p=await f.route('/api/payments/linepay/request',f.payload);
 assert.equal((await f.route('/api/payments/'+p.id+'/confirm',{})).status,'PENDING');
 assert.equal((await f.route('/api/payments/'+p.id,undefined,'b'.repeat(64))).status,403);
 assert.equal((await f.route('/api/payments/'+p.id,undefined,f.token,{...tenant,tenantId:'b'})).status,404);
 assert.equal((await f.route('/api/payments/linepay/request',{...f.payload,total:1})).status,409);
 provider(f,{check:'0121'});assert.equal((await f.route('/api/payments/'+p.id+'/confirm',{})).status,'CANCELLED');
 const bad=await f.route('/api/payments/linepay/request',{...f.payload,operationId:crypto.randomUUID(),total:1});assert.notEqual(bad.status,200);
 assert.equal(f.db.prepare('SELECT count(*) n FROM orders').get().n,1);
 }finally{global.fetch=original;f.db.close();}
});
test('lost Confirm response reconciles paid transaction; lost Request never issues a second charge',async()=>{
 const f=await fixture();const original=fetch;try{
 const calls=provider(f,{lostConfirm:true});const p=await f.route('/api/payments/linepay/request',f.payload);
 assert.equal((await f.route('/api/payments/'+p.id+'/confirm',{})).status,'UNKNOWN');
 assert.equal((await f.route('/api/payments/'+p.id+'/confirm',{})).status,'PAID');
 assert.equal(calls.filter(x=>x.endsWith('/confirm')).length,1);
 }finally{global.fetch=original;f.db.close();}
 const g=await fixture();try{const calls=provider(g,{lostRequest:true});const p=await g.route('/api/payments/linepay/request',g.payload);
 assert.equal(p.status,'UNKNOWN');await reconcilePayment(g.env,p.id,'a');await g.route('/api/payments/linepay/request',g.payload);
 assert.equal(calls.filter(x=>x.endsWith('/request')).length,1);
 }finally{global.fetch=original;g.db.close();}
});
test('explicit full refund is authenticated, survives timeout, never repeats POST; service status stays independent',async()=>{
 const f=await fixture();const original=fetch;try{
 const calls=provider(f,{lostRefund:true});const p=await f.route('/api/payments/linepay/request',f.payload);await f.route('/api/payments/'+p.id+'/confirm',{});
 const refundPath='/api/payments/'+p.id+'/refunds',body={operationId:crypto.randomUUID(),reason:'Unavailable'};
 assert.equal((await f.route(refundPath,body)).status,401);
 const login=await f.route('/api/payments/session',{password:'87654321'});assert.ok(login.token);
 const r=await f.route(refundPath,body,f.token,tenant,login.token);assert.equal(r.status,'REFUND_PENDING');
 assert.equal(f.db.prepare('SELECT status FROM orders').get().status,'NEW');
 assert.equal((await f.route(refundPath,body,f.token,tenant,login.token)).status,'REFUNDED');
 await f.route(refundPath,body,f.token,tenant,login.token);assert.equal(calls.filter(x=>x.endsWith('/refund')).length,1);
 }finally{global.fetch=original;f.db.close();}
});
test('two concurrent callbacks publish once; disabling new requests keeps reconciliation working',async()=>{
 const f=await fixture();const original=fetch;try{
 const calls=provider(f);const p=await f.route('/api/payments/linepay/request',f.payload);
 f.db.exec('UPDATE tenant_payment_connections SET enabled=0');
 const results=await Promise.all([reconcilePayment(f.env,p.id,'a'),reconcilePayment(f.env,p.id,'a')]);
 assert.ok(results.some(x=>x.status==='PAID'));assert.equal(calls.filter(x=>x.endsWith('/confirm')).length,1);
 assert.equal(f.db.prepare("SELECT count(*) n FROM payment_events WHERE event='publish'").get().n,1);
 }finally{global.fetch=original;f.db.close();}
});
test('publication failure after provider capture rolls back, then recovers once',async()=>{
 const f=await fixture();const original=fetch;try{
 const calls=provider(f);const p=await f.route('/api/payments/linepay/request',f.payload);
 f.db.exec("CREATE TRIGGER fail_release BEFORE UPDATE ON orders WHEN NEW.status='NEW' BEGIN SELECT RAISE(ABORT,'INJECTED'); END;");
 assert.equal((await f.route('/api/payments/'+p.id+'/confirm',{})).status,'UNKNOWN');
 assert.equal(f.db.prepare('SELECT status FROM orders').get().status,'PENDING_PAYMENT');
 assert.equal(f.db.prepare('SELECT paid_at FROM payments').get().paid_at,null);
 f.db.exec('DROP TRIGGER fail_release');
 assert.equal((await f.route('/api/payments/'+p.id+'/confirm',{})).status,'PAID');
 assert.equal(calls.filter(x=>x.endsWith('/confirm')).length,1);
 assert.equal(f.db.prepare("SELECT count(*) n FROM payment_events WHERE event='publish'").get().n,1);
 }finally{global.fetch=original;f.db.close();}
});
test('stale worker cannot publish; bad PIN is rate limited and refund across tenant is forbidden',async()=>{
 const f=await fixture();const original=fetch;try{
 provider(f);const p=await f.route('/api/payments/linepay/request',f.payload);
 assert.throws(()=>f.db.prepare("INSERT INTO payment_events(payment_id,event,result_code,created_at) VALUES(?,'publish','stale',?)").run(p.id,Date.now()),/PAYMENT_LEASE_LOST/);
 for(let i=0;i<10;i++)assert.equal((await f.route('/api/payments/session',{password:'wrong'})).status,401);
 assert.equal((await f.route('/api/payments/session',{password:'wrong'})).status,429);
 assert.equal((await f.route('/api/payments/'+p.id+'/refunds',{operationId:crypto.randomUUID(),reason:'x'},f.token,{...tenant,tenantId:'b'})).status,404);
 }finally{global.fetch=original;f.db.close();}
});
test('verified LINE identity gets an atomic paid receipt; client userId cannot choose recipient',async()=>{
 const f=await fixture();const original=fetch;try{
 provider(f);const providerFetch=fetch;
 global.fetch=async(url,opts)=>String(url).includes('/oauth2/v2.1/verify')?new Response(JSON.stringify({client_id:'123',expires_in:1000})):
 String(url).includes('/v2/profile')?new Response(JSON.stringify({userId:'U'+'a'.repeat(32)})):providerFetch(url,opts);
 const ctx={...tenant,liffId:'123-example'};
 const p=await f.route('/api/payments/linepay/request',{...f.payload,lineAccessToken:'verified-token',userId:'U'+'b'.repeat(32)},f.token,ctx);
 await f.route('/api/payments/'+p.id+'/confirm',{},f.token,ctx);
 const receipt=f.db.prepare('SELECT user_id,contents_json FROM line_order_receipts').get();
 assert.equal(receipt.user_id,'U'+'a'.repeat(32));assert.match(receipt.contents_json,/LINE Pay · 已付款/);
 assert.doesNotMatch(JSON.stringify(f.db.prepare('SELECT * FROM payments').get()),/verified-token/);
 await f.route('/api/payments/'+p.id+'/confirm',{},f.token,ctx);
 assert.equal(f.db.prepare('SELECT count(*) n FROM line_order_receipts').get().n,1);
 }finally{global.fetch=original;f.db.close();}
});
test('payment sessions validate current PIN, distinguish default PIN, and reject stale or cross-tenant sessions',async()=>{
 const f=await fixture();try{
  let stored='87654321';const oldGet=f.env.ORDER_STATE.get;
  f.env.ORDER_STATE.get=async key=>key.endsWith(':password')?stored:oldGet(key);
  assert.equal((await f.route('/api/payments/session')).status,401);
  const login=await f.route('/api/payments/session',{password:' 87654321 '});assert.ok(login.token);
  const session=await f.route('/api/payments/session',undefined,f.token,tenant,login.token);assert.equal(session.ok,true);
  assert.equal((await f.route('/api/payments/session',undefined,f.token,{...tenant,tenantId:'b'},login.token)).status,401);
  stored='87654322';
  assert.equal((await f.route('/api/payments/session',undefined,f.token,tenant,login.token)).status,401);
  const fresh=await f.route('/api/payments/session',{password:stored});assert.ok(fresh.token);
  f.db.exec("UPDATE staff_sessions SET revoked_at=datetime('now')");
  assert.equal((await f.route('/api/payments/session',undefined,f.token,tenant,fresh.token)).status,401);
  stored='12345678';
  const defaultLogin=await f.route('/api/payments/session',{password:stored});
  assert.equal(defaultLogin.status,409);assert.equal(defaultLogin.code,'PAYMENT_PIN_CHANGE_REQUIRED');
  assert.equal((await f.route('/api/payments/session',{password:'wrong'})).status,401);
 }finally{f.db.close();}
});
test('cancel fences pending checkout, lookup is read-only and old callbacks cannot capture',async()=>{
 const f=await fixture(),original=fetch;try{
  const calls=provider(f,{check:'0000'}),p=await f.route('/api/payments/linepay/request',f.payload);
  const lookup=await handlePaymentRoute(new Request('https://api.test/api/payments/checkout?operationId='+f.payload.operationId,{headers:{'X-Payment-Token':f.token}}),f.env,tenant,'/api/payments/checkout');
  assert.equal((await lookup.json()).id,p.id);assert.equal(calls.length,1);
  assert.equal((await f.route('/api/payments/'+p.id+'/cancel',{},'b'.repeat(64))).status,403);
  assert.equal((await f.route('/api/payments/'+p.id+'/cancel',{},f.token,{...tenant,tenantId:'b'})).status,404);
  const cancelled=await f.route('/api/payments/'+p.id+'/cancel',{});assert.equal(cancelled.outcome,'cancelled');assert.equal(cancelled.status,'CANCELLED');assert.equal(cancelled.paymentUrl,null);
  assert.equal((await f.route('/api/payments/'+p.id+'/cancel',{})).outcome,'cancelled');
  const after=provider(f);await Promise.all([reconcilePayment(f.env,p.id,'a'),f.route('/api/payments/'+p.id+'/confirm',{})]);
  assert.equal(after.length,0);assert.equal(f.db.prepare('SELECT status FROM orders').get().status,'PENDING_PAYMENT');
  assert.throws(()=>f.db.prepare("UPDATE payments SET status='PENDING' WHERE id=?").run(p.id),/PAYMENT_CANCELLED/);
  assert.equal(f.db.prepare("SELECT count(*) n FROM payment_events WHERE event='publish'").get().n,0);
 }finally{fetch=original;f.db.close();}
});
test('cancel wins while Request or authentication query is in flight',async()=>{
 for(const phase of ['request','check']){
  const f=await fixture(),original=fetch;try{
   provider(f);const baseFetch=fetch;let release,entered;
   const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let confirms=0;
   global.fetch=async(url,options)=>{const response=await baseFetch(url,options);if(new URL(url).pathname.endsWith('/confirm'))confirms++;if(new URL(url).pathname.endsWith('/'+phase)){entered();await gate;}return response;};
   let p,work;
   if(phase==='request'){work=f.route('/api/payments/linepay/request',f.payload);await started;p=f.db.prepare('SELECT * FROM payments').get();}
   else {p=await f.route('/api/payments/linepay/request',f.payload);work=f.route('/api/payments/'+p.id+'/confirm',{});await started;}
   assert.equal((await f.route('/api/payments/'+p.id+'/cancel',{})).outcome,'cancelled');release();await work;
   assert.equal(confirms,0);assert.equal(f.db.prepare('SELECT status FROM payments').get().status,'CANCELLED');
  }finally{fetch=original;f.db.close();}
 }
});
test('Confirm wins cancellation race: stay verifying, recover capture once, never auto-refund',async()=>{
 const f=await fixture(),original=fetch;try{
  const calls=provider(f);const baseFetch=fetch;let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
  global.fetch=async(url,options)=>{const response=await baseFetch(url,options);if(new URL(url).pathname.endsWith('/confirm')){entered();await gate;}return response;};
  const p=await f.route('/api/payments/linepay/request',f.payload);const confirming=f.route('/api/payments/'+p.id+'/confirm',{});await started;
  assert.ok(f.db.prepare('SELECT confirmation_started_at FROM payments').get().confirmation_started_at);
  const cancel=await f.route('/api/payments/'+p.id+'/cancel',{});assert.equal(cancel.outcome,'verifying');assert.ok(cancel.cancelRequestedAt);
  release();assert.equal((await confirming).status,'PAID');assert.equal((await f.route('/api/payments/'+p.id+'/cancel',{})).outcome,'already_paid');
  assert.equal(calls.filter(p=>p.endsWith('/confirm')).length,1);assert.equal(calls.filter(p=>p.endsWith('/refund')).length,0);
  assert.equal(f.db.prepare('SELECT status FROM orders').get().status,'NEW');
 }finally{fetch=original;f.db.close();}
});
test('legacy and missing Confirm responses cannot be treated as safe local cancellation',async()=>{
 for(const legacy of [true,false]){
  const f=await fixture(),original=fetch;try{
   const calls=provider(f);const p=await f.route('/api/payments/linepay/request',f.payload);
   f.db.prepare('UPDATE payments SET confirmation_guard_version=?,confirmation_started_at=?,status=? WHERE id=?').run(legacy?0:1,legacy?null:Date.now(),'UNKNOWN',p.id);
   assert.equal((await f.route('/api/payments/'+p.id+'/cancel',{})).outcome,'verifying');
   await f.route('/api/payments/'+p.id+'/confirm',{});assert.equal(calls.filter(p=>p.endsWith('/confirm')).length,0);
   provider(f,{check:'0121'});assert.equal((await f.route('/api/payments/'+p.id+'/confirm',{})).status,'CANCELLED');
  }finally{fetch=original;f.db.close();}
 }
});

test('live merchant stays blocked by default; dev opt-in preserves environment isolation',async()=>{
 const original=fetch;
 try{
  for(const [buildEnvironment,optIn,expected] of [['dev',undefined,503],['dev','false',503],['dev','true',200],['staging','true',503],['production',undefined,200]]){
   const f=await fixture();try{
    if(buildEnvironment!=='dev'){
     const row=f.db.prepare('SELECT * FROM tenant_payment_connections').get();
     const iv=crypto.getRandomValues(new Uint8Array(12));
     const key=await crypto.subtle.importKey('raw',Buffer.from(JSON.parse(f.env.PAYMENT_SECRET_KEYS).v1,'base64'),'AES-GCM',false,['encrypt']);
     const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(JSON.stringify(['benmi-payment-v1',buildEnvironment,'a',row.id]))},key,new TextEncoder().encode('test-secret'));
     f.db.prepare('UPDATE tenant_payment_connections SET environment=?,encrypted_secret=?').run(buildEnvironment,'v1.'+Buffer.from(iv).toString('base64')+'.'+Buffer.from(data).toString('base64'));
    }
    f.env.BUILD_ENVIRONMENT=buildEnvironment;f.env.PAYMENT_ALLOW_LIVE_IN_DEV=optIn;
    f.db.exec("UPDATE tenant_payment_connections SET mode='production'");
    const calls=provider(f);
    const result=await f.route('/api/payments/linepay/request',f.payload);
    assert.equal(result.status=== 'PENDING'?200:result.status,expected);
    assert.equal(calls.filter(p=>p.endsWith('/request')).length,expected===200?1:0);
    if(buildEnvironment==='dev'&&expected===200){
     f.env.BUILD_ENVIRONMENT='staging';
     const before=calls.length;
     assert.equal((await f.route('/api/payments/'+result.id+'/confirm',{})).status,'UNKNOWN');
     assert.equal(calls.length,before,'Dev opt-in must not permit provider calls with a mismatched environment');
    }
   }finally{f.db.close();}
  }
 }finally{global.fetch=original;}
});
