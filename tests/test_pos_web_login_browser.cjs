const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const root = process.cwd();
const distRoot = path.join(root, 'dist');

function ensureDistBuilt() {
  if (!fs.existsSync(path.join(distRoot, '.vite/manifest.json')) || !fs.existsSync(path.join(distRoot, 'orders.html'))) {
    execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.config.mts'], {
      cwd: root,
      stdio: 'inherit',
    });
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

function startStaticServer(t) {
  ensureDistBuilt();
  const server = http.createServer((req, res) => {
    const reqPath = new URL(req.url, 'http://127.0.0.1').pathname;
    const rel = reqPath === '/' ? 'orders.html' : reqPath.replace(/^\/+/, '');
    const abs = path.resolve(distRoot, rel);
    if (!abs.startsWith(distRoot + path.sep) && abs !== distRoot) {
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
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      t.after(() => new Promise((r) => server.close(r)));
      resolve(server);
    });
  });
}

function createApiRouterMock() {
  const validTokens = new Set();
  const calls = {
    unauthOrders: 0,
    authOrders: 0,
    loginAttempts: [],
    logouts: 0,
    historyAuthHeaders: [],
    reportsAuthHeaders: [],
    configPostAuthHeaders: [],
  };
  let nextSeq = 1;
  let forceRevokeNext = false;

  const lockedTenant = {
    id: 'bainianxiaoshi',
    tenantId: 'bainianxiaoshi',
    brandName: '百年小食',
    features: ['reports', 'flex_notifications', 'pos_web_login'],
    allowDineIn: false,
    allowScheduledPickup: true,
    storeStatus: 'open',
    operatingHours: {},
    paymentMethods: ['cash'],
  };

  const openTenant = {
    id: 'benmi',
    tenantId: 'benmi',
    brandName: 'Benmi Open',
    features: ['reports'],
    allowDineIn: false,
    allowScheduledPickup: true,
    storeStatus: 'open',
    operatingHours: {},
    paymentMethods: ['cash'],
  };

  const sampleOrders = [
    {
      key: 'ORD-BNX-001',
      displayKey: '261128-001',
      customer: '陳小姐',
      time: '12:30',
      content: '2x 無糖豆漿 $40',
      status: 'ACCEPTED',
      createdAt: Date.now(),
      total: 40,
      diningOption: 'takeaway',
      items: [{ name: '無糖豆漿', quantity: 2, price: 20, subtotal: 40 }],
    },
  ];

  async function install(page) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const pathname = url.pathname;
      if (req.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: cors });
      }
      const tenantId = url.searchParams.get('tenant_id') || url.searchParams.get('tenant') || req.headers()['x-tenant-id'] || 'benmi';
      const isLockedStore = tenantId === 'bainianxiaoshi';
      const auth = req.headers()['authorization'] || '';
      const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      const hasValidSession = validTokens.has(bearer) && !forceRevokeNext;

      const fulfillJson = (body, status = 200) => route.fulfill({ status, headers: cors, json: body });

      if (pathname === '/api/tenant/bootstrap') {
        return fulfillJson({
          tenant: isLockedStore ? lockedTenant : openTenant,
          menuComplete: true,
          catalog: [],
          modifiers: [],
          customizations: [],
        });
      }

      if (pathname === '/api/config' && req.method() === 'GET') {
        const tObj = isLockedStore ? lockedTenant : openTenant;
        return fulfillJson({
          tenantId,
          ...tObj,
        });
      }

      if (pathname === '/api/pos/session') {
        if (req.method() === 'GET') {
          return fulfillJson({
            ok: true,
            authenticated: validTokens.has(bearer),
            posWebLoginRequired: isLockedStore,
            tenant_id: tenantId,
          });
        }
        if (req.method() === 'POST') {
          const body = req.postDataJSON() || {};
          calls.loginAttempts.push(body);
          if (body.pin === '10175846') {
            forceRevokeNext = false;
            const tok = `pos_tok_${nextSeq++}_${'a'.repeat(24)}`;
            validTokens.add(tok);
            return fulfillJson({ ok: true, token: tok, tenant_id: tenantId });
          }
          return fulfillJson({ ok: false, error: 'INVALID_PIN' }, 401);
        }
        if (req.method() === 'DELETE') {
          calls.logouts += 1;
          validTokens.delete(bearer);
          return fulfillJson({ ok: true });
        }
      }

      // Protected POS routes for locked store
      const isPosProtected = [
        '/api/orders',
        '/api/orders/history-all',
        '/api/reports/items-analytics',
        '/api/menu/modifier-library',
      ].includes(pathname) || (pathname === '/api/config' && req.method() === 'POST');

      if (isLockedStore && isPosProtected && !hasValidSession) {
        if (pathname === '/api/orders') calls.unauthOrders += 1;
        return fulfillJson({ ok: false, error: 'POS_AUTH_REQUIRED' }, 401);
      }

      if (pathname === '/api/orders') {
        calls.authOrders += 1;
        return fulfillJson(sampleOrders);
      }
      if (pathname === '/api/orders/history-all') {
        calls.historyAuthHeaders.push(auth);
        return fulfillJson([]);
      }
      if (pathname === '/api/reports/items-analytics') {
        calls.reportsAuthHeaders.push(auth);
        return fulfillJson({ range: 'today', totalRevenue: 0, totalOrders: 0, items: [] });
      }
      if (pathname === '/api/config' && req.method() === 'POST') {
        calls.configPostAuthHeaders.push(auth);
        return fulfillJson({ ok: true });
      }
      if (pathname === '/api/staff/capabilities') {
        return fulfillJson({ ok: true, capabilities: {} });
      }
      if (pathname === '/api/payments/config') {
        return fulfillJson({ linePay: { configured: false }, paymentMethods: ['cash'] });
      }
      if (pathname === '/api/menu/modifier-library') {
        return fulfillJson({ complete: true, groups: [] });
      }
      if (pathname === '/api/image_list') {
        return fulfillJson([]);
      }
      return fulfillJson({});
    });
  }

  return {
    calls,
    revokeAll: () => {
      validTokens.clear();
      forceRevokeNext = true;
    },
    install,
  };
}

for (const [browserName, engine] of Object.entries({ chromium, webkit })) {
  test(`${browserName}: PIN-only POS login, header propagation, reload persistence, logout, revocation, and open-tenant isolation`, async (t) => {
    const server = await startStaticServer(t);
    const browser = await engine.launch({ headless: true });
    t.after(() => browser.close());

    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const api = createApiRouterMock();
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    page.setDefaultTimeout(8000);
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await api.install(page);

    // 1. Cold open on locked tenant bainianxiaoshi
    await page.goto(`${baseUrl}/orders.html?tenant=bainianxiaoshi&env=dev`);
    await page.locator('#storeActivationModal.force-show.pin-only-mode').waitFor({ state: 'visible' });

    assert.equal(api.calls.unauthOrders, 0, 'Locked tenant must not request /api/orders before login');
    assert.equal(await page.locator('#startShiftModal').isVisible(), false, 'Shift modal must stay hidden before PIN login');
    assert.equal(await page.locator('#activation-tenant-group').isVisible(), false, 'Tenant input group must be hidden in PIN-only mode');
    assert.equal(await page.locator('#activation-store-name').innerText(), '百年小食');
    assert.equal(await page.locator('#activation-pin').getAttribute('placeholder'), '請輸入管理 PIN 碼');

    // Verify no underlying workspace visibility or focus bleed + responsive 48px targets on mobile & tablet
    for (const vp of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(vp);
      const metrics = await page.evaluate(() => {
        const box = document.querySelector('.store-activation-box');
        const pin = document.getElementById('activation-pin');
        const toggle = document.getElementById('activation-pin-toggle');
        const btn = document.getElementById('btn-submit-activation');
        const main = document.querySelector('.main-layout');
        return {
          mainVisibility: main ? getComputedStyle(main).visibility : '',
          mainInert: main ? Boolean(main.inert) : false,
          overflow: box ? box.scrollWidth > box.clientWidth + 1 : true,
          pinRect: pin.getBoundingClientRect(),
          toggleRect: toggle.getBoundingClientRect(),
          btnRect: btn.getBoundingClientRect(),
        };
      });
      assert.equal(metrics.mainVisibility, 'hidden');
      assert.equal(metrics.mainInert, true);
      assert.equal(metrics.overflow, false, `${browserName} ${vp.width}: login modal horizontal overflow`);
      assert.ok(metrics.pinRect.height >= 47.9);
      assert.ok(metrics.toggleRect.width >= 47.9 && metrics.toggleRect.height >= 47.9);
      assert.ok(metrics.btnRect.height >= 47.9);
    }

    // Check Vietnamese & Traditional Chinese modal localization
    await page.evaluate(() => setLanguage('vi'));
    assert.equal(await page.locator('#i18n-modal-activation-title').innerText(), 'Đăng nhập POS');
    assert.equal(await page.locator('#activation-pin').getAttribute('placeholder'), 'Nhập mã PIN quản lý');
    assert.equal(await page.locator('#i18n-btn-submit-activation-text').innerText(), 'Đăng nhập POS');
    await page.evaluate(() => setLanguage('zh-TW'));
    assert.equal(await page.locator('#i18n-modal-activation-title').innerText(), '登入門市 POS');

    // Toggle PIN visibility button
    await page.click('#activation-pin-toggle');
    assert.equal(await page.locator('#activation-pin').getAttribute('type'), 'text');
    await page.click('#activation-pin-toggle');
    assert.equal(await page.locator('#activation-pin').getAttribute('type'), 'password');

    // 2. Wrong PIN displays inline error & keeps POS locked
    await page.fill('#activation-pin', '00000000');
    await page.click('#btn-submit-activation');
    await page.locator('#activation-error-msg').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#storeActivationModal').isVisible(), true);

    // 3. Correct PIN unlocks POS, stores token, prompts shift modal, and sends Bearer header everywhere
    await page.fill('#activation-pin', '10175846');
    await page.click('#btn-submit-activation');
    await page.locator('#storeActivationModal').waitFor({ state: 'hidden' });
    await page.locator('#i18n-btn-start-shift').click();

    await page.waitForFunction(() => document.body.innerText.includes('陳小姐'));
    const storedToken = await page.evaluate(() => localStorage.getItem('pos_session_token_bainianxiaoshi'));
    assert.ok(storedToken && storedToken.startsWith('pos_tok_'));
    assert.ok(api.calls.authOrders >= 1);

    // Switch across React workspaces -> Bearer header attached cleanly
    await page.evaluate(() => switchTab('history'));
    await page.waitForFunction(() => Boolean(document.getElementById('pos-history-react-root')));
    assert.ok(api.calls.historyAuthHeaders.some((h) => h === `Bearer ${storedToken}`));

    await page.evaluate(() => switchTab('reports'));
    await page.waitForFunction(() => Boolean(document.getElementById('pos-reports-react-root')));
    assert.ok(api.calls.reportsAuthHeaders.some((h) => h === `Bearer ${storedToken}`));

    // 4. Page reload preserves login cleanly without re-prompting PIN
    await page.reload();
    await page.locator('#i18n-btn-start-shift').click();
    assert.equal(await page.locator('#storeActivationModal').isVisible(), false);
    await page.evaluate(() => switchTab('live'));
    await page.waitForFunction(() => document.body.innerText.includes('陳小姐'));

    // 5. Logout button in Settings -> Device Pairing (48px target + zh-TW/vi)
    await page.evaluate(() => {
      switchTab('settings');
      switchSettingTab('store-pairing');
    });
    const logoutBtn = page.locator('#i18n-btn-pos-logout');
    await logoutBtn.waitFor({ state: 'visible' });
    const logoutBox = await logoutBtn.boundingBox();
    assert.ok(logoutBox.height >= 47.9, 'Logout button must be >= 48px');

    await page.evaluate(() => setLanguage('vi'));
    assert.equal(await logoutBtn.innerText(), 'Đăng xuất POS');
    await page.evaluate(() => setLanguage('zh-TW'));
    assert.equal(await logoutBtn.innerText(), '登出 POS');

    await logoutBtn.click();
    await page.locator('#storeActivationModal.force-show.pin-only-mode').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => localStorage.getItem('pos_session_token_bainianxiaoshi')), null);
    assert.ok(api.calls.logouts >= 1);

    // 6. Remote revocation (401 POS_AUTH_REQUIRED during polling) immediately re-locks POS
    await page.fill('#activation-pin', '10175846');
    await page.click('#btn-submit-activation');
    await page.locator('#storeActivationModal').waitFor({ state: 'hidden' });
    await page.evaluate(() => switchTab('live'));
    await page.waitForFunction(() => document.body.innerText.includes('陳小姐'));

    api.revokeAll();
    await page.evaluate(() => fetchOrders());
    await page.locator('#storeActivationModal.force-show.pin-only-mode').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => localStorage.getItem('pos_session_token_bainianxiaoshi')), null);

    // 7. Tenant WITHOUT pos_web_login stays 100% open & Logout row hidden
    const openPage = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    openPage.on('pageerror', (err) => pageErrors.push(err.message));
    await api.install(openPage);
    await openPage.goto(`${baseUrl}/orders.html?tenant=benmi&env=dev`);
    await openPage.locator('#i18n-btn-start-shift').click();
    assert.equal(await openPage.locator('#storeActivationModal').isVisible(), false);
    await openPage.evaluate(() => {
      switchTab('settings');
      switchSettingTab('store-pairing');
    });
    assert.equal(await openPage.locator('#i18n-btn-pos-logout').isVisible(), false);

    assert.deepEqual(pageErrors, [], `Unexpected page errors: ${pageErrors.join('; ')}`);
  });
}
