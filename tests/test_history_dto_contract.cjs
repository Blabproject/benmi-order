const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { fixture } = require('./helpers/staff-ordering.cjs');
const { getHistoryAll } = require('../benmi-worker-official/src/modules/orders.ts');
const { getConfig } = require('../benmi-worker-official/src/modules/config.ts');

const FORBIDDEN_SECRET_KEYS = [
  'lineChannelToken',
  'line_channel_token',
  'lineChannelSecret',
  'line_channel_secret',
  'linePayChannelSecret',
  'line_pay_channel_secret',
  'groqApiKey',
  'groq_api_key',
  'defaultPassword',
  'default_password',
  'pinHash',
  'pin_hash'
];

function assertNoSecretLeak(obj, contextLabel) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => assertNoSecretLeak(item, `${contextLabel}[${index}]`));
    return;
  }
  for (const key of Object.keys(obj)) {
    assert.equal(FORBIDDEN_SECRET_KEYS.includes(key), false, `${contextLabel} must not expose secret key "${key}"`);
    assertNoSecretLeak(obj[key], `${contextLabel}.${key}`);
  }
}

test('getHistoryAll and getConfig satisfy frontend DTO contracts with zero secret leakage', async t => {
  const f = await fixture(t);

  // 1. Place a staff dine-in order on Table A1 and settle it as PAID
  const created = await f.call('/api/staff/orders', f.input());
  assert.equal(created.http, 201, JSON.stringify(created));

  const paid = await f.call(
    `/api/staff/orders/${encodeURIComponent(created.key)}/status`,
    { status: 'PAID', expectedRevision: created.revision },
    null,
    'PATCH'
  );
  assert.equal(paid.http, 200, JSON.stringify(paid));

  // 2. Seed a direct takeaway PICKED_UP order in D1
  await f.apply(`
    INSERT INTO orders (
      key, order_id, display_key, business_date, legacy_key, tenant_id,
      customer_name, pickup_time, order_content, status, total_amount,
      dining_option, source, created_at
    ) VALUES (
      'T-20261111-002', 'ord-t2', '261111-002', '2026-11-11', 'T-20261111-002', 'a',
      'Trần Thị Bình', '2026-11-11 12:30', '1x Meal $100', 'PICKED_UP', 100,
      'takeaway', 'legacy', '2026-11-11 04:00:00'
    );
  `);

  const historyRes = await getHistoryAll(
    new Request('https://local.test/api/orders/history-all?tenant_id=a'),
    f.env
  );
  assert.equal(historyRes.status, 200);
  const orders = await historyRes.json();
  assert.equal(Array.isArray(orders), true, 'getHistoryAll must return JSON array matching HistoryOrderDto[]');
  assert.equal(orders.length, 2);

  assertNoSecretLeak(orders, 'getHistoryAll');

  const dineInDto = orders.find(item => item.key === created.key);
  assert.ok(dineInDto, 'Paid dine-in order must appear in history DTO array');
  assert.equal(typeof dineInDto.key, 'string');
  assert.equal(typeof dineInDto.customer, 'string');
  assert.equal(typeof dineInDto.time, 'string');
  assert.equal(typeof dineInDto.content, 'string');
  assert.equal(dineInDto.status, 'PAID');
  assert.equal(Number.isFinite(dineInDto.createdAt), true);
  assert.equal(Number.isFinite(dineInDto.total), true);
  assert.equal(dineInDto.diningOption, 'dine_in');
  assert.equal(dineInDto.tableNumber, 'A1');
  assert.equal(dineInDto.tableId, 'table-a');
  assert.equal(Number.isFinite(dineInDto.roundCount), true);
  assert.ok(Array.isArray(dineInDto.items));
  assert.equal(dineInDto.detailSnapshot?.schemaVersion, 1);
  assert.ok(Array.isArray(dineInDto.detailSnapshot?.rounds));

  const takeawayDto = orders.find(item => item.key === 'T-20261111-002');
  assert.ok(takeawayDto, 'Picked-up takeaway order must appear in history DTO array');
  assert.equal(takeawayDto.diningOption, 'takeaway');
  assert.equal(takeawayDto.displayKey, '261111-002');

  // 3. Validate public /api/config DTO keys & zero secret exposure
  const configRes = await getConfig(
    new Request('https://local.test/api/config?tenant_id=a'),
    f.env,
    {
      ...f.context('a'),
      lineChannelToken: 'secret-token',
      groqApiKey: 'secret-groq'
    }
  );
  assert.equal(configRes.status, 200);
  const configDto = await configRes.json();
  assert.equal(configDto.tenantId, 'a');
  assert.equal(typeof configDto.allowDineIn, 'boolean');
  assert.ok(Array.isArray(configDto.features));
  assertNoSecretLeak(configDto, 'getConfig');
});

test('Pages middleware passes through /assets/* and /frontend/* without rewriting to tenant paths', async () => {
  const middlewarePath = path.resolve(process.cwd(), 'functions/_middleware.js');
  const mod = await import(pathToFileURL(middlewarePath).href);
  assert.equal(typeof mod.onRequest, 'function');

  for (const pathname of ['/assets/pos-sandbox-abc123.js', '/frontend/apps/pos/sandbox.html']) {
    let passedThrough = false;
    const response = await mod.onRequest({
      request: new Request(`https://pos.blabfood.app${pathname}`),
      next: async () => {
        passedThrough = true;
        return new Response('ok', { status: 200 });
      }
    });
    assert.equal(passedThrough, true, `${pathname} must bypass POS tenant rewrite`);
    assert.equal(response.status, 200);
  }
});
