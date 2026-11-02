const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {fixture,tenant}=require('./helpers/payments.cjs');
const {handlePaymentRoute}=require('../benmi-worker-official/src/modules/payments.ts');
const {paymentAttentionCount,paymentTransactions,paymentDateRange}=require('../benmi-worker-official/src/modules/payment-workspace.ts');

async function setup(t){
 const f=await fixture();t.after(()=>f.db.close());
 f.call=async(path,{token,context=tenant,method='GET',body}={})=>{
  const url=new URL(path,'https://local.test');
  const response=await handlePaymentRoute(new Request(url,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),f.env,context,url.pathname);
  return {http:response.status,data:await response.json()};
 };
 f.login=async()=>{const result=await f.call('/api/payments/session',{method:'POST',body:{password:'87654321'}});assert.equal(result.http,200);return result.data.token;};
 return f;
}

test('attention count and list share phase-specific five-minute rules without alerting normal pending customers',async t=>{
 const f=await setup(t),now=Date.now();
 f.seed({status:'PENDING',createdAt:now-86400000});
 f.seed({status:'UNKNOWN',createdAt:now-299999});
 const expected=[f.seed({status:'UNKNOWN',createdAt:now-300000})];
 f.seed({status:'CONFIRMING',createdAt:now-86400000,confirmAt:now-60000});
 expected.push(f.seed({status:'CONFIRMING',createdAt:now-86400000,confirmAt:now-300000}));
 f.seed({status:'REFUND_PENDING',createdAt:now-86400000,refundAt:now-10000});
 expected.push(f.seed({status:'REFUND_PENDING',createdAt:now-86400000,refundAt:now-300000}));
 expected.push(f.seed({status:'REFUND_FAILED',createdAt:now,refundAt:now}));
 f.seed({status:'PENDING',createdAt:now-86400000,cancelAt:now-10000});
 expected.push(f.seed({status:'PENDING',createdAt:now-86400000,cancelAt:now-300000}));
 expected.push(f.seed({orderStatus:'REJECTED',createdAt:now}),f.seed({cancelAt:now,createdAt:now}),f.seed({orderStatus:'CANCELLED',createdAt:now}));
 f.seed({status:'REFUNDED',createdAt:now,cancelAt:now-86400000});
 const count=await paymentAttentionCount(f.env,'a',now);
 assert.deepEqual(count,{count:expected.length,checkedAt:now});
 const list=await paymentTransactions(f.env,'a',new URLSearchParams({view:'attention',from:'2000-01-01',to:'2000-01-01'}),now);
 assert.deepEqual(list.items.map(p=>p.id).sort(),expected.sort());
 assert.equal(list.items.find(p=>p.status==='REFUND_FAILED').canReconcile,false);
 assert(list.items.every(p=>p.attentionReason&&p.needsAttention));
});

test('public count contains no private fields; management APIs reject missing, expired and cross-tenant sessions',async t=>{
 const f=await setup(t);const id=f.seed({status:'REFUND_FAILED',refundAt:Date.now()});
 const publicCount=await f.call('/api/payments/attention/count');assert.equal(publicCount.http,200);
 assert.deepEqual(Object.keys(publicCount.data).sort(),['checkedAt','count']);
 assert.equal(publicCount.data.count,1);
 for(const path of ['/api/payments/transactions','/api/payments/summary'])assert.equal((await f.call(path)).http,401);
 assert.equal((await f.call('/api/payments/'+id)).http,403);
 const token=await f.login();
 const detail=await f.call('/api/payments/'+id,{token});assert.equal(detail.http,200);
 assert.equal(typeof detail.data.transactionId,'string');assert.equal(detail.data.refund.resultCode,'1163');
 assert(!JSON.stringify(detail.data).includes('private-'));
 assert.equal((await f.call('/api/payments/'+id,{token,context:{...tenant,tenantId:'b'}})).http,404);
 assert.equal((await f.call('/api/payments/attention/count',{context:{...tenant,tenantId:'b'}})).data.count,0);
 f.db.exec("UPDATE staff_sessions SET revoked_at=datetime('now')");
 assert.equal((await f.call('/api/payments/transactions',{token})).http,401);
});

test('history and attention paginate beyond 100 rows with stable tied timestamps, filters and context-bound cursors',async t=>{
 const f=await setup(t),created=Date.parse('2026-10-03T12:00:00+08:00');
 for(let i=0;i<125;i++)f.seed({createdAt:created,status:'REFUND_FAILED',refundAt:created,displayKey:'DEMO-'+String(i).padStart(3,'0')});
 const token=await f.login();const options={view:'history',from:'2026-10-01',to:'2026-10-31'};
 const seen=[];let cursor=null;
 do{const params=new URLSearchParams(options);if(cursor)params.set('cursor',cursor);const res=await f.call('/api/payments/transactions?'+params,{token});assert.equal(res.http,200);seen.push(...res.data.items.map(p=>p.id));cursor=res.data.nextCursor;}while(cursor);
 assert.equal(seen.length,125);assert.equal(new Set(seen).size,125);
 const first=await f.call('/api/payments/transactions?'+new URLSearchParams(options),{token});
 assert.equal(first.data.items.length,50);
 assert.equal((await f.call('/api/payments/transactions?'+new URLSearchParams({...options,q:'changed',cursor:first.data.nextCursor}),{token})).http,400);
 const found=await f.call('/api/payments/transactions?'+new URLSearchParams({...options,q:'DEMO-004',status:'REFUND_FAILED'}),{token});
 assert.equal(found.data.items.length,1);
 const literal=await f.call('/api/payments/transactions?'+new URLSearchParams({...options,q:'%'}),{token});assert.equal(literal.data.items.length,0);
 const attention=await f.call('/api/payments/transactions?view=attention&limit=100',{token});assert.equal(attention.data.items.length,100);assert(attention.data.nextCursor);
 assert.equal((await f.call('/api/payments/attention/count')).data.count,125);
});

test('Taipei history ranges validate real dates and 31-day maximum; settlement totals use actual paid/refunded dates',async t=>{
 const f=await setup(t),token=await f.login();
 for(const params of [{from:'2026-02-30',to:'2026-03-01'},{from:'2026-01-01',to:'2026-02-01'},{from:'2026-03-03',to:'2026-03-02'},{to:'2026-03-03'}]){
  assert.throws(()=>paymentDateRange(new URLSearchParams(params)),/INVALID_DATE_RANGE/);
  assert.equal((await f.call('/api/payments/summary?'+new URLSearchParams(params),{token})).http,400);
 }
 const start=Date.parse('2026-10-03T00:00:00+08:00'),end=start+86400000;
 f.seed({amount:200,status:'REFUNDED',createdAt:start-86400000,paidAt:start-1000,refundedAt:start});
 f.seed({amount:100,createdAt:start,paidAt:start});
 f.seed({amount:300,createdAt:end,paidAt:end});
 const summary=await f.call('/api/payments/summary?date=2026-10-03',{token});
 assert.equal(summary.http,200);assert.equal(summary.data.collected,100);assert.equal(summary.data.refunded,200);assert.equal(summary.data.net,-100);
 const history=await f.call('/api/payments/transactions?from=2026-10-03&to=2026-10-03',{token});assert.equal(history.data.items.length,1);
 assert.equal((await f.call('/api/payments/transactions?view=invalid',{token})).http,400);
 assert.equal((await f.call('/api/payments/transactions?limit=1000',{token})).http,400);
 f.db.exec(fs.readFileSync('benmi-worker-official/migrations/0077_payment_workspace_indexes.sql','utf8'));
 const plan=f.db.prepare('EXPLAIN QUERY PLAN SELECT id FROM payments WHERE tenant_id=? AND created_at>=? AND created_at<? ORDER BY created_at DESC,id DESC LIMIT 50').all('a',start,end);
 assert(JSON.stringify(plan).includes('payments_tenant_created'));
});
