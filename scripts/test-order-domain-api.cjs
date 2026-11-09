const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {DatabaseSync} = require('node:sqlite');
const ts = require('../benmi-worker-official/node_modules/typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,file);
const {getConfig}=require('../benmi-worker-official/src/modules/config.ts');
const {updateOrderDomain}=require('../benmi-worker-official/src/modules/order-domain.ts');
const {handleAdminRoute}=require('../benmi-worker-official/src/modules/admin.ts');
function fixture() {
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE tenant_config(tenant_id TEXT PRIMARY KEY,liff_id TEXT,is_active INTEGER DEFAULT 1,updated_at TEXT,
    operating_hours TEXT,allow_scheduled_pickup INTEGER,allow_dine_in INTEGER,store_status TEXT,logo_url TEXT,store_address TEXT,announcement TEXT,features TEXT,payment_methods TEXT DEFAULT '["line_pay"]',prep_time_minutes INTEGER,auto_open_before_minutes INTEGER);
    INSERT INTO tenant_config(tenant_id,liff_id) VALUES('tenant-a','12345678-abcde');`);
  db.exec(fs.readFileSync('benmi-worker-official/migrations/0064_customer_order_domain.sql','utf8'));
  const deletes=[];
  const env={ADMIN_API_KEY:'configured-only',DB:{prepare(sql){const build=params=>({bind(...p){return build(p);},async first(){return db.prepare(sql).get(...params)||null;},async run(){return {meta:{changes:db.prepare(sql).run(...params).changes}};}});return build([]);}},ORDER_STATE:{delete:async key=>deletes.push(key)}};
  return {db,env,deletes};
}
const request=payload=>new Request('https://benmi-worker-official.thuanmnc.workers.dev/api/admin/tenants/tenant-a/order-domain',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
const payload={customerOrderDomain:'blabfood',expectedCustomerOrderDomain:'legacy',expectedLiffId:'12345678-abcde',legacyLiffEndpointUrl:'https://benmi-order.pages.dev/?tenant_id=tenant-a'};
const configRequest=new Request('https://benmi-worker-official.thuanmnc.workers.dev/api/config?tenant_id=tenant-a');
test('additive migration preserves existing tenant, defaults legacy and constrains state',()=>{
  const f=fixture();const row=f.db.prepare('SELECT * FROM tenant_config').get();assert.equal(row.customer_order_domain,'legacy');assert.equal(row.legacy_liff_endpoint_url,null);
  assert.equal(row.liff_id,'12345678-abcde');assert.throws(()=>f.db.exec("UPDATE tenant_config SET customer_order_domain='other'"));
});
test('config uses fresh D1, preserves LIFF ID and disables HTTP caching',async()=>{
  const f=fixture();let r=await getConfig(configRequest,f.env,{tenantId:'tenant-a',liffId:'stale'});let data=await r.json();
  assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(data.liffId,payload.expectedLiffId);assert.equal(data.customerOrderDomain,'legacy');
  assert.equal(data.orderUrl,payload.legacyLiffEndpointUrl);
  f.db.exec("UPDATE tenant_config SET customer_order_domain='blabfood'");r=await getConfig(configRequest,f.env);data=await r.json();assert.equal(data.liffEndpointUrl,'https://order.blabfood.app/tenant-a');
  const broken={...f.env,DB:{prepare(){throw new Error('D1 offline');}}};r=await getConfig(configRequest,broken,{tenantId:'tenant-a',liffId:'stale'});assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');
});
test('activation captures legacy endpoint, uses CAS and invalidates all three caches',async()=>{
  const f=fixture();const r=await updateOrderDomain(request(payload),f.env,'tenant-a');assert.equal(r.status,200);assert.equal((await r.json()).orderUrl,'https://order.blabfood.app/tenant-a');
  assert.deepEqual(f.deletes.sort(),['marketplace:tenants_catalog','tenant:tenant-a:bootstrap','tenant:tenant-a:bootstrap:v2','tenant:tenant-a:config_cache']);
  assert.equal((await updateOrderDomain(request(payload),f.env,'tenant-a')).status,409);
  const rollback={...payload,customerOrderDomain:'legacy',expectedCustomerOrderDomain:'blabfood'};
  assert.equal((await updateOrderDomain(request(rollback),f.env,'tenant-a')).status,200);
  assert.equal((await (await getConfig(configRequest,f.env)).json()).orderUrl,payload.legacyLiffEndpointUrl);
});
test('wrong LIFF ID, missing rollback endpoint and cross-tenant URLs cannot activate',async()=>{
  const f=fixture();for(const [change,status] of [[{expectedLiffId:'wrong'},409],[{legacyLiffEndpointUrl:undefined},400],[{legacyLiffEndpointUrl:'https://evil.example/'},400],[{legacyLiffEndpointUrl:'https://benmi-order.pages.dev/?tenant_id=other'},400]]) {
    assert.equal((await updateOrderDomain(request({...payload,...change}),f.env,'tenant-a')).status,status);
  }
  assert.equal(f.db.prepare('SELECT customer_order_domain FROM tenant_config').get().customer_order_domain,'legacy');assert.equal(f.deletes.length,0);
});
test('admin migration route accepts only configured secret; fallback key is rejected',async()=>{
  const f=fixture();const req=request(payload);req.headers.set('X-Admin-Key','benmi_admin_secret_2026');
  const path='/api/admin/tenants/tenant-a/order-domain';assert.equal((await handleAdminRoute(req,{...f.env,ADMIN_API_KEY:undefined},path)).status,401);
  req.headers.set('X-Admin-Key','configured-only');assert.equal((await handleAdminRoute(req,f.env,path)).status,200);
});
test('config gracefully handles dev environment requests and cross-environment origins',async()=>{
  const f=fixture();
  f.db.exec("UPDATE tenant_config SET customer_order_domain='blabfood', legacy_liff_endpoint_url='https://benmi-order.pages.dev/?tenant_id=tenant-a'");
  const devReq=new Request('https://platform-worker-dev.thuanmnc.workers.dev/api/config?tenant_id=tenant-a');
  let r=await getConfig(devReq,f.env);
  assert.equal(r.status,200);
  let data=await r.json();
  assert.equal(data.customerOrderDomain,'blabfood');
  assert.equal(data.orderUrl,'https://order.blabfood.app/tenant-a');

  // Also test legacy domain in dev environment with production legacy_liff_endpoint_url
  f.db.exec("UPDATE tenant_config SET customer_order_domain='legacy'");
  r=await getConfig(devReq,f.env);
  assert.equal(r.status,200);
  data=await r.json();
  assert.equal(data.orderUrl,'https://benmi-order.pages.dev/?tenant_id=tenant-a');

  // Test fallback if stored legacy URL is invalid
  f.db.exec("UPDATE tenant_config SET legacy_liff_endpoint_url='https://corrupt-domain.com'");
  r=await getConfig(devReq,f.env);
  assert.equal(r.status,200);
  data=await r.json();
  assert.equal(data.orderUrl,'https://dev.benmi-order.pages.dev/?tenant_id=tenant-a');
});
