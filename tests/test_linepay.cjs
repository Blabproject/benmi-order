const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('../benmi-worker-official/node_modules/typescript');
const {createHmac}=require('node:crypto');
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);
const {fixture:menuFixture}=require('./helpers/option-groups.cjs');
const {handlePaymentRoute,reconcilePayment,attachPayments}=require('../benmi-worker-official/src/modules/payments.ts');
const {parseLinePay,linePaySignature}=require('../benmi-worker-official/src/modules/line-pay-client.ts');
const {getOrders}=require('../benmi-worker-official/src/modules/orders.ts');
const tenant={tenantId:'a',brandName:'Store',defaultPassword:'87654321',features:[],liffId:'',storeStatus:'open',orderPrefix:'A'};
async function fixture(){
 const f=menuFixture();
 f.db.exec(`ALTER TABLE menu_categories ADD COLUMN pricing_rules TEXT;
 ALTER TABLE menu_items ADD COLUMN max_per_order INTEGER;
 CREATE TABLE orders(key TEXT PRIMARY KEY,order_id TEXT,display_key TEXT,business_date TEXT,uuid TEXT,
 tenant_id TEXT,user_id TEXT,customer_name TEXT,pickup_time TEXT,status TEXT,total_amount REAL,order_content TEXT,
 reason TEXT,note TEXT,dining_option TEXT,table_number TEXT,table_id TEXT,source TEXT,revision INTEGER DEFAULT 0,legacy_key TEXT,
 round_count INTEGER DEFAULT 1,last_appended_at TEXT,created_at TEXT,updated_at TEXT,is_modified INTEGER DEFAULT 0);
 CREATE UNIQUE INDEX order_uuid ON orders(tenant_id,uuid);
 CREATE TABLE tenant_lifecycle(tenant_id TEXT PRIMARY KEY,state TEXT);
 INSERT INTO tenant_lifecycle VALUES('a','active'),('b','active');
 CREATE TABLE daily_order_counters(tenant_id TEXT,order_date TEXT,dining_option TEXT,last_seq INTEGER,PRIMARY KEY(tenant_id,order_date,dining_option));
 CREATE TABLE staff_sessions(token_hash TEXT PRIMARY KEY,tenant_id TEXT,pin_hash TEXT,expires_at TEXT,created_at TEXT,revoked_at TEXT);
 `);
 for(const name of ['0032_create_order_items.sql','0065_line_order_receipts.sql','0069_order_detail_snapshots.sql','0075_line_pay_v4.sql'])f.db.exec(fs.readFileSync('benmi-worker-official/migrations/'+name,'utf8'));
 // Real SQLite, with D1 metadata and atomic batches.
 f.env.DB={prepare(sql){let args=[];const s={bind(...a){args=a;return s;},async first(){return f.db.prepare(sql).get(...args)||null;},async all(){return {results:f.db.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(f.db.prepare(sql).run(...args).changes)}}},sql,get args(){return args;}};return s;},async batch(statements){f.db.exec('BEGIN');try{const out=statements.map(s=>/^\s*SELECT/i.test(s.sql)?{success:true,results:f.db.prepare(s.sql).all(...s.args)}:{success:true,meta:{changes:Number(f.db.prepare(s.sql).run(...s.args).changes)}});f.db.exec('COMMIT');return out;}catch(e){f.db.exec('ROLLBACK');throw e;}}};
 f.env.BUILD_ENVIRONMENT='dev';
 f.env.ORDER_STATE={get:async key=>key.endsWith(':password')?'87654321':key.endsWith(':config_cache')?JSON.stringify(tenant):null,put:async()=>{},delete:async()=>{}};
 const material=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12)),id=crypto.randomUUID();
 f.env.PAYMENT_SECRET_KEYS=JSON.stringify({v1:Buffer.from(material).toString('base64')});
 const key=await crypto.subtle.importKey('raw',material,'AES-GCM',false,['encrypt']);
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(JSON.stringify(['benmi-payment-v1','dev','a',id]))},key,new TextEncoder().encode('test-secret'));
 f.db.prepare('INSERT INTO tenant_payment_connections VALUES(?,?,?,?,?,?,?,?,1,?)').run(id,'a','dev','sandbox','123','v1.'+Buffer.from(iv).toString('base64')+'.'+Buffer.from(encrypted).toString('base64'),'v1','https://store.test/?tenant_id=a',Date.now());
 f.token='a'.repeat(64);f.payload={detailVersion:1,operationId:crypto.randomUUID(),dining_option:'takeaway',total:100,items:[{itemId:'a_main',quantity:1}],orderSelections:[],customer:'Guest',time:'2026-11-01 12:00'};
 f.route=async(path,body,token=f.token,ctx=tenant,staff)=>{
 const res=await handlePaymentRoute(new Request('https://api.test'+path,{method:body===undefined?'GET':'POST',headers:{'X-Payment-Token':token,...(staff?{Authorization:'Bearer '+staff}:{})},body:body===undefined?undefined:JSON.stringify(body)}),f.env,ctx,path);
 return {status:res.status,...await res.json()};};
 f.db.closeOriginal=f.db.close;return f;
}
function provider(f,{check='0110',lostConfirm=false,lostRequest=false,lostRefund=false}={}){
 const calls=[];let paid=false,refunded=false;
 global.fetch=async(url,options)=>{
 const path=new URL(url).pathname;calls.push(path);
 const out=data=>new Response(JSON.stringify(data));
 if(path.endsWith('/request')){if(lostRequest)throw Error('network');return new Response('{"returnCode":"0000","info":{"transactionId":2023042201206549310,"paymentUrl":{"web":"https://sandbox-web-pay.line.me/web/payment/test","app":"line://pay/payment/test"}}}');}
 const p=f.db.prepare('SELECT * FROM payments').get();
 if(path.endsWith('/check'))return out({returnCode:check});
 if(path.endsWith('/confirm')){paid=true;if(lostConfirm)throw Error('network');return out({returnCode:'0000',info:{orderId:p.provider_order_id,transactionId:p.transaction_id}});}
 if(path.endsWith('/refund')){refunded=true;if(lostRefund)throw Error('network');return out({returnCode:'0000',info:{refundTransactionId:'2023042201206549311'}});}
 return out({returnCode:'0000',info:paid?[{orderId:p.provider_order_id,currency:'TWD',transactionType:'PAYMENT',transactionId:p.transaction_id,payInfo:[{amount:100}],refundList:refunded?[{refundAmount:-100}]:[]}]:[]});
 };return calls;
}
test('lossless IDs and HMAC match provider contract',async()=>{
 assert.equal(parseLinePay('{"info":{"transactionId":2023042201206549310}}').info.transactionId,'2023042201206549310');
 assert.equal(await linePaySignature('secret','/v4/payments/request','{"amount":100}','nonce'),createHmac('sha256','secret').update('secret/v4/payments/request{"amount":100}nonce').digest('base64'));
});
test('create, duplicate, authorize and publish once; pending hidden from POS',async()=>{
 const f=await fixture();const original=fetch;try{
 const calls=provider(f);const created=await f.route('/api/payments/linepay/request',f.payload);assert.equal(created.status,'PENDING');assert.equal(created.appUrl,null);
 assert.equal(f.db.prepare('SELECT transaction_id FROM payments').get().transaction_id,'2023042201206549310');
 const live=await getOrders(new Request('https://api.test/api/orders?tenant_id=a'),f.env);assert.deepEqual(await live.json(),[]);
 const repeat=await f.route('/api/payments/linepay/request',f.payload);assert.equal(repeat.id,created.id);assert.equal(calls.filter(x=>x.endsWith('/request')).length,1);
 const paid=await f.route('/api/payments/'+created.id+'/confirm',{});assert.equal(paid.status,'PAID');assert.ok(paid.receipt);
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
