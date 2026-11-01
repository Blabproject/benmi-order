const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const source=fs.readFileSync('js/orders-live.js','utf8');
const action=source.slice(source.indexOf('async function updateStatus('),source.indexOf('async function reviewAccept('));
function fixture(sourceType,status=200) {
 const requests=[],alerts=[];let refreshed=0;
 const context={console,WORKER_BASE:'https://dev.test',latestOrders:[{key:'order',source:sourceType,revision:7}],processingKeys:new Set(),
  localOverrides:{},t:k=>k,alert:message=>alerts.push(message),getTenantIdFromUrl:()=> 'tenant-a',
  getStaffSessionToken:async()=> 'test-token',renderAll:()=>{},fetchOrders:async()=>{refreshed++;},
  fetch:async(url,request)=>{requests.push({url,...request,body:JSON.parse(request.body)});return {ok:status===200,status};}};
 vm.createContext(context);vm.runInContext(action,context);return {context,requests,alerts,refreshed:()=>refreshed};
}
test('POS staff actions send session and revision to staff endpoint',async()=>{
 const f=fixture('staff');await f.context.updateStatus('order','PAID');assert.equal(f.requests.length,1);
 assert(f.requests[0].url.includes('/api/staff/orders/order/status?tenant_id=tenant-a'));assert.equal(f.requests[0].method,'PATCH');
 assert.equal(f.requests[0].headers.Authorization,'Bearer test-token');assert.equal(f.requests[0].body.expectedRevision,7);assert.equal(f.refreshed(),1);
});
test('stale staff action reloads without overriding payment; customer actions retain existing endpoint',async()=>{
 const f=fixture('staff',409);await f.context.updateStatus('order','DONE');assert.equal(f.context.localOverrides.order,undefined);assert.equal(f.refreshed(),1);assert.deepEqual(f.alerts,['staffStatusConflict']);
 const legacy=fixture('legacy');await legacy.context.updateStatus('order','DONE');assert(legacy.requests[0].url.includes('/api/update?'));assert.equal(legacy.requests[0].method,'POST');
});
