const {test}=require('node:test');const assert=require('node:assert/strict');
const {fixture}=require('./helpers/staff-ordering.cjs');
const {createTenantRepository}=require('../benmi-worker-official/src/repositories/tenant.repository.ts');
const {getConfig,updateConfig}=require('../benmi-worker-official/src/modules/config.ts');

test('legacy closed is paused at config/context boundaries and new writes use three canonical statuses',async t=>{
 const f=await fixture(t);const tenant=f.context('a');
 await f.apply("UPDATE tenant_config SET store_status='closed' WHERE tenant_id='a';");
 const repo=createTenantRepository(f.env.DB,f.env.ORDER_STATE,f.env);
 assert.equal((await repo.getTenantContext('a')).storeStatus,'paused');
 const url='https://api.test/api/config?tenant_id=a';
 assert.equal((await(await getConfig(new Request(url),f.env,tenant)).json()).storeStatus,'paused');
 for(const status of ['open','busy','paused','closed']){
  const r=await updateConfig(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({storeStatus:status})}),f.env,tenant);
  assert.equal(r.status,200,await r.text());
  assert.equal((await f.DB.prepare("SELECT store_status FROM tenant_config WHERE tenant_id='a'").first()).store_status,status==='closed'?'paused':status);
 }
 const r=await updateConfig(new Request(url,{method:'POST',body:JSON.stringify({storeStatus:'holiday'})}),f.env,tenant);
 assert.equal(r.status,400);
});
