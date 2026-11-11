const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const { fixture } = require('./helpers/staff-ordering.cjs');
const { handleStaffRoute } = require('../benmi-worker-official/src/modules/staff.ts');
const { getOrders, getHistoryAll } = require('../benmi-worker-official/src/modules/orders.ts');
const { getConfig } = require('../benmi-worker-official/src/modules/config.ts');
const { getTenantBootstrap, invalidateBootstrapCache } = require('../benmi-worker-official/src/modules/bootstrap.ts');
const { getOptionCatalog } = require('../benmi-worker-official/src/modules/option-groups.ts');
const { createTenantRepository } = require('../benmi-worker-official/src/repositories/tenant.repository.ts');

const root = process.cwd();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm'
};

function startStaticServer(t) {
  const server = http.createServer((req, res) => {
    const reqPath = new URL(req.url, 'http://127.0.0.1').pathname;
    const rel = reqPath === '/' ? 'orders.html' : reqPath.replace(/^\/+/, '');
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(root + path.sep) && abs !== root) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(abs).pipe(res);
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      t.after(() => new Promise(r => server.close(r)));
      resolve(server);
    });
  });
}

test('Staff Order iframe refreshes table occupancy after Live Order marks a table PAID while preserving cart', async t => {
  const f = await fixture(t);
  await f.apply(`
    UPDATE tenant_config
       SET allow_dine_in = 1,
           allow_scheduled_pickup = 1,
           features = '["dine_in","reports"]',
           store_status = 'open',
           staff_ordering_capabilities = '${JSON.stringify({ ...f.capabilities, session: false })}'
     WHERE tenant_id = 'a';
    INSERT INTO restaurant_tables(id, tenant_id, label, sort_order, is_active)
      VALUES ('empty-a', 'a', 'A2', 2, 1);
  `);
  await invalidateBootstrapCache('a', f.env);

  // Place an active dine-in order on Table A1 (table-a)
  const activeOrder = await f.call('/api/staff/orders', f.input());
  assert.equal(activeOrder.http, 201, JSON.stringify(activeOrder));

  const server = await startStaticServer(t);
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  page.setDefaultTimeout(8000);

  const pageErrors = [];
  let tablesFetchCount = 0;
  let paidPatchCount = 0;
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.route('**/api/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;
    if (req.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS'
        }
      });
    }
    if (pathname === '/api/orders/events') {
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    }

    const request = new Request(req.url(), {
      method: req.method(),
      headers: req.headers(),
      ...(['GET', 'HEAD'].includes(req.method()) ? {} : { body: req.postData() })
    });

    let response;
    if (pathname === '/api/config') {
      const ctx = await createTenantRepository(f.env.DB, f.env.ORDER_STATE, f.env).getTenantContext('a');
      response = await getConfig(request, f.env, ctx);
    } else if (pathname === '/api/tenant/bootstrap') {
      response = await getTenantBootstrap(request, f.env);
    } else if (pathname === '/api/menu/options') {
      response = await getOptionCatalog(request, f.env);
    } else if (pathname === '/api/orders') {
      response = await getOrders(request, f.env);
    } else if (pathname === '/api/orders/history-all') {
      response = await getHistoryAll(request, f.env);
    } else if (pathname.startsWith('/api/staff')) {
      if (pathname === '/api/staff/tables' && req.method() === 'GET') {
        tablesFetchCount += 1;
      }
      if (/\/api\/staff\/orders\/[^/]+\/status$/.test(pathname) && req.method() === 'PATCH') {
        paidPatchCount += 1;
      }
      const ctx = await createTenantRepository(f.env.DB, f.env.ORDER_STATE, f.env).getTenantContext('a');
      response = await handleStaffRoute(request, f.env, pathname, ctx);
    } else {
      response = new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    }

    return route.fulfill({
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: await response.text()
    });
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${baseUrl}/orders.html?tenant=a&env=dev#staff-order`);
  await page.waitForFunction(() => typeof switchTab === 'function');
  if (await page.locator('#i18n-btn-start-shift').isVisible()) {
    await page.locator('#i18n-btn-start-shift').click();
  }

  await page.waitForFunction(() => document.getElementById('staff-order-iframe')?.contentWindow?.StaffOrder?.ready?.());
  const staffFrame = page.frameLocator('#staff-order-iframe');

  // Table A1 must initially appear occupied inside #staff-order-iframe; A2 is free.
  await staffFrame.locator('[data-staff-table="table-a"] .staff-dot-occupied').waitFor();
  assert.equal(await staffFrame.locator('[data-staff-table="empty-a"] .staff-dot-occupied').count(), 0);

  // Select Table A1 and put an item into the draft cart before leaving the tab.
  await staffFrame.locator('[data-staff-table="table-a"]').click();
  await staffFrame.locator('.card').first().click();
  await page.waitForFunction(() => {
    const win = document.getElementById('staff-order-iframe')?.contentWindow;
    return Boolean(win && Object.values(win.cart || {}).some(qty => Number(qty) > 0));
  });

  // Switch parent POS to Live Orders, move ACCEPTED -> DONE -> PAID on Table A1.
  const fetchesBeforeLeave = tablesFetchCount;
  await page.evaluate(async () => {
    switchTab('live');
    if (typeof fetchOrders === 'function') await fetchOrders();
  });
  await Promise.all([
    page.waitForResponse(res => res.url().includes('/api/orders?') && res.request().method() === 'GET'),
    page.locator('#list-left .btn-action-ready').first().click()
  ]);
  await Promise.all([
    page.waitForResponse(res => res.url().includes('/status') && res.request().method() === 'PATCH' && res.status() === 200),
    page.locator('#list-right .btn-action-paid').first().click()
  ]);
  await page.waitForFunction(() => document.querySelectorAll('#list-right .btn-action-paid').length === 0);
  assert.equal(paidPatchCount, 2, 'Live Order READY -> PAID flow must dispatch 2 PATCH status calls');

  // Return to Staff Order tab -> parent postMessage('STAFF_TABLES_REFRESH') triggers table sync.
  await page.evaluate(() => switchTab('staff-order'));
  await page.waitForFunction(
    prev => {
      const iframe = document.getElementById('staff-order-iframe');
      const occupiedDot = iframe?.contentDocument?.querySelector('[data-staff-table="table-a"] .staff-dot-occupied');
      return !occupiedDot;
    },
    fetchesBeforeLeave
  );

  assert.equal(tablesFetchCount > fetchesBeforeLeave, true, 'Returning to Staff Order must refresh /api/staff/tables');
  assert.equal(await staffFrame.locator('[data-staff-table="table-a"] .staff-dot-occupied').count(), 0);

  const tableAOptionText = await staffFrame.locator('#dinein-table-number option[value="table-a"]').innerText();
  assert.match(tableAOptionText, /(空桌|Trống)/);

  const statusMsg = await staffFrame.locator('#staff-order-status').innerText();
  assert.match(statusMsg, /(空桌|Bàn trống)/);

  // Cart item drafted before switching tabs must still be preserved.
  const cartStillHasMeal = await page.evaluate(() => {
    const win = document.getElementById('staff-order-iframe')?.contentWindow;
    return Object.values(win?.cart || {}).reduce((sum, n) => sum + Number(n || 0), 0);
  });
  assert.equal(cartStillHasMeal > 0, true, 'Refreshing table occupancy must not wipe in-progress cart items');

  // Focus listener inside staff iframe also triggers sync without errors.
  const countBeforeFocus = tablesFetchCount;
  await page.evaluate(() => {
    document.getElementById('staff-order-iframe').contentWindow.dispatchEvent(new Event('focus'));
  });
  await page.waitForFunction(() => true);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(tablesFetchCount > countBeforeFocus, true, 'Focus event triggers table occupancy refresh');

  assert.deepEqual(pageErrors, [], 'Staff Order table-sync flow must run without browser page errors');
});
