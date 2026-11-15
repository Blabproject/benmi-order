const {test}=require('node:test');const assert=require('node:assert/strict');
const {fixture,provider}=require('./helpers/payments.cjs');
const {reconcilePayment}=require('../benmi-worker-official/src/modules/payments.ts');
async function paidFixture(t){const f=await fixture(),original=global.fetch;t.after(()=>{global.fetch=original;f.db.close();});const calls=provider(f,{lostRefund:true});
 const p=await f.route('/api/payments/linepay/request',f.payload);await f.route('/api/payments/'+p.id+'/confirm',{});
 const login=await f.route('/api/payments/session',{password:'87654321'});return {...f,p,calls,login};}
test('lost refund response is reconciled by query, never another refund POST',async t=>{
 const f=await paidFixture(t);await f.route('/api/payments/'+f.p.id+'/refunds',{operationId:crypto.randomUUID(),reason:'Refund test'},f.token,undefined,f.login.token);
 assert.equal(f.calls.filter(x=>x.endsWith('/refund')).length,1);
 const result=await reconcilePayment(f.env,f.p.id,'a');assert.equal(result.status,'REFUNDED');
 assert.equal(f.calls.filter(x=>x.endsWith('/refund')).length,1);
 assert.equal(f.db.prepare('SELECT status FROM orders WHERE key=?').get(result.order_key).status,'CANCELLED');
});
test('query failure after a lost refund response must retain uncertainty and not resend',async t=>{
 const f=await paidFixture(t);await f.route('/api/payments/'+f.p.id+'/refunds',{operationId:crypto.randomUUID(),reason:'Refund test'},f.token,undefined,f.login.token);
 const prior=global.fetch;global.fetch=async(url,options)=>{if(new URL(url).pathname==='/v4/payments')throw Error('Query unavailable');return prior(url,options);};
 const result=await reconcilePayment(f.env,f.p.id,'a');assert.equal(result.status,'REFUND_PENDING');
 assert.equal(f.calls.filter(x=>x.endsWith('/refund')).length,1);assert.equal(result.refunded_at,null);
});
test('confirmed refund after completed service preserves completed state',async t=>{
 const f=await paidFixture(t);const key=f.db.prepare('SELECT order_key FROM payments WHERE id=?').get(f.p.id).order_key;
 f.db.prepare("UPDATE orders SET status='COMPLETED' WHERE key=?").run(key);
 await f.route('/api/payments/'+f.p.id+'/refunds',{operationId:crypto.randomUUID(),reason:'After delivery'},f.token,undefined,f.login.token);
 const result=await reconcilePayment(f.env,f.p.id,'a');assert.equal(result.status,'REFUNDED');assert.equal(f.db.prepare('SELECT status FROM orders WHERE key=?').get(key).status,'COMPLETED');
});
