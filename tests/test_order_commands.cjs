const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/staff-ordering.cjs');
const {handleOrderCommand}=require('../benmi-worker-official/src/modules/order-commands.ts');
async function setup(t){
 const f=await fixture(t);
 const created=await f.call('/api/staff/orders',f.input(),f.token);
 assert.equal(created.http,201,JSON.stringify(created));
 const input=(extra={})=>({operationId:crypto.randomUUID(),expectedRevision:created.revision,action:'complete',...extra});
 const call=async(body,token=f.token,tenant='a',key=created.key,env=f.env)=>{
 const res=await handleOrderCommand(new Request('https://local.test/api/orders/'+key+'/commands',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),env,tenant,key);
 return {http:res.status,...await res.json()};};
 const count=async table=>(await f.DB.prepare('SELECT count(*) n FROM '+table+' WHERE order_key=?').bind(created.key).first()).n;
 return {...f,created,input,command:call,count};
}
test('completion commits once and never manufactures cash',async t=>{
 const f=await setup(t),body=f.input();
 const first=await f.command(body);assert.equal(first.http,200,JSON.stringify(first));assert.equal(first.status,'COMPLETED');
 const retry=await f.command(body);assert.equal(retry.idempotent,true);assert.equal(retry.revision,first.revision);
 assert.equal(await f.count('order_commands'),1);assert.equal(await f.count('order_completions'),1);assert.equal(await f.count('manual_payment_entries'),0);
 const row=await f.DB.prepare('SELECT status,revision FROM orders WHERE key=?').bind(f.created.key).first();assert.equal(row.status,'COMPLETED');
});
test('explicit collection plus completion are atomic and refund preserves service history',async t=>{
 const f=await setup(t),body=f.input({settlement:{mode:'confirm_manual',amountMinor:10000,currency:'TWD',method:'cash'}});
 const first=await f.command(body);assert.equal(first.http,200,JSON.stringify(first));assert.equal(first.settlementRecorded,'collected');
 const refund=f.input({expectedRevision:first.revision,action:'refund_manual',reason:'Customer refund'});
 const result=await f.command(refund);assert.equal(result.http,200,JSON.stringify(result));assert.equal(result.status,'COMPLETED');
 assert.equal((await f.command(refund)).idempotent,true);
 assert.equal(await f.count('manual_payment_entries'),2);assert.equal(await f.count('order_completions'),1);
 assert.equal((await f.command({...refund,operationId:crypto.randomUUID(),expectedRevision:result.revision})).code,'MANUAL_REFUND_INVALID');
});
test('parallel same operation returns one durable result',async t=>{
 const f=await setup(t),body=f.input();
 const results=await Promise.all(Array.from({length:8},()=>f.command(body)));
 assert.ok(results.every(r=>r.http===200),JSON.stringify(results));assert.equal(await f.count('order_commands'),1);assert.equal(await f.count('order_completions'),1);
});
test('competing operations on one revision cannot double complete or collect',async t=>{
 const f=await setup(t);
 const results=await Promise.all(Array.from({length:8},()=>f.command(f.input({settlement:{mode:'confirm_manual',amountMinor:10000,currency:'TWD',method:'cash'}}))));
 assert.equal(results.filter(r=>r.http===200).length,1,JSON.stringify(results));assert.ok(results.every(r=>r.http===200||r.http===409));
 assert.equal(await f.count('order_commands'),1);assert.equal(await f.count('manual_payment_entries'),1);
});
test('failure after status update rolls back status, receipt, completion and replay record',async t=>{
 const f=await setup(t);
 await f.apply("CREATE TRIGGER inject_receipt_failure BEFORE INSERT ON manual_payment_entries BEGIN SELECT RAISE(ABORT,'INJECTED_TEST_FAILURE'); END;");
 const body=f.input({settlement:{mode:'confirm_manual',amountMinor:10000,currency:'TWD',method:'cash'}});
 assert.equal((await f.command(body)).http,500);
 assert.equal((await f.DB.prepare('SELECT status FROM orders WHERE key=?').bind(f.created.key).first()).status,'ACCEPTED');
 for(const table of ['order_commands','order_completions','manual_payment_entries'])assert.equal(await f.count(table),0);
 await f.apply('DROP TRIGGER inject_receipt_failure;');assert.equal((await f.command(body)).http,200);
});
test('authorization, tenant isolation and input validation fail before writes',async t=>{
 const f=await setup(t),body=f.input();
 assert.equal((await f.command(body,null)).http,401);assert.equal((await f.command(body,f.token,'b')).http,401);
 assert.equal((await f.command({...body,expectedRevision:body.expectedRevision+1})).code,'ORDER_REVISION_CONFLICT');
 assert.equal((await f.command({...body,action:'PAID'})).http,400);
 assert.equal((await f.command({...body,actor:'payment'})).http,400);
 assert.equal((await f.command({...body,settlement:{mode:'confirm_manual',amountMinor:999,currency:'TWD',method:'cash'}})).code,'SETTLEMENT_AMOUNT_MISMATCH');
 assert.equal(await f.count('order_commands'),0);
 assert.equal((await f.command(body)).http,200);
 assert.equal((await f.command({...body,action:'cancel',reason:'Different operation'})).code,'OPERATION_ID_REUSED');
});
test('revocation between read and commit aborts the entire batch',async t=>{
 const f=await setup(t);
 const env={...f.env,DB:{prepare:(...args)=>f.DB.prepare(...args),batch:async statements=>{
 await f.DB.prepare("UPDATE staff_sessions SET revoked_at=datetime('now') WHERE tenant_id='a'").run();return f.DB.batch(statements);
 }}};
 const result=await f.command(f.input(),f.token,'a',f.created.key,env);
 assert.equal(result.code,'ORDER_SESSION_EXPIRED',JSON.stringify(result));assert.equal(await f.count('order_commands'),0);
});
test('pending action inserted between read and commit blocks completion',async t=>{
 const f=await setup(t);
 const env={...f.env,DB:{prepare:(...args)=>f.DB.prepare(...args),batch:async statements=>{
 await f.DB.prepare("INSERT INTO pending_actions(tenant_id,user_id,order_key,action_type,question_text) VALUES('a','synthetic',?,'CHANGE','Test')").bind(f.created.key).run();return f.DB.batch(statements);
 }}};
 const result=await f.command(f.input(),f.token,'a',f.created.key,env);
 assert.equal(result.code,'PENDING_ACTION_UNRESOLVED',JSON.stringify(result));assert.equal(await f.count('order_commands'),0);
});
test('terminal direct SQL cannot change money, status or item projection',async t=>{
 const f=await setup(t);assert.equal((await f.command(f.input())).http,200);
 for(const sql of ["UPDATE orders SET status='NEW',revision=revision+1 WHERE key=?","UPDATE orders SET total_amount=999,revision=revision+1 WHERE key=?","DELETE FROM order_items WHERE order_key=?"])
 await assert.rejects(()=>f.DB.prepare(sql).bind(f.created.key).run(),/ORDER_FINALIZED/);
 await assert.rejects(()=>f.DB.prepare("UPDATE order_completions SET amount=999 WHERE order_key=?").bind(f.created.key).run(),/COMPLETION_IMMUTABLE/);
});
test('provider state changing between read and commit prevents delivery and manual collection',async t=>{
 const f=await setup(t);
 await f.DB.prepare(`INSERT INTO tenant_payment_connections(id,tenant_id,environment,mode,channel_id,encrypted_secret,key_version,return_url,created_at)
 VALUES('conn','a','dev','sandbox','synthetic','unused','v1','https://example.invalid',0)`).run();
 // Synthetic paid record. Provider is never called.
 await f.DB.prepare(`INSERT INTO payments(id,tenant_id,order_key,connection_id,operation_id,request_hash,capability_hash,provider_order_id,amount,status,paid_at,next_attempt_at,created_at,updated_at)
 VALUES('payment','a',?,'conn','payment-operation','hash','token','provider-order',100,'PAID',1,0,1,1)`).bind(f.created.key).run();
 const env={...f.env,DB:{prepare:(...args)=>f.DB.prepare(...args),batch:async statements=>{
 await f.DB.prepare("UPDATE payments SET status='REFUND_PENDING',updated_at=2 WHERE id='payment'").run();return f.DB.batch(statements);
 }}};
 const result=await f.command(f.input(),f.token,'a',f.created.key,env);
 assert.equal(result.code,'ORDER_PAYMENT_CONFLICT',JSON.stringify(result));assert.equal(await f.count('order_commands'),0);
 assert.equal((await f.command(f.input({settlement:{mode:'confirm_manual',amountMinor:10000,currency:'TWD',method:'cash'}}))).code,'PAYMENT_RECONCILIATION_REQUIRED');
});
test('late legacy detail write invalidates the read revision even at the same price',async t=>{
 const f=await setup(t);
 // This is a legacy-origin order, whose former writer did not advance revision.
 await f.DB.prepare("UPDATE orders SET source='legacy',revision=revision+1 WHERE key=?").bind(f.created.key).run();
 const row=await f.DB.prepare('SELECT revision FROM orders WHERE key=?').bind(f.created.key).first();
 const env={...f.env,DB:{prepare:(...args)=>f.DB.prepare(...args),batch:async statements=>{
 await f.DB.prepare("UPDATE orders SET order_content='Different items, same price' WHERE key=?").bind(f.created.key).run();return f.DB.batch(statements);
 }}};
 const result=await f.command(f.input({expectedRevision:row.revision}),f.token,'a',f.created.key,env);
 assert.equal(result.code,'ORDER_REVISION_CONFLICT',JSON.stringify(result));assert.equal(await f.count('order_completions'),0);
});
