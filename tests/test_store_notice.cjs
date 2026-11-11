const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ts = require('../benmi-worker-official/node_modules/typescript');
if (!require.extensions['.ts']) {
  require.extensions['.ts'] = (m, file) =>
    m._compile(
      ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          esModuleInterop: true,
        },
      }).outputText,
      file
    );
}

const { fixture: menuFixture } = require('./helpers/option-groups.cjs');
const { parseStoreNotice } = require('../benmi-worker-official/src/types/tenant.ts');
const { getConfig, updateConfig } = require('../benmi-worker-official/src/modules/config.ts');
const { getTenantBootstrap } = require('../benmi-worker-official/src/modules/bootstrap.ts');
const StoreNoticeFormat = require('../js/store-notice-format.js');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function createWorkerFixture(tenantId = 't1') {
  const f = menuFixture();
  f.db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tenant_lifecycle (
      tenant_id TEXT PRIMARY KEY,
      state TEXT,
      updated_at TEXT
    );
    INSERT OR IGNORE INTO tenant_lifecycle (tenant_id, state) VALUES ('${tenantId}', 'active');
    CREATE TABLE IF NOT EXISTS tenant_config (
      tenant_id TEXT PRIMARY KEY,
      line_channel_token TEXT,
      line_channel_secret TEXT,
      liff_id TEXT,
      liff_url TEXT,
      groq_api_key TEXT,
      groq_model TEXT DEFAULT 'openai/gpt-oss-120b',
      openrouter_api_key TEXT,
      openrouter_model TEXT DEFAULT 'google/gemini-2.5-flash:free',
      brand_name TEXT NOT NULL,
      brand_color TEXT DEFAULT '#00b900',
      store_address TEXT,
      operating_hours TEXT,
      delivery_policy TEXT,
      quick_replies TEXT,
      flex_template TEXT,
      default_password TEXT DEFAULT '12345678',
      locale TEXT DEFAULT 'zh-TW',
      google_sheets_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      allow_scheduled_pickup INTEGER DEFAULT 1,
      store_status TEXT DEFAULT 'open',
      closed_date TEXT DEFAULT NULL,
      logo_url TEXT DEFAULT NULL,
      announcement TEXT DEFAULT NULL,
      allow_dine_in INTEGER DEFAULT 0,
      allow_takeaway INTEGER DEFAULT 1,
      allow_delivery INTEGER DEFAULT 0,
      features TEXT DEFAULT '[]',
      customer_order_domain TEXT DEFAULT NULL,
      legacy_liff_endpoint_url TEXT DEFAULT NULL,
      order_prefix TEXT,
      latitude REAL DEFAULT NULL,
      longitude REAL DEFAULT NULL,
      cuisine_type TEXT DEFAULT 'vietnamese',
      is_marketplace_visible INTEGER DEFAULT 1,
      ai_order_redirect_enabled INTEGER DEFAULT 1,
      prep_time_minutes INTEGER DEFAULT 5,
      payment_methods TEXT DEFAULT '["line_pay"]',
      auto_open_before_minutes INTEGER DEFAULT 60,
      is_demo INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS tenant_images (
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      bare_name TEXT
    );
    CREATE TABLE IF NOT EXISTS bundle_rules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      title TEXT NOT NULL,
      bundle_price REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS bundle_rule_slot_options (
      id TEXT PRIMARY KEY,
      slot_id TEXT NOT NULL,
      item_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS custom_pages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      title TEXT,
      content TEXT,
      is_active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS restaurant_tables (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      table_number TEXT NOT NULL,
      capacity INTEGER,
      qr_token TEXT,
      is_active INTEGER DEFAULT 1
    );
  `);

  const migration0086 = read('benmi-worker-official/migrations/0086_add_store_notice_to_tenant_config.sql');
  f.db.exec(migration0086);
  for (const colSql of [
    'ALTER TABLE menu_categories ADD COLUMN short_name TEXT',
    "ALTER TABLE menu_categories ADD COLUMN category_type TEXT DEFAULT 'catalog'",
    "ALTER TABLE menu_categories ADD COLUMN selection_type TEXT DEFAULT 'single'",
    'ALTER TABLE menu_categories ADD COLUMN is_required INTEGER DEFAULT 0',
    'ALTER TABLE menu_categories ADD COLUMN min_selection INTEGER DEFAULT 0',
    'ALTER TABLE menu_categories ADD COLUMN max_selection INTEGER DEFAULT 1',
    'ALTER TABLE menu_categories ADD COLUMN allow_customization INTEGER DEFAULT 1',
    "ALTER TABLE menu_categories ADD COLUMN applied_modifiers TEXT DEFAULT ''",
    'ALTER TABLE menu_categories ADD COLUMN pricing_rules TEXT',
    "ALTER TABLE menu_items ADD COLUMN description TEXT DEFAULT ''",
    'ALTER TABLE menu_items ADD COLUMN out_of_stock_until TEXT',
    "ALTER TABLE menu_items ADD COLUMN badge_text TEXT DEFAULT ''",
    'ALTER TABLE menu_items ADD COLUMN is_recommended INTEGER DEFAULT 0',
    'ALTER TABLE menu_items ADD COLUMN max_per_order INTEGER',
    "ALTER TABLE menu_items ADD COLUMN item_type TEXT DEFAULT 'standard'",
  ]) {
    try { f.db.exec(colSql); } catch (_) {}
  }
  f.db.prepare(`
    INSERT INTO tenants (id, name) VALUES (?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(tenantId, 'Benmi Notice Test');
  f.db.prepare(`
    INSERT INTO tenant_config (tenant_id, brand_name, store_status, features)
    VALUES (?, ?, 'open', '[]')
  `).run(tenantId, 'Benmi Notice Test');

  const kv = new Map();
  const env = {
    BUILD_ENVIRONMENT: 'test',
    DB: {
      prepare(sql) {
        let args = [];
        const stmt = {
          sql,
          get args() {
            return args;
          },
          bind(...a) {
            args = a;
            return stmt;
          },
          async first() {
            try {
              return f.db.prepare(sql).get(...args) || null;
            } catch (e) {
              console.error('[TestDB first error]', e.message, sql);
              throw e;
            }
          },
          async all() {
            try {
              return { results: f.db.prepare(sql).all(...args) };
            } catch (e) {
              console.error('[TestDB all error]', e.message, sql);
              throw e;
            }
          },
          async run() {
            try {
              return { meta: { changes: Number(f.db.prepare(sql).run(...args).changes) } };
            } catch (e) {
              console.error('[TestDB run error]', e.message, sql);
              throw e;
            }
          },
        };
        return stmt;
      },
      async batch(statements) {
        return statements.map((s) => {
          if (/^\s*SELECT/i.test(s.sql)) {
            return { success: true, results: f.db.prepare(s.sql).all(...s.args) };
          }
          return { success: true, meta: { changes: Number(f.db.prepare(s.sql).run(...s.args).changes) } };
        });
      },
    },
    ORDER_STATE: {
      async get(key) {
        return kv.has(key) ? kv.get(key) : null;
      },
      async put(key, val) {
        kv.set(key, val);
      },
      async delete(key) {
        kv.delete(key);
      },
    },
  };

  const tenant = {
    tenantId,
    brandName: 'Benmi Notice Test',
    defaultPassword: 'test',
    features: [],
    liffId: 'test-liff-id',
    storeStatus: 'open',
    orderPrefix: 'A',
  };

  return { f, env, tenant, kv };
}

test('StoreNoticeFormat sanitizes HTML and renders bold + bullet lists', () => {
  const html = StoreNoticeFormat.renderBody(
    '請注意 **今日提早打烊**\n- 內用最後點餐 <script>alert(1)</script> 20:00\n- 外帶自取至 20:30'
  );
  assert(!html.includes('<script>'));
  assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert(html.includes('<strong>今日提早打烊</strong>'));
  assert(html.includes('<ul><li>內用最後點餐'));
  assert(html.includes('<li>外帶自取至 20:30</li></ul>'));
});

test('Backend config & bootstrap persist store_notice, preserve version on unchanged text, bump on text change, and hide disabled notices', async () => {
  const { f, env, tenant } = createWorkerFixture('t1');

  try {
    // 1. Default config has storeNotice === null
    const cfg0 = await (await getConfig(new Request(`https://api.test/api/config?tenant=${tenant.tenantId}`), env, tenant)).json();
    assert.equal(cfg0.storeNotice, null);

    // 2. Save enabled notice
    const r1 = await updateConfig(
      new Request(`https://api.test/api/config?tenant=${tenant.tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeNotice: {
            enabled: true,
            title: '春節營業公告',
            body: '**初一至初三公休**\n- 初四恢復營業',
          },
        }),
      }),
      env,
      tenant
    );
    assert.equal(r1.status, 200);

    const cfg1 = await (await getConfig(new Request(`https://api.test/api/config?tenant=${tenant.tenantId}`), env, tenant)).json();
    assert.equal(cfg1.storeNotice.enabled, true);
    assert.equal(cfg1.storeNotice.title, '春節營業公告');
    assert.equal(cfg1.storeNotice.body, '**初一至初三公休**\n- 初四恢復營業');
    assert(cfg1.storeNotice.version && typeof cfg1.storeNotice.version === 'string');

    // Bootstrap exposes enabled notice
    const boot1 = await (await getTenantBootstrap(new Request(`https://api.test/api/tenant/bootstrap?tenant_id=${tenant.tenantId}`), env)).json();
    assert.deepEqual(boot1.tenant.storeNotice, cfg1.storeNotice);

    // 3. Re-saving same title/body with enabled=false preserves version and hides from bootstrap
    const r2 = await updateConfig(
      new Request(`https://api.test/api/config?tenant=${tenant.tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeNotice: {
            enabled: false,
            title: '春節營業公告',
            body: '**初一至初三公休**\n- 初四恢復營業',
          },
        }),
      }),
      env,
      tenant
    );
    assert.equal(r2.status, 200);

    const cfg2 = await (await getConfig(new Request(`https://api.test/api/config?tenant=${tenant.tenantId}`), env, tenant)).json();
    assert.equal(cfg2.storeNotice.enabled, false);
    assert.equal(cfg2.storeNotice.version, cfg1.storeNotice.version);

    const boot2 = await (await getTenantBootstrap(new Request(`https://api.test/api/tenant/bootstrap?tenant_id=${tenant.tenantId}`), env)).json();
    assert.equal(boot2.tenant.storeNotice, null);

    // 4. Editing text bumps version
    await new Promise((r) => setTimeout(r, 5));
    const r3 = await updateConfig(
      new Request(`https://api.test/api/config?tenant=${tenant.tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeNotice: {
            enabled: true,
            title: '春節營業公告',
            body: '**初一至初四公休**\n- 初五恢復營業',
          },
        }),
      }),
      env,
      tenant
    );
    assert.equal(r3.status, 200);

    const cfg3 = await (await getConfig(new Request(`https://api.test/api/config?tenant=${tenant.tenantId}`), env, tenant)).json();
    assert.equal(cfg3.storeNotice.enabled, true);
    assert.notEqual(cfg3.storeNotice.version, cfg1.storeNotice.version);

    const boot3 = await (await getTenantBootstrap(new Request(`https://api.test/api/tenant/bootstrap?tenant_id=${tenant.tenantId}`), env)).json();
    assert.equal(boot3.tenant.storeNotice.version, cfg3.storeNotice.version);

    // 5. Too long payload rejected with 400
    const rTooLong = await updateConfig(
      new Request(`https://api.test/api/config?tenant=${tenant.tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeNotice: {
            enabled: true,
            title: 'X'.repeat(81),
            body: 'Ok',
          },
        }),
      }),
      env,
      tenant
    );
    assert.equal(rTooLong.status, 400);
    const errBody = await rTooLong.json();
    assert.equal(errBody.error, 'STORE_NOTICE_TOO_LONG');

    // 6. Empty notice clears column
    const rClear = await updateConfig(
      new Request(`https://api.test/api/config?tenant=${tenant.tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeNotice: null }),
      }),
      env,
      tenant
    );
    assert.equal(rClear.status, 200);
    const cfgCleared = await (await getConfig(new Request(`https://api.test/api/config?tenant=${tenant.tenantId}`), env, tenant)).json();
    assert.equal(cfgCleared.storeNotice, null);

    // 7. parseStoreNotice tolerates malformed strings safely
    assert.equal(parseStoreNotice(null), null);
    assert.equal(parseStoreNotice('{bad json'), null);
  } finally {
    f.db.close();
  }
});

test('Browser Chromium: POS Store Info announcement size, Công cáo editor, i18n, touch targets & API payload', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  page.setDefaultTimeout(6000);
  const postedConfigs = [];

  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/config' && route.request().method() === 'POST') {
      postedConfigs.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname === '/api/config' && route.request().method() === 'GET') {
      return route.fulfill({
        json: {
          announcement: '今日限定',
          storeAddress: '台北市測試路1號',
          storeNotice: {
            enabled: true,
            title: '既有公告',
            body: '**第一行**\n- 項目一',
            version: 'v-existing',
          },
          operatingHours: {},
        },
      });
    }
    if (url.pathname === '/orders.html') {
      return route.fulfill({
        contentType: 'text/html',
        body: read('orders.html').replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, ''),
      });
    }
    if (/^\/(js|css)\/[\w.-]+$/.test(url.pathname)) {
      return route.fulfill({
        body: read(url.pathname.slice(1)),
        contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript',
      });
    }
    return route.fulfill({ json: { ok: true, orders: [] } });
  });

  await page.addInitScript(() => {
    window.setInterval = () => 0;
    window.alert = () => {};
    localStorage.setItem('pos_device_tenant_id', 't1');
    sessionStorage.setItem('staff_session_token_t1', 'staff-tok');
  });

  await page.goto('http://pos.test/orders.html?tenant=t1');
  await page.evaluate(() => {
    initSidebarState();
    switchTab('settings');
    switchSettingTab('store-info');
    loadOperatingHours();
  });

  await page.waitForSelector('#setting-store-notice-section');
  await page.waitForFunction(() => document.getElementById('setting-store-notice-title-input')?.value === '既有公告');

  // Verify taller Store Announcement textarea
  const announcementHeight = await page.locator('#setting-store-announcement-input').evaluate((el) => el.getBoundingClientRect().height);
  assert(announcementHeight >= 140, `Expected announcement textarea height >= 140, got ${announcementHeight}`);

  // Verify touch targets >= 48px and no horizontal overflow at tablet and mobile widths
  for (const vp of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(vp);
    for (const locale of ['vi', 'zh-TW']) {
      await page.evaluate((loc) => setLanguage(loc), locale);
      const layout = await page.locator('#setting-store-notice-section').evaluate((sec) => ({
        overflow: sec.scrollWidth > sec.clientWidth + 1,
        buttons: ['#btn-store-notice-bold', '#btn-store-notice-list', '#btn-save-store-notice'].map((sel) => {
          const rect = sec.querySelector(sel).getBoundingClientRect();
          return { sel, w: rect.width, h: rect.height };
        }),
        titleLabel: document.getElementById('i18n-setting-store-notice-title')?.textContent,
      }));
      assert.equal(layout.overflow, false, `Overflow at ${vp.width}/${locale}`);
      for (const b of layout.buttons) {
        assert(b.w >= 47.9 && b.h >= 47.9, `Touch target too small for ${b.sel} at ${vp.width}: ${b.w}x${b.h}`);
      }
      assert.equal(layout.titleLabel, locale === 'vi' ? 'Công cáo' : '彈出公告');
    }
  }

  // Test simple editor formatting toolbar + preview + individual save + save all
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.fill('#setting-store-notice-title-input', 'Thông báo nghỉ lễ');
  await page.fill('#setting-store-notice-body-input', 'Nghỉ lễ 2/9');
  await page.locator('#setting-store-notice-body-input').evaluate((el) => el.setSelectionRange(0, el.value.length));
  await page.click('#btn-store-notice-bold');
  await page.click('#btn-store-notice-list');

  const previewHtml = await page.locator('#setting-store-notice-preview').innerHTML();
  assert(previewHtml.includes('<strong>Nghỉ lễ 2/9</strong>'));
  assert(previewHtml.includes('<ul><li><strong>Nghỉ lễ 2/9</strong></li></ul>'));

  await page.click('#btn-save-store-notice');
  await page.waitForFunction((n) => window.__postedLen !== n, postedConfigs.length).catch(() => {});
  assert(postedConfigs.length >= 1);
  assert.deepEqual(postedConfigs[0].storeNotice, {
    enabled: true,
    title: 'Thông báo nghỉ lễ',
    body: '- **Nghỉ lễ 2/9**',
  });

  await page.click('#btn-save-all-store-info');
  await page.waitForTimeout(50);
  const allPayload = postedConfigs[postedConfigs.length - 1];
  assert.deepEqual(allPayload.storeNotice, {
    enabled: true,
    title: 'Thông báo nghỉ lễ',
    body: '- **Nghỉ lễ 2/9**',
  });
});

test('Browser Chromium: LIFF shows notice immediately with localStorage ack; External browser waits until LINE login succeeds', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  async function runCustomerSession({ inClient, loggedIn, notice, seedStorage }) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    const pageErrors = [];
    const consoleLogs = [];
    const seenUrls = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (msg) => consoleLogs.push(`${msg.type()}: ${msg.text()}`));

    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      seenUrls.push(url.href);
      if (url.hostname === 'static.line-scdn.net') {
        return route.fulfill({
          contentType: 'application/javascript',
          body: `
            window.liff = {
              init: async () => {},
              isInClient: () => Boolean(window.__MOCK_LIFF_IN_CLIENT),
              isLoggedIn: () => Boolean(window.__MOCK_LIFF_LOGGED_IN),
              getProfile: async () => ({ userId: 'u1', displayName: 'Tester', pictureUrl: '' }),
              login: () => {}
            };
          `,
        });
      }
      if (url.pathname === '/api/tenant/bootstrap' || url.pathname === '/api/bootstrap') {
        return route.fulfill({
          json: {
            bootstrapVersion: 3,
            menuComplete: true,
            tenant: {
              id: 't1',
              brandName: 'Benmi Test',
              announcement: 'Header banner',
              storeNotice: notice,
              storeStatus: 'open',
              features: [],
              liffId: 'liff-test',
            },
            catalog: [],
            categories: [],
            items: [],
            optionGroups: [],
          },
        });
      }
      if (url.pathname === '/api/config') {
        return route.fulfill({
          json: {
            tenantId: 't1',
            customerOrderDomain: 'legacy',
            liffEndpointUrl: 'https://benmi-order.pages.dev/?tenant=t1',
            liffId: '2009560906-testliff1',
            announcement: 'Header banner',
            storeNotice: notice,
            storeStatus: 'open',
            operatingHours: {},
          },
        });
      }
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return route.fulfill({ contentType: 'text/html', body: read('index.html') });
      }
      if (url.pathname === '/index.css' || /^\/(?:css|js)\/[\w.-]+$/.test(url.pathname)) {
        const assetPath = url.pathname.slice(1);
        if (fs.existsSync(path.join(root, assetPath))) {
          return route.fulfill({
            body: read(assetPath),
            contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript',
          });
        }
      }
      if (url.pathname.startsWith('/wasm/')) {
        const filePath = path.join(root, url.pathname.slice(1));
        if (fs.existsSync(filePath)) {
          return route.fulfill({
            body: fs.readFileSync(filePath),
            contentType: url.pathname.endsWith('.wasm') ? 'application/wasm' : 'application/javascript',
          });
        }
      }
      return route.fulfill({ json: { ok: true, waiting_count: 0 } });
    });

    await page.addInitScript(
      ({ inClient, loggedIn, seedStorage }) => {
        window.__MOCK_LIFF_IN_CLIENT = inClient;
        window.__MOCK_LIFF_LOGGED_IN = loggedIn;
        window.setInterval = () => 0;
        if (seedStorage) {
          for (const [k, v] of Object.entries(seedStorage)) {
            localStorage.setItem(k, v);
          }
        }
      },
      { inClient, loggedIn, seedStorage }
    );

    await page.goto('https://benmi-order.pages.dev/?tenant=t1');
    try {
      await page.waitForFunction(() => Boolean(window.__currentStoreNotice));
    } catch (err) {
      const diag = await page.evaluate(() => ({
        failed: Boolean(window.__TENANT_RESOLUTION_FAILED),
        initialTenant: window.__INITIAL_TENANT_ID,
        bootstrapData: Boolean(window.bootstrapData),
        storeConfig: Boolean(window.storeConfig),
        currentStoreNotice: window.__currentStoreNotice,
        authCleared: window.__storeAuthCleared,
      }));
      throw new Error(`${err.message} | diag=${JSON.stringify(diag)} | urls=${JSON.stringify(seenUrls)} | pageErrors=${JSON.stringify(pageErrors)}`);
    }
    await page.waitForTimeout(150);

    return { context, page, consoleLogs };
  }

  const noticeV1 = {
    enabled: true,
    title: '重要公休公告',
    body: '**週一公休**\n- 外送暫停\n<script>xss()</script>',
    version: '2026-11-11T00:00:00.000Z',
  };

  // Case 1: Inside LINE LIFF in-app browser -> notice opens immediately
  {
    const { context, page, consoleLogs } = await runCustomerSession({ inClient: true, loggedIn: true, notice: noticeV1 });
    try {
      const stateDiag = await page.evaluate(() => ({
        authCleared: window.__storeAuthCleared,
        currentNotice: window.__currentStoreNotice,
        modalClass: document.getElementById('store-notice-modal')?.className,
        isLiffInit: typeof isLiffInitialized !== 'undefined' ? isLiffInitialized : null,
        hasLiff: typeof liff !== 'undefined',
        inClient: typeof liff !== 'undefined' && liff.isInClient ? liff.isInClient() : null,
        outside: typeof isDesktopOutsideLiff === 'function' ? isDesktopOutsideLiff() : null,
        authOverlay: document.getElementById('desktop-center-auth-overlay')?.style.display,
      }));
      stateDiag.consoleLogs = consoleLogs;
      await page.waitForSelector('#store-notice-modal.is-open').catch((e) => {
        throw new Error(`${e.message} | stateDiag=${JSON.stringify(stateDiag)}`);
      });
      assert.equal(await page.locator('#store-notice-modal-title').innerText(), '重要公休公告');
      const bodyHtml = await page.locator('#store-notice-modal-body').innerHTML();
      assert(bodyHtml.includes('<strong>週一公休</strong>'));
      assert(bodyHtml.includes('<ul><li>外送暫停</li></ul>'));
      assert(!bodyHtml.includes('<script>'));

      // Closing WITHOUT checking ack keeps localStorage empty
      await page.click('#store-notice-close-btn');
      await page.waitForFunction(() => !document.getElementById('store-notice-modal').classList.contains('is-open'));
      const ackAfterUnchecked = await page.evaluate(() => localStorage.getItem('store_notice_seen_t1'));
      assert.equal(ackAfterUnchecked, null);
    } finally {
      await context.close();
    }
  }

  // Case 2: Re-open inside LIFF, check "Đã xem", close -> persists in localStorage
  {
    const { context, page } = await runCustomerSession({ inClient: true, loggedIn: true, notice: noticeV1 });
    try {
      await page.waitForSelector('#store-notice-modal.is-open');
      await page.check('#store-notice-ack-checkbox');
      await page.click('#store-notice-close-btn');
      const ackSaved = await page.evaluate(() => localStorage.getItem('store_notice_seen_t1'));
      assert.equal(ackSaved, noticeV1.version);
    } finally {
      await context.close();
    }
  }

  // Case 3: Re-open with same version in localStorage -> stays hidden
  {
    const { context, page } = await runCustomerSession({
      inClient: true,
      loggedIn: true,
      notice: noticeV1,
      seedStorage: { store_notice_seen_t1: noticeV1.version },
    });
    try {
      const isOpen = await page.locator('#store-notice-modal').evaluate((el) => el.classList.contains('is-open'));
      assert.equal(isOpen, false);
    } finally {
      await context.close();
    }
  }

  // Case 4: Updated notice version -> shows again even though v1 was acknowledged
  {
    const noticeV2 = { ...noticeV1, body: '**本週照常營業**', version: '2026-11-12T00:00:00.000Z' };
    const { context, page } = await runCustomerSession({
      inClient: true,
      loggedIn: true,
      notice: noticeV2,
      seedStorage: { store_notice_seen_t1: noticeV1.version },
    });
    try {
      await page.waitForSelector('#store-notice-modal.is-open');
    } finally {
      await context.close();
    }
  }

  // Case 5: External Browser NOT logged into LINE -> login overlay blocks, notice MUST stay hidden
  {
    const { context, page } = await runCustomerSession({ inClient: false, loggedIn: false, notice: noticeV1 });
    try {
      const authOverlayVisible = await page.locator('#desktop-center-auth-overlay').evaluate((el) => getComputedStyle(el).display === 'flex');
      const noticeOpen = await page.locator('#store-notice-modal').evaluate((el) => el.classList.contains('is-open'));
      assert.equal(authOverlayVisible, true);
      assert.equal(noticeOpen, false);
    } finally {
      await context.close();
    }
  }

  // Case 6: External Browser AFTER LINE login completes -> auth overlay clears and notice opens!
  {
    const { context, page } = await runCustomerSession({ inClient: false, loggedIn: true, notice: noticeV1 });
    try {
      await page.waitForSelector('#store-notice-modal.is-open');
      const authOverlayDisplay = await page.locator('#desktop-center-auth-overlay').evaluate((el) => el.style.display);
      assert.equal(authOverlayDisplay, 'none');
    } finally {
      await context.close();
    }
  }
});
