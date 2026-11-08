const {test}=require('node:test');const assert=require('node:assert/strict');
const {fixture}=require('./helpers/staff-ordering.cjs');
const {createTenantRepository}=require('../benmi-worker-official/src/repositories/tenant.repository.ts');
const {getConfig,updateConfig}=require('../benmi-worker-official/src/modules/config.ts');
const {normalizeStoreStatus,getTaiwanDateStr}=require('../benmi-worker-official/src/types/tenant.ts');

test('normalizeStoreStatus handles 4 canonical statuses and auto-reopens expired closed dates', () => {
  assert.equal(normalizeStoreStatus('open'), 'open');
  assert.equal(normalizeStoreStatus('busy'), 'busy');
  assert.equal(normalizeStoreStatus('paused'), 'paused');
  assert.equal(normalizeStoreStatus('closed'), 'closed');

  const today = new Date('2026-11-08T12:00:00Z'); // 2026-11-08 20:00 in Taiwan
  const tomorrow = new Date('2026-11-09T02:00:00Z'); // 2026-11-09 10:00 in Taiwan

  // Same day: closed
  assert.equal(normalizeStoreStatus('closed:2026-11-08', today), 'closed');

  // Next day: auto-reopened to open
  assert.equal(normalizeStoreStatus('closed:2026-11-08', tomorrow), 'open');

  // Paused remains paused across days
  assert.equal(normalizeStoreStatus('paused', tomorrow), 'paused');
});

test('store_status updates support closed with auto-date stamp and auto-reopening next day', async t => {
  const f = await fixture(t);
  const tenant = f.context('a');
  const url = 'https://api.test/api/config?tenant_id=a';
  const repo = createTenantRepository(f.env.DB, f.env.ORDER_STATE, f.env);

  // 1. Setting 'closed' appends current Taiwan date stamp
  const rClosed = await updateConfig(new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeStatus: 'closed' })
  }), f.env, tenant);
  assert.equal(rClosed.status, 200, await rClosed.text());

  const row = await f.DB.prepare("SELECT store_status FROM tenant_config WHERE tenant_id='a'").first();
  const todayTw = getTaiwanDateStr();
  assert.equal(row.store_status, `closed:${todayTw}`);

  // getTenantContext and getConfig report 'closed' today
  assert.equal((await repo.getTenantContext('a')).storeStatus, 'closed');
  assert.equal((await (await getConfig(new Request(url), f.env, tenant)).json()).storeStatus, 'closed');

  // 2. If closed date is in the past, it automatically evaluates to 'open'
  await f.apply("UPDATE tenant_config SET store_status='closed:2026-11-01' WHERE tenant_id='a';");
  await repo.invalidateCache('a');
  assert.equal((await repo.getTenantContext('a')).storeStatus, 'open');
  assert.equal((await (await getConfig(new Request(url), f.env, tenant)).json()).storeStatus, 'open');

  // 3. Paused remains paused
  const rPaused = await updateConfig(new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeStatus: 'paused' })
  }), f.env, tenant);
  assert.equal(rPaused.status, 200);
  assert.equal((await repo.getTenantContext('a')).storeStatus, 'paused');

  // 4. Invalid status returns 400
  const rInvalid = await updateConfig(new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeStatus: 'holiday' })
  }), f.env, tenant);
  assert.equal(rInvalid.status, 400);
});
