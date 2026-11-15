const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/staff-ordering.cjs');
const {resolvePendingOrder}=require('../benmi-worker-official/src/modules/order-pending-actions.ts');
const {handleOrderCommand}=require('../benmi-worker-official/src/modules/order-commands.ts');
async function setup(t) {
 const f=await fixture(t);
 // Synthetic customer order, with no remote calls or restaurant seed replay.
 await f.DB.prepare("INSERT INTO orders(key,tenant_id,user_id,customer_name,status,pickup_time,total_amount,order_content) VALUES('pending-order','a','owner','Customer','NEW','2026-11-14 12:00',100,'Original items')").run();
 const propose=async(reason='時間需調整')=>{
 await f.DB.prepare("INSERT INTO pending_actions(tenant_id,user_id,order_key,action_type,question_text,reason,note) VALUES('a','owner','pending-order','CHANGE','Confirm',?,'13:00') ON CONFLICT(tenant_id,user_id,order_key) DO UPDATE SET reason=excluded.reason,note=excluded.note").bind(reason).run();
 return f.DB.prepare("SELECT * FROM pending_actions WHERE order_key='pending-order'").first();
 };
 const p=await propose();
 const resolve=(decision='accept_time',id=p.action_id,env=f.env,user='owner',tenant='a',time=Date.now(),text='')=>resolvePendingOrder(env,tenant,'pending-order',user,id,decision,time,text);
 const order=()=>f.DB.prepare("SELECT * FROM orders WHERE key='pending-order'").first();
 return {...f,p,propose,resolve,order};
}
test('proposal is bound to customer, tenant, identity and event age',async t=>{
 const f=await setup(t);
 assert.match(f.p.action_id,/^[a-f0-9]{32}$/);assert.ok(f.p.created_ms>0);
 assert.equal(await f.resolve('accept_time',f.p.action_id,f.env,'intruder'),false);
 assert.equal(await f.resolve('accept_time',f.p.action_id,f.env,'owner','b'),false);
 assert.equal(await f.resolve('accept_time',''),false);
 assert.equal(await f.resolve('accept_time',f.p.action_id,f.env,'owner','a',f.p.created_ms-1),false);
 const newer=await f.propose();assert.notEqual(newer.action_id,f.p.action_id);
 assert.equal(await f.resolve(),false);
 assert.equal(await f.resolve('accept_time',newer.action_id),true);
 assert.equal((await f.order()).pickup_time,'2026-11-14 13:00');
});
test('duplicate callbacks commit once; contradictory callbacks cannot replay',async t=>{
 const f=await setup(t);
 const results=await Promise.all(Array.from({length:6},()=>f.resolve()));
 assert.ok(results.every(Boolean));assert.equal((await f.order()).revision,1);
 assert.equal(await f.resolve('cancel'),false);
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM order_pending_resolutions').first()).n,1);
});
test('revision race rolls back resolution and keeps pending proposal',async t=>{
 const f=await setup(t);
 const env={...f.env,DB:{prepare:(...a)=>f.DB.prepare(...a),batch:async stmts=>{
 await f.DB.prepare("UPDATE orders SET pickup_time='2026-11-14 14:00' WHERE key='pending-order'").run();return f.DB.batch(stmts);
 }}};
 assert.equal(await f.resolve('accept_time',f.p.action_id,env),false);
 assert.equal((await f.order()).pickup_time,'2026-11-14 14:00');
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM order_pending_resolutions').first()).n,0);
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM pending_actions').first()).n,1);
});
test('terminal order and expired proposal cannot be reopened',async t=>{
 const f=await setup(t);
 await f.DB.prepare("UPDATE pending_actions SET expires_ms=1 WHERE order_key='pending-order'").run();
 assert.equal(await f.resolve(),false);
 const newer=await f.propose();
 await f.DB.prepare("UPDATE orders SET status='CANCELLED' WHERE key='pending-order'").run();
 assert.equal(await f.resolve('accept_time',newer.action_id),false);
 assert.equal((await f.order()).status,'CANCELLED');
});
test('customer text keeps priced items intact and blocks fulfillment until staff review',async t=>{
 const f=await setup(t),p=await f.propose('口味售完');
 assert.equal(await f.resolve('request_items',p.action_id,f.env,'owner','a',Date.now(),'Change to chicken'),true);
 const row=await f.order();assert.equal(row.order_content,'Original items');assert.equal(row.total_amount,100);
 assert.equal(row.note,'Change to chicken');
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM pending_actions').first()).n,1);
 const response=await handleOrderCommand(new Request('https://local.test',{method:'POST',headers:{Authorization:'Bearer '+f.token,'Content-Type':'application/json'},body:JSON.stringify({operationId:crypto.randomUUID(),expectedRevision:row.revision,action:'accept'})}),f.env,'a',row.key);
 assert.equal(response.status,409);assert.equal((await response.json()).code,'PENDING_ACTION_UNRESOLVED');
});
test('failure after resolution insert rolls back the entire transaction',async t=>{
 const f=await setup(t);
 await f.apply("CREATE TRIGGER injected_pending_failure BEFORE DELETE ON pending_actions BEGIN SELECT RAISE(ABORT,'INJECTED_PENDING_FAILURE'); END;");
 await assert.rejects(()=>f.resolve(),/INJECTED_PENDING_FAILURE/);
 assert.equal((await f.order()).revision,0);
 assert.equal((await f.DB.prepare('SELECT count(*) n FROM order_pending_resolutions').first()).n,0);
});
