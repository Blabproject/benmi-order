const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const source=fs.readFileSync('js/orders-live.js','utf8');
const action=source.slice(source.indexOf('async function updateStatus('),source.indexOf('async function reviewAccept('));
function fixture(sourceType,status=200) {
 const requests=[],alerts=[],storage=new Map();let refreshed=0;
 const context={console,AbortController,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,WORKER_BASE:'https://dev.test',latestOrders:[{key:'order',source:sourceType,revision:7}],processingKeys:new Set(),
  sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  PosSession:{token:async()=> 'session',invalidate:()=>{}},
  localOverrides:{},t:k=>k,alert:message=>alerts.push(message),getTenantIdFromUrl:()=> 'tenant-a',renderAll:()=>{},fetchOrders:async()=>{refreshed++;},
  fetch:async(url,request)=>{requests.push({url,...request,body:JSON.parse(request.body)});return new Response(JSON.stringify({status:'COMPLETED',revision:8}),{status});}};
 vm.createContext(context);vm.runInContext(action,context);return {context,requests,alerts,storage,refreshed:()=>refreshed};
}
test('staff and legacy completion use the same authenticated canonical command',async()=>{
 for(const source of ['staff','legacy']){
 const f=fixture(source);assert.equal(await f.context.updateStatus('order','COMPLETED'),true);assert.equal(f.requests.length,1);
 assert(f.requests[0].url.includes('/api/orders/order/commands?tenant_id=tenant-a'));assert.equal(f.requests[0].method,'POST');
 assert.equal(f.requests[0].headers.Authorization,'Bearer session');assert.equal(f.requests[0].body.expectedRevision,7);assert.equal(f.requests[0].body.action,'complete');
 assert.ok(f.requests[0].body.operationId);assert.equal(f.requests[0].body.settlement,undefined);assert.equal(f.refreshed(),1);assert.equal(f.storage.size,0);
 }
});
test('stale command refreshes and removes failed optimistic state',async()=>{
 const f=fixture('staff',409);assert.equal(await f.context.updateStatus('order','READY'),false);assert.equal(f.context.localOverrides.order,undefined);assert.equal(f.refreshed(),1);assert.deepEqual(f.alerts,['staffStatusConflict']);assert.equal(f.storage.size,0);
});
test('lost response preserves operation ID and old revision across a manual retry',async()=>{
 const f=fixture('legacy');let count=0;
 f.context.fetch=async(url,request)=>{f.requests.push(JSON.parse(request.body));if(++count===1)throw new TypeError('network lost');return new Response(JSON.stringify({status:'COMPLETED',revision:8}));};
 assert.equal(await f.context.updateStatus('order','COMPLETED'),false);assert.equal(f.storage.size,1);
 f.context.latestOrders[0].revision=8;
 assert.equal(await f.context.updateStatus('order','COMPLETED'),true);assert.deepEqual(f.requests[0],f.requests[1]);assert.equal(f.requests[1].expectedRevision,7);assert.equal(f.storage.size,0);
});
test('an unresolved operation prevents a different command from replacing it',async()=>{
 const f=fixture('legacy');f.context.fetch=async()=>{throw new TypeError('network lost');};
 await f.context.updateStatus('order','COMPLETED');const prior=Array.from(f.storage.values());
 assert.equal(await f.context.updateStatus('order','FORCE_REJECT'),false);assert.deepEqual(Array.from(f.storage.values()),prior);
});
