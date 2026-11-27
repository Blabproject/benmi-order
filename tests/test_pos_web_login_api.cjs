// Real local Miniflare D1 integration test; all rows are synthetic. Never calls remote APIs.
const { test, suite } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../benmi-worker-official/node_modules/typescript');

require.extensions['.ts'] = (mod, file) => {
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  mod._compile(compiled.outputText, file);
};

const { Miniflare, convertV4MiniflareOptions } = require('../benmi-worker-official/node_modules/miniflare');
const { schemaTrueFixture } = require('./helpers/option-groups.cjs');
const worker = require('../benmi-worker-official/src/index.ts').default;
const { STAFF_CAPABILITIES } = require('../benmi-worker-official/src/modules/staff-access.ts');

let cachedSchemaSqls = null;
function getCachedSchemaSqls() {
  if (!cachedSchemaSqls) {
    const source = schemaTrueFixture().db;
    const objects = source.prepare(
      "SELECT type, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END"
    ).all();
    cachedSchemaSqls = objects.map((o) => o.sql);
    source.close();
  }
  return cachedSchemaSqls;
}

async function setupWorkerFixture(t) {
  const schemaSqls = getCachedSchemaSqls();
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: ['DB'],
    })
  );
  t.after(() => mf.dispose());
  const DB = await mf.getD1Database('DB');

  const capsJson = JSON.stringify(Object.fromEntries(STAFF_CAPABILITIES.map((k) => [k, true])));
  const seedSql = [
    "INSERT INTO tenants(id, name) VALUES ('open_store', 'Open Store'), ('locked_store', 'Locked Store'), ('default_pin_locked', 'Default PIN Locked');",
    `INSERT INTO tenant_config(tenant_id, brand_name, default_password, features, staff_ordering_enabled, staff_ordering_capabilities, allow_dine_in, is_active) VALUES
      ('open_store', 'Open Store', '1234', '["reports","dine_in"]', 1, '${capsJson}', 1, 1),
      ('locked_store', 'Locked Store', '10175846', '["reports","dine_in","pos_web_login"]', 1, '${capsJson}', 1, 1),
      ('default_pin_locked', 'Default PIN Locked', '12345678', '["pos_web_login"]', 0, '{}', 0, 1);`,
    "INSERT INTO menu_categories(id, tenant_id, slug, name) VALUES ('cat_open', 'open_store', 'cat_open', 'Meals'), ('cat_locked', 'locked_store', 'cat_locked', 'Drinks');",
    "INSERT INTO menu_items(id, tenant_id, category_id, name, price) VALUES ('item_open', 'open_store', 'cat_open', 'Rice', 80), ('item_locked', 'locked_store', 'cat_locked', 'Soy Milk', 20);",
    "INSERT INTO restaurant_tables(id, tenant_id, label) VALUES ('tbl_open', 'open_store', 'T1'), ('tbl_locked', 'locked_store', 'A1');",
  ];
  await DB.batch([...schemaSqls, ...seedSql].map((s) => DB.prepare(s)));

  const kv = new Map();
  const env = {
    DB,
    UNIFIED_MENU_ENABLED: 'true',
    ORDER_DETAIL_READS: 'true',
    ORDER_DETAIL_WRITES: 'true',
    ORDER_STATE: {
      get: async (k, type) => (type === 'json' && kv.has(k) ? JSON.parse(kv.get(k)) : kv.get(k) || null),
      put: async (k, v) => kv.set(k, v),
      delete: async (k) => kv.delete(k),
    },
  };
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

  async function request(method, path, { tenant = 'locked_store', body, token, ip = '203.0.113.10' } = {}) {
    const sep = path.includes('?') ? '&' : '?';
    const url = path.includes('tenant_id=') ? `https://api.test${path}` : `https://api.test${path}${sep}tenant_id=${encodeURIComponent(tenant)}`;
    const headers = { 'CF-Connecting-IP': ip };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = new Request(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const res = await worker.fetch(req, env, ctx);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, headers: res.headers, json, text };
  }

  return { DB, env, kv, request };
}

suite('POS web login API & feature-flagged route protection', () => {
  test('tenants without pos_web_login stay open while enabled tenants fail closed without a Bearer token', async (t) => {
    const f = await setupWorkerFixture(t);

    // Non-flagged tenant works as before with no Bearer header
    assert.equal((await f.request('GET', '/api/orders', { tenant: 'open_store' })).status, 200);
    assert.equal((await f.request('GET', '/api/reports/items-analytics', { tenant: 'open_store' })).status, 200);
    assert.equal((await f.request('POST', '/api/config', { tenant: 'open_store', body: { storeStatus: 'busy' } })).status, 200);
    assert.equal((await f.request('GET', '/api/staff/tables', { tenant: 'open_store' })).status, 200);
    const openSess = await f.request('GET', '/api/pos/session', { tenant: 'open_store' });
    assert.equal(openSess.status, 200);
    assert.equal(openSess.json.posWebLoginRequired, false);

    // Flagged tenant blocks all POS-internal routes without session token
    const blockedCases = [
      ['GET', '/api/orders'],
      ['GET', '/api/orders/delivery-details?key=missing'],
      ['GET', '/api/orders/history-summary'],
      ['GET', '/api/orders/by-date?date=2026-11-28'],
      ['GET', '/api/orders/history-all'],
      ['GET', '/api/reports/items-analytics'],
      ['POST', '/api/orders/auto-accept', { key: 'k1', status: 'ACCEPTED' }],
      ['POST', '/api/update', { key: 'k1', status: 'ACCEPTED' }],
      ['POST', '/api/config', { storeStatus: 'paused' }],
      ['POST', '/api/menu', {}],
      ['POST', '/api/menu/product', {}],
      ['POST', '/api/menu/option-group', {}],
      ['GET', '/api/menu/modifier-library'],
      ['POST', '/api/menu/ai-translate', { entries: [] }],
      ['PUT', '/api/menu/shifts', { operatingShifts: [] }],
      ['POST', '/api/menu/qr-channels', { label: 'Takeaway' }],
      ['DELETE', '/api/menu/qr-channels?id=missing'],
      ['PATCH', '/api/menu/schedule', {}],
      ['POST', '/api/menu/stock-status', { status: 'out_of_stock' }],
      ['POST', '/api/menu/bundle-rules', {}],
      ['POST', '/api/menu/bundles', {}],
      ['POST', '/api/image', { name: 'x', dataUri: 'data:image/png;base64,a' }],
      ['DELETE', '/api/image', { name: 'x' }],
      ['POST', '/api/auth/change', { current: '10175846', newPassword: '87654321' }],
      ['POST', '/api/auth/templink', {}],
      ['GET', '/api/staff/tables'],
      ['POST', '/api/staff/orders', {}],
    ];

    for (const [method, endpoint, body] of blockedCases) {
      const res = await f.request(method, endpoint, { tenant: 'locked_store', body });
      assert.equal(res.status, 401, `${method} ${endpoint} should require POS auth when pos_web_login enabled`);
      assert.equal(res.json?.error, 'POS_AUTH_REQUIRED', `${method} ${endpoint} error code mismatch`);
      assert.equal(res.headers.get('cache-control'), 'no-store');
    }

    // Customer-facing and public bootstrap routes remain open for the flagged tenant
    const publicGets = [
      '/api/tenant/bootstrap',
      '/api/config',
      '/api/orders/waiting-count',
      '/api/menu',
      '/api/menu/options',
      '/api/menu/shifts',
      '/api/menu/qr-channels',
      '/api/image_list',
      '/api/table/status',
      '/api/marketplace',
      '/api/staff/capabilities',
      '/api/pos/session',
      '/api/health',
    ];
    for (const endpoint of publicGets) {
      const res = await f.request('GET', endpoint, { tenant: 'locked_store' });
      assert.notEqual(res.status, 401, `GET ${endpoint} must stay public for customers`);
    }

    // Customer order submission (/api/create) is NOT gated by POS login
    const custCreate = await f.request('POST', '/api/create', {
      tenant: 'locked_store',
      body: {
        customer: 'Guest',
        time: '12:30',
        diningOption: 'takeaway',
        items: [{ itemId: 'item_locked', name: 'Soy Milk', price: 20, quantity: 1 }],
        orderSelections: [],
        total: 20,
      },
    });
    assert.notEqual(custCreate.status, 401, 'POST /api/create must stay open for customer checkout');
  });

  test('PIN-only login issues Bearer session, accepts default PIN 12345678, blocks cross-tenant use, revokes on logout and PIN change, and rate-limits failures', async (t) => {
    const f = await setupWorkerFixture(t);

    // 1. Default PIN 12345678 is accepted on POS web login (unlike Payment Workspace)
    const defLogin = await f.request('POST', '/api/pos/session', {
      tenant: 'default_pin_locked',
      body: { pin: '12345678' },
    });
    assert.equal(defLogin.status, 200);
    assert.equal(defLogin.json.ok, true);
    assert.ok(defLogin.json.token && defLogin.json.token.length >= 32);

    // 2. Missing / wrong PIN checks
    const missingPin = await f.request('POST', '/api/pos/session', { tenant: 'locked_store', body: { pin: '  ' } });
    assert.equal(missingPin.status, 400);
    assert.equal(missingPin.json.error, 'MISSING_PIN');

    const badPin = await f.request('POST', '/api/pos/session', { tenant: 'locked_store', body: { pin: '99999999' } });
    assert.equal(badPin.status, 401);
    assert.equal(badPin.json.error, 'INVALID_PIN');

    // 3. Valid custom PIN unlocks POS routes
    const login = await f.request('POST', '/api/pos/session', {
      tenant: 'locked_store',
      body: { pin: '10175846' },
    });
    assert.equal(login.status, 200);
    assert.equal(login.headers.get('cache-control'), 'no-store');
    const token = login.json.token;

    const sessionCheck = await f.request('GET', '/api/pos/session', { tenant: 'locked_store', token });
    assert.equal(sessionCheck.status, 200);
    assert.equal(sessionCheck.json.authenticated, true);
    assert.equal(sessionCheck.json.posWebLoginRequired, true);

    assert.equal((await f.request('GET', '/api/orders', { tenant: 'locked_store', token })).status, 200);
    assert.equal((await f.request('GET', '/api/reports/items-analytics', { tenant: 'locked_store', token })).status, 200);
    assert.equal((await f.request('GET', '/api/staff/tables', { tenant: 'locked_store', token })).status, 200);
    assert.equal((await f.request('POST', '/api/config', { tenant: 'locked_store', token, body: { storeStatus: 'busy' } })).status, 200);

    // 4. Cross-tenant isolation: token for locked_store cannot access default_pin_locked
    assert.equal((await f.request('GET', '/api/orders', { tenant: 'default_pin_locked', token })).status, 401);

    // 5. Logout revokes token immediately
    const logoutRes = await f.request('DELETE', '/api/pos/session', { tenant: 'locked_store', token });
    assert.equal(logoutRes.status, 200);
    assert.equal((await f.request('GET', '/api/orders', { tenant: 'locked_store', token })).status, 401);

    // 6. Re-login and change PIN invalidates existing sessions
    const login2 = await f.request('POST', '/api/pos/session', {
      tenant: 'locked_store',
      body: { pin: '10175846' },
    });
    const token2 = login2.json.token;
    const changePin = await f.request('POST', '/api/auth/change', {
      tenant: 'locked_store',
      token: token2,
      body: { current: '10175846', newPassword: '24681357', tenant_id: 'locked_store' },
    });
    assert.equal(changePin.status, 200);
    assert.equal((await f.request('GET', '/api/orders', { tenant: 'locked_store', token: token2 })).status, 401);

    // Old PIN no longer works, new PIN works
    assert.equal((await f.request('POST', '/api/pos/session', { tenant: 'locked_store', body: { pin: '10175846' } })).status, 401);
    const login3 = await f.request('POST', '/api/pos/session', {
      tenant: 'locked_store',
      body: { pin: '24681357' },
    });
    assert.equal(login3.status, 200);

    // 7. Failed PIN rate-limiting (10 wrong attempts from same IP -> 11th returns 429)
    for (let i = 0; i < 10; i += 1) {
      const attempt = await f.request('POST', '/api/pos/session', {
        tenant: 'locked_store',
        body: { pin: '00000000' },
        ip: '198.51.100.77',
      });
      assert.equal(attempt.status, 401);
    }
    const blockedAttempt = await f.request('POST', '/api/pos/session', {
      tenant: 'locked_store',
      body: { pin: '24681357' },
      ip: '198.51.100.77',
    });
    assert.equal(blockedAttempt.status, 429);
    assert.equal(blockedAttempt.json.error, 'POS_LOGIN_RATE_LIMIT');
  });
});
