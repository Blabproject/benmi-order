const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('../benmi-worker-official/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const p=require('../benmi-worker-official/src/domain/order-lifecycle.ts');
const context=(state,extra={})=>({state,actor:'staff',pendingAction:false,payment:'manual',...extra});
const rejects=(fn,code)=>assert.throws(fn,e=>e.code===code);
test('both legacy endings map to completed without payment evidence',()=>{
 for(const s of ['PAID','PICKED_UP']) assert.deepEqual(p.mapLegacyOrder(s),{state:'COMPLETED',reviewRequired:false,collectionEvidence:'unknown'});
 for(const s of ['WAITING_CUSTOMER_CHANGE','WAITING_CUSTOMER_REJECT','garbage','toString','__proto__']) assert.equal(p.mapLegacyOrder(s).reviewRequired,true);
 assert.equal(p.isOrderState('PAID'),false);
});
test('manual takeaway and dine-in complete through the same policy',()=>{
 for(const dining of ['takeaway','dine_in']){
 let state='NEW';for(const action of ['accept','mark_ready','complete'])state=p.decideOrderTransition(context(state),action);
 assert.equal(state,'COMPLETED');assert.equal(p.projectLegacyOrder(state,dining),dining==='takeaway'?'PICKED_UP':'PAID');
 }
 assert.equal(p.decideOrderTransition(context('ACCEPTED'),'complete'),'COMPLETED');
 rejects(()=>p.decideOrderTransition(context('NEW'),'complete'),'INVALID_STATUS_TRANSITION');
});
test('payment publication requires provider evidence and does not complete service',()=>{
 assert.equal(p.decideOrderTransition(context('PENDING_PAYMENT',{actor:'payment',payment:'paid'}),'publish_paid'),'NEW');
 rejects(()=>p.decideOrderTransition(context('PENDING_PAYMENT',{payment:'paid'}),'publish_paid'),'PAYMENT_EVIDENCE_REQUIRED');
 rejects(()=>p.decideOrderTransition(context('PENDING_PAYMENT',{actor:'payment',payment:'unresolved'}),'publish_paid'),'PAYMENT_EVIDENCE_REQUIRED');
 rejects(()=>p.decideOrderTransition(context('PENDING_PAYMENT'),'complete'),'PAYMENT_RECONCILIATION_REQUIRED');
});
test('closed orders cannot be reopened by any ordinary action',()=>{
 for(const state of ['COMPLETED','CANCELLED','EXPIRED']) for(const action of ['accept','mark_ready','complete','cancel'])
 rejects(()=>p.decideOrderTransition(context(state),action),'ORDER_FINALIZED');
});
test('pending customer action and uncertain payment block service completion',()=>{
 rejects(()=>p.decideOrderTransition(context('READY',{pendingAction:true}),'complete'),'PENDING_ACTION_UNRESOLVED');
 for(const payment of ['unresolved','refund_pending','refunded']) rejects(()=>p.decideOrderTransition(context('READY',{payment}),'complete'),'PAYMENT_RECONCILIATION_REQUIRED');
});
test('refund before delivery cancels; refund after delivery preserves completion',()=>{
 for(const state of ['NEW','ACCEPTED','READY']) assert.equal(p.decideOrderTransition(context(state,{actor:'payment',payment:'refunded'}),'refund_succeeded'),'CANCELLED');
 assert.equal(p.decideOrderTransition(context('COMPLETED',{actor:'payment',payment:'refunded'}),'refund_succeeded'),'COMPLETED');
 rejects(()=>p.decideOrderTransition(context('READY',{actor:'payment',payment:'refund_pending'}),'refund_succeeded'),'PAYMENT_EVIDENCE_REQUIRED');
});
test('cancel paid service is distinct from refund; system cannot complete',()=>{
 assert.equal(p.decideOrderTransition(context('READY',{payment:'paid'}),'cancel'),'CANCELLED');
 rejects(()=>p.decideOrderTransition(context('READY',{actor:'system'}),'complete'),'ACTOR_FORBIDDEN');
 rejects(()=>p.decideOrderTransition(context('READY',{actor:'system',payment:'paid'}),'expire'),'PAYMENT_RECONCILIATION_REQUIRED');
});
test('completion without explicit confirmation does not manufacture a receipt',()=>{
 for(const payment of ['manual','paid'])assert.equal(p.manualCollectionForCompletion({mode:'unchanged'},120,'TWD',payment,false),null);
});
test('manual receipt requires exact amount, currency, method and no prior collection',()=>{
 const input={mode:'confirm_manual',amountMinor:120,currency:'TWD',method:'cash'};
 assert.deepEqual(p.manualCollectionForCompletion(input,120,'TWD','manual',false),{amountMinor:120,currency:'TWD',method:'cash'});
 rejects(()=>p.manualCollectionForCompletion(input,125,'TWD','manual',false),'SETTLEMENT_AMOUNT_MISMATCH');
 rejects(()=>p.manualCollectionForCompletion(input,120,'USD','manual',false),'SETTLEMENT_AMOUNT_MISMATCH');
 for(const payment of ['paid','unresolved','refund_pending','refunded']) rejects(()=>p.manualCollectionForCompletion(input,120,'TWD',payment,false),'MANUAL_COLLECTION_FORBIDDEN');
 rejects(()=>p.manualCollectionForCompletion(input,120,'TWD','manual',true),'MANUAL_COLLECTION_FORBIDDEN');
 rejects(()=>p.manualCollectionForCompletion({...input,method:undefined},120,'TWD','manual',false),'PAYMENT_METHOD_REQUIRED');
 assert.equal(p.manualCollectionForCompletion({...input,amountMinor:0},0,'TWD','manual',false),null);
 rejects(()=>p.manualCollectionForCompletion(input,1.2,'TWD','manual',false),'INVALID_ORDER_AMOUNT');
});
