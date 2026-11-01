import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../functions/_middleware.js', import.meta.url), 'utf8').replace('export async function', 'async function');
async function dispatch(path, domain = 'legacy', method = 'GET', fail = false) {
  const assets = [], configs = [];
  const sandbox = { URL, Request, Response, Headers, AbortSignal, fetch: async (url, options) => {
    configs.push({url, options});
    if (fail) throw new Error('D1 unavailable');
    const orderUrl = domain === 'legacy' ? 'https://benmi-order.pages.dev/?tenant_id=tenant-a' : 'https://order.blabfood.app/tenant-a';
    return Response.json({tenantId:'tenant-a', customerOrderDomain:domain, orderUrl});
  }};
  vm.runInNewContext(source, sandbox);
  const response = await sandbox.onRequest({request:new Request(`https://order.blabfood.app${path}`, {method}),
    env:{ASSETS:{fetch:async request=>{assets.push(request.url);return new Response('menu');}}}, next:async()=>new Response('next')});
  return {response,assets,configs};
}
test('legacy domain redirects both slash forms and preserves business parameters', async()=>{
  for(const suffix of ['', '/']) {
    const r=await dispatch(`/tenant-a${suffix}?mode=edit&key=opaque`);
    assert.equal(r.response.status,302);
    const target=new URL(r.response.headers.get('location'));
    assert.equal(target.origin,'https://benmi-order.pages.dev');
    assert.equal(target.searchParams.get('tenant_id'),'tenant-a');
    assert.equal(target.searchParams.get('key'),'opaque');
    assert.equal(r.assets.length,0);
    assert.equal(r.response.headers.get('cache-control'),'no-store');
    assert.equal(r.configs[0].options.cache,'no-store');
  }
});
test('active domain serves both forms internally and canonicalizes query-only URLs', async()=>{
  for(const suffix of ['', '/']) {
    const r=await dispatch(`/tenant-a${suffix}`,'blabfood');
    assert.equal(r.response.status,200);
    assert.equal(new URL(r.assets[0]).pathname,'/');
    assert.equal(r.response.headers.get('location'),null);
  }
  const r=await dispatch('/?tenant_id=tenant-a','blabfood');
  assert.equal(r.response.status,302);
  assert.equal(new URL(r.response.headers.get('location')).pathname,'/tenant-a');
});
test('callback parameters are never redirected, including primary LIFF state',async()=>{
  for(const query of ['code=abc&state=xyz','liff.state=%2Ftenant-a','liff.access_token=opaque','liffClientId=123','access_token=opaque']) {
    const r=await dispatch(`/tenant-a?${query}`);
    assert.equal(r.response.status,200);
    assert.equal(new URL(r.assets[0]).search,`?${query}`);
    assert.equal(r.response.headers.get('location'),null);
  }
});
test('tenant conflict, unavailable config, assets and POST do not redirect',async()=>{
  assert.equal((await dispatch('/tenant-a?tenant_id=other')).response.status,400);
  for(const path of ['/payment-result?tenant_id=tenant-a&payment_id=p1','/staff-order?tenant_id=tenant-a']) {
    const r=await dispatch(path,'blabfood');
    assert.equal(await r.response.text(),'next');
    assert.equal(r.configs.length,0);
  }
  assert.equal((await dispatch('/tenant-a','legacy','GET',true)).response.status,503);
  for(const [path,method] of [['/js/client-core.js','GET'],['/tenant-a','POST']]) {
    const r=await dispatch(path,'legacy',method);
    assert.equal(await r.response.text(),'next');
    assert.equal(r.configs.length,0);
  }
});
