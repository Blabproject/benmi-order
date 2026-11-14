// Real local D1; all rows are synthetic. Never calls a remote API.
const {test, suite} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../benmi-worker-official/node_modules/typescript');
require.extensions['.ts'] = (mod,file) => mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {handleStaffRoute,verifyStaffSession} = require('../benmi-worker-official/src/modules/staff.ts');
const {updateOrder,getOrders} = require('../benmi-worker-official/src/modules/orders.ts');
const {writeDetailedOrder} = require('../benmi-worker-official/src/modules/order-detail-write.ts');
const {handleAuthChange} = require('../benmi-worker-official/src/modules/auth.ts');
const {readDetail} = require('../benmi-worker-official/src/modules/order-detail.ts');
const {fixture} = require('./helpers/staff-ordering.cjs');

suite('staff ordering integration suite', { concurrency: 4 }, () => {

test('default capabilities, schema readiness and tenant boundaries fail closed',async t=>{
  const f=await fixture(t);
  assert.equal((await f.call('/api/staff/session',{pin:'wrong'})).http,401);
  assert.equal((await f.call('/api/staff/tables',null,null,'GET','b')).http,403);
  assert.equal((await f.call('/api/staff/session',{pin:'1234'},null,'POST','b')).http,403);
  const caps=await f.call('/api/staff/capabilities');assert.equal(caps.capabilities.create,true);
  await f.DB.prepare("UPDATE tenant_config SET staff_ordering_capabilities='{}' WHERE tenant_id='a'").run();
  assert.equal((await f.call('/api/staff/orders',f.input(),f.token)).http,403);
  await f.DB.prepare('UPDATE tenant_config SET staff_ordering_capabilities=? WHERE tenant_id=?').bind(JSON.stringify({...f.capabilities,create:'true'}),'a').run();
  assert.equal((await f.call('/api/staff/orders',f.input(),f.token)).http,403);
  await f.DB.prepare("DROP INDEX idx_orders_active_staff_table").run();
  assert.equal((await f.call('/api/staff/capabilities')).staff_ordering_enabled,false);
});

test('staff ordering works without a PIN session while tenant and capability guards remain enforced',async t=>{
  const f=await fixture(t);
  const capabilities={...f.capabilities,session:false};
  await f.DB.prepare('UPDATE tenant_config SET staff_ordering_capabilities=? WHERE tenant_id=?').bind(JSON.stringify(capabilities),'a').run();
  assert.equal((await f.call('/api/staff/tables')).http,200);
  const table=await f.call('/api/staff/tables',{label:'No PIN'});
  assert.equal(table.http,201);
  assert.equal((await f.call(`/api/staff/tables/${table.table.id}`,{label:'Updated'},null,'PATCH')).http,200);
  const created=await f.call('/api/staff/orders',f.input());
  assert.equal(created.http,201,JSON.stringify(created));
  assert.equal((await f.call(`/api/staff/orders/${created.key}`)).http,200);
  assert.equal((await f.call(`/api/staff/orders/${created.key}/rounds`,f.input({expectedRevision:1}))).http,200);
  assert.equal((await f.call(`/api/staff/orders/${created.key}/status`,{status:'DONE',expectedRevision:2},null,'PATCH')).http,200);
  await f.DB.prepare('UPDATE tenant_config SET staff_ordering_enabled=1,staff_ordering_capabilities=? WHERE tenant_id=?').bind(JSON.stringify(capabilities),'b').run();
  for(const suffix of ['', '/rounds', '/status']) {
    const method=suffix==='/status'?'PATCH':suffix?'POST':'GET';
    assert.equal((await f.call(`/api/staff/orders/${created.key}${suffix}`,suffix?{expectedRevision:3,status:'PAID'}:null,null,method,'b')).http,404);
  }
  assert.equal((await f.call('/api/staff/tables/table-a',{label:'Wrong tenant'},null,'PATCH','b')).http,404);
  assert.equal((await f.call('/api/staff/orders',f.input(),null,'POST','b')).http,404);
  await f.DB.prepare("UPDATE tenant_config SET is_active=0 WHERE tenant_id='a'").run();
  assert.equal((await f.call('/api/staff/tables')).http,403);
});

test('table CRUD, snapshots, replay, metadata and guarded legacy endpoints',async t=>{
  const f=await fixture(t);
  const table=await f.call('/api/staff/tables',{label:'A2',sort_order:1},f.token);assert.equal(table.http,201);
  assert.equal((await f.call('/api/staff/tables',{label:'A2'},f.token)).http,409);
  const req=f.input();const first=await f.call('/api/staff/orders',req,f.token);assert.equal(first.http,201,JSON.stringify(first));
  const repeated=await f.call('/api/staff/orders',req,f.token);assert.equal(repeated.idempotent,true);
  assert.equal((await f.call('/api/staff/orders',{...req,note:'different'},f.token)).error,'REQUEST_COLLISION');
  assert.equal((await f.call('/api/staff/tables/table-a',{label:'renamed'},f.token,'PATCH')).http,400);
  assert.equal((await f.call('/api/staff/tables/table-a',{is_active:0},f.token,'PATCH')).http,400);
  const append=f.input({expectedRevision:1});const added=await f.call(`/api/staff/orders/${first.orderId}/rounds`,append,f.token);
  assert.equal(added.http,200,JSON.stringify(added));assert.equal(added.total,200);assert.equal(added.revision,2);assert.equal(added.detailRevision,2);
  assert.equal((await f.call(`/api/staff/orders/${first.key}/rounds`,append,f.token)).idempotent,true);
  const detail=await readDetail(f.env,'a',first.key);assert.equal(detail.snapshot.rounds.length,2);
  const live=await getOrders(new Request('https://local.test/api/orders?tenant_id=a'),f.env);
  const found=(await live.json()).find(o=>o.key===first.key);assert.equal(found.source,'staff');assert.equal(found.revision,2);assert.equal(found.detailSnapshot.total,200);
  const legacy=await updateOrder(new Request('https://local.test/api/update?tenant_id=a',{method:'POST',body:JSON.stringify({key:first.key,status:'PAID'})}),f.env,undefined,f.context('a'));
  assert.equal(legacy.status,403);
  const customer=await writeDetailedOrder(f.env,'a',{detailVersion:1,operationId:crypto.randomUUID(),parent_order_key:first.key,expectedDetailRevision:2},'append');assert.equal(customer.status,403);

  // Staff takeaway order creation without tableId
  const takeawayReq = {requestId:crypto.randomUUID(),diningOption:'takeaway',total:100,orderSelections:[],items:[{itemId:'meal-a',quantity:1}],customer:'Anh Nam',pickupTime:'18:30',note:'Cho xin tương ớt'};
  const takeawayOrder = await f.call('/api/staff/orders',takeawayReq,f.token);
  assert.equal(takeawayOrder.http,201,JSON.stringify(takeawayOrder));
  assert.equal(takeawayOrder.diningOption,'takeaway');
  assert.equal(takeawayOrder.tableId,null);
  assert.equal(takeawayOrder.tableNumber,'');
  assert.ok(takeawayOrder.displayKey.includes('-T'));
  const tRow = await f.DB.prepare('SELECT * FROM orders WHERE key=?').bind(takeawayOrder.key).first();
  assert.equal(tRow.dining_option,'takeaway');
  assert.equal(tRow.table_id,null);
  assert.equal(tRow.customer_name,'Anh Nam');
  assert.equal(tRow.pickup_time,'18:30');
  assert.equal(tRow.note,'Cho xin tương ớt');

  // Verify second takeaway order succeeds without conflicting
  const takeawayReq2 = {requestId:crypto.randomUUID(),diningOption:'takeaway',total:100,orderSelections:[],items:[{itemId:'meal-a',quantity:1}],customer:'Chị Lan'};
  const takeawayOrder2 = await f.call('/api/staff/orders',takeawayReq2,f.token);
  assert.equal(takeawayOrder2.http,201,JSON.stringify(takeawayOrder2));
  assert.notEqual(takeawayOrder2.key, takeawayOrder.key);

  // Verify tables list has no active_order_key assigned to any table from takeaway orders
  const tablesAfterTakeaway = (await f.call('/api/staff/tables',null,f.token)).tables;
  assert.equal(tablesAfterTakeaway.find(x=>x.id==='table-a').active_order_key, first.key);
  assert.equal(tablesAfterTakeaway.find(x=>x.id===table.table.id).active_order_key, null);
  const paid=await f.call(`/api/staff/orders/${first.key}/status`,{status:'PAID',expectedRevision:2},f.token,'PATCH');assert.equal(paid.http,200);
  assert.equal((await f.call(`/api/staff/orders/${first.key}/rounds`,f.input({expectedRevision:3}),f.token)).error,'ORDER_FINALIZED');
  assert.equal((await f.call('/api/staff/tables',null,f.token)).tables.find(x=>x.id==='table-a').active_order_key,null);
});

test('server rejects forged prices, cross-tenant items, missing choices and projection failures atomically',async t=>{
  const f=await fixture(t);
  assert.equal((await f.call('/api/staff/orders',f.input({total:1}),f.token)).http,409);
  assert.equal((await f.call('/api/staff/orders',f.input({items:[{itemId:'meal-b',quantity:1}]}),f.token)).http,400);
  await f.apply(`INSERT INTO modifier_groups(id,tenant_id,name,selection_type,is_required,min_selection,max_selection,scope)
    VALUES('required-a','a','Sauce','single',1,1,1,'item');
    INSERT INTO modifier_options(id,tenant_id,group_id,name,price) VALUES('sauce-a','a','required-a','Sauce',10);
    INSERT INTO item_modifier_links(tenant_id,item_id,group_id) VALUES('a','meal-a','required-a');`);
  assert.equal((await f.call('/api/staff/orders',f.input(),f.token)).http,400);
  const req=f.input({total:110,items:[{itemId:'meal-a',quantity:1,bundleSelections:{portions:[{groups:[{groupId:'required-a',items:[{optionId:'sauce-a',quantity:1}]}]}]}}]});
  const first=await f.call('/api/staff/orders',req,f.token);assert.equal(first.http,201,JSON.stringify(first));
  await f.apply("CREATE TRIGGER fail_staff_projection BEFORE INSERT ON order_items BEGIN SELECT RAISE(ABORT,'injected'); END;");
  const rejected=await f.call(`/api/staff/orders/${first.key}/rounds`,{...req,requestId:crypto.randomUUID(),expectedRevision:1},f.token);assert.equal(rejected.http,500);
  const order=await f.DB.prepare('SELECT revision,total_amount,detail_revision FROM orders WHERE key=?').bind(first.key).first();
  assert.deepEqual(order,{revision:1,total_amount:110,detail_revision:1});
  assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM staff_order_requests').first()).n,1);
});

test('twenty races each: same-table create, concurrent append, append versus payment',async t=>{
  const f=await fixture(t);
  for(let i=0;i<20;i++) {
    const tableId='race-'+i;await f.DB.prepare('INSERT INTO restaurant_tables(id,tenant_id,label) VALUES (?,\'a\',?)').bind(tableId,tableId).run();
    const open=await Promise.all([f.call('/api/staff/orders',f.input({tableId}),f.token),f.call('/api/staff/orders',f.input({tableId}),f.token)]);
    assert.deepEqual(open.map(x=>x.http).sort(),[201,409]);const key=open.find(x=>x.http===201).key;
    const rounds=await Promise.all([f.call(`/api/staff/orders/${key}/rounds`,f.input({expectedRevision:1}),f.token),f.call(`/api/staff/orders/${key}/rounds`,f.input({expectedRevision:1}),f.token)]);
    assert.deepEqual(rounds.map(x=>x.http).sort(),[200,409]);
    const paid=await Promise.all([f.call(`/api/staff/orders/${key}/rounds`,f.input({expectedRevision:2}),f.token),f.call(`/api/staff/orders/${key}/status`,{expectedRevision:2,status:'PAID'},f.token,'PATCH')]);
    assert.deepEqual(paid.map(x=>x.http).sort(),[200,409]);
    const row=await f.DB.prepare('SELECT * FROM orders WHERE key=?').bind(key).first();
    const snapshot=await readDetail(f.env,'a',key);assert.equal(row.total_amount,snapshot.snapshot.total);assert.equal(row.total_amount,row.round_count*100);
    if(row.status==='PAID') assert.equal(row.total_amount,200);
  }
});

test('legacy PIN session revocation stays tenant scoped for payment authentication',async t=>{
  const f=await fixture(t);
  const request=new Request('https://local.test/api/staff/tables?tenant_id=a',{headers:{Authorization:'Bearer '+f.token}});
  assert(await verifyStaffSession(request,f.env,'a'));
  const changed=await handleAuthChange(new Request('https://local.test/api/auth/change?tenant_id=a',{method:'POST',body:JSON.stringify({current:'1234',newPassword:'5678'})}),f.env,f.context('a'));
  assert.equal(changed.status,200);assert.equal(await verifyStaffSession(request,f.env,'a'),null);
  const next=await f.call('/api/staff/session',{pin:'5678'});assert.equal(next.http,200);
  await f.call('/api/staff/session',null,next.token,'DELETE','b');
  assert.equal((await f.call('/api/staff/tables',null,next.token)).http,200);
  await f.call('/api/staff/session',null,next.token,'DELETE');
  assert.equal(await verifyStaffSession(new Request(request.url,{headers:{Authorization:'Bearer '+next.token}}),f.env,'a'),null);
  assert.equal((await f.call('/api/staff/tables')).http,200);
});

test('non-dine-in and no-scheduled-pickup tenant supports staff takeaway orders without tables',async t=>{
  const f=await fixture(t);
  const takeawayOnlyCapabilities={...f.capabilities,tables_read:false,tables_write:false,append:false};
  await f.apply(`DELETE FROM restaurant_tables WHERE tenant_id='a';
    UPDATE tenant_config SET allow_dine_in=0,allow_scheduled_pickup=0,features='["reports","flex_notifications"]',staff_ordering_capabilities='${JSON.stringify(takeawayOnlyCapabilities)}' WHERE tenant_id='a';`);
  const callReal = async (path,body,method=body?'POST':'GET') => {
    const response = await handleStaffRoute(new Request(`https://local.test${path}?tenant_id=a`,{
      method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+f.token},...(body?{body:JSON.stringify(body)}:{})}),f.env,path);
    return {http:response.status,...await response.json()};
  };
  const caps = await callReal('/api/staff/capabilities');
  assert.equal(caps.http,200);
  assert.equal(caps.allowDineIn,false);
  assert.equal(caps.allowScheduledPickup,false);
  assert.equal(caps.capabilities.create,true);
  assert.equal(caps.capabilities.tables_read,false);

  // Attempting dine_in on a non-dine-in tenant is rejected with 403 DINE_IN_DISABLED
  const rejectedDineIn = await callReal('/api/staff/orders',{requestId:crypto.randomUUID(),diningOption:'dine_in',tableId:'table-a',total:100,orderSelections:[],items:[{itemId:'meal-a',quantity:1}]});
  assert.equal(rejectedDineIn.http,403);
  assert.equal(rejectedDineIn.error,'DINE_IN_DISABLED');

  // Takeaway order without tableId or scheduled pickup time succeeds (including implicit takeaway when allowDineIn=false)
  const asapOrder = await callReal('/api/staff/orders',{requestId:crypto.randomUUID(),total:100,orderSelections:[],items:[{itemId:'meal-a',quantity:1}],customer:'Khách lẻ',note:'Lấy ngay'});
  assert.equal(asapOrder.http,201,JSON.stringify(asapOrder));
  assert.equal(asapOrder.diningOption,'takeaway');
  assert.equal(asapOrder.tableId,null);
  assert.ok(asapOrder.displayKey.includes('-T'));
  const saved = await f.DB.prepare('SELECT dining_option,table_id,pickup_time,customer_name,note FROM orders WHERE key=?').bind(asapOrder.key).first();
  assert.match(saved.pickup_time,/^\d{2}:\d{2}$/);
  assert.deepEqual({dining_option:saved.dining_option,table_id:saved.table_id,customer_name:saved.customer_name,note:saved.note},{dining_option:'takeaway',table_id:null,customer_name:'Khách lẻ',note:'Lấy ngay'});
});
});
