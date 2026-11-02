// Shared real SQLite fixtures; provider responses are synthetic and never reach LINE Pay.
const fs=require('node:fs');
const ts=require('../../benmi-worker-official/node_modules/typescript');
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);
const {fixture:menuFixture}=require('./option-groups.cjs');
const {handlePaymentRoute}=require('../../benmi-worker-official/src/modules/payments.ts');
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
 for(const name of ['0032_create_order_items.sql','0065_line_order_receipts.sql','0069_order_detail_snapshots.sql','0075_line_pay_v4.sql','0076_payment_cancellation.sql','0077_payment_workspace_indexes.sql'])f.db.exec(fs.readFileSync('benmi-worker-official/migrations/'+name,'utf8'));
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
 const connection=f.db.prepare('SELECT id FROM tenant_payment_connections').get().id;
 let sequence=0;
 f.seed=(options={})=>{
  const n=++sequence,id=crypto.randomUUID(),key=options.orderKey||'order-'+n;
  const created=options.createdAt??Date.now(),status=options.status||'PAID';
  f.db.prepare(`INSERT INTO orders(key,tenant_id,display_key,status,total_amount,order_content,created_at,updated_at)
    VALUES(?,?,?,?,?,'Meal',datetime('now'),datetime('now'))`).run(key,'a',options.displayKey||'DEMO-'+n,options.orderStatus||'NEW',options.amount||100);
  f.db.prepare(`INSERT INTO payments(id,tenant_id,order_key,connection_id,operation_id,request_hash,capability_hash,provider_order_id,
    transaction_id,amount,status,paid_at,refunded_at,created_at,updated_at,next_attempt_at,cancel_requested_at,confirmation_started_at)
    VALUES(?,'a',?,?,?,'private-request','private-capability',?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id,key,connection,crypto.randomUUID(),'provider-'+n,options.transactionId??('20230422012065493'+n),options.amount||100,status,
      options.paidAt??(status==='PAID'?created:null),options.refundedAt??null,created,options.updatedAt??created,created,options.cancelAt??null,options.confirmAt??null);
  if(options.refundAt!==undefined){
    f.db.prepare(`INSERT INTO payment_refunds(id,payment_id,tenant_id,operation_id,amount,reason,actor,status,created_at,updated_at,result_code)
      VALUES(?,?,'a',?,?,'Unavailable','private-actor',?,?,?,?)`)
      .run(crypto.randomUUID(),id,crypto.randomUUID(),options.amount||100,options.refundStatus||(status==='REFUND_FAILED'?'FAILED':'PENDING'),options.refundAt,options.refundAt,status==='REFUND_FAILED'?'1163':null);
  }
  return id;
 };
 f.db.closeOriginal=f.db.close;return f;
}
function provider(f,{check='0110',lostConfirm=false,lostRequest=false,lostRefund=false}={}){
 const calls=[];let paid=false,refunded=false;
 global.fetch=async(url,options)=>{
 const path=new URL(url).pathname;calls.push(path);
 const out=data=>new Response(JSON.stringify(data));
 if(path.endsWith('/request')){f.providerRequest=JSON.parse(options.body);if(lostRequest)throw Error('network');return new Response('{"returnCode":"0000","info":{"transactionId":2023042201206549310,"paymentUrl":{"web":"https://sandbox-web-pay.line.me/web/payment/test","app":"line://pay/payment/test"}}}');}
 const p=f.db.prepare('SELECT * FROM payments').get();
 if(path.endsWith('/check'))return out({returnCode:check});
 if(path.endsWith('/confirm')){paid=true;if(lostConfirm)throw Error('network');return out({returnCode:'0000',info:{orderId:p.provider_order_id,transactionId:p.transaction_id}});}
 if(path.endsWith('/refund')){refunded=true;if(lostRefund)throw Error('network');return out({returnCode:'0000',info:{refundTransactionId:'2023042201206549311'}});}
 return out({returnCode:'0000',info:paid?[{orderId:p.provider_order_id,currency:'TWD',transactionType:'PAYMENT',transactionId:p.transaction_id,payInfo:[{amount:100}],refundList:refunded?[{refundAmount:-100}]:[]}]:[]});
 };return calls;
}

module.exports={fixture,provider,tenant};
