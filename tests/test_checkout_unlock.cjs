const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createCheckoutEnvironment(overrides = {}) {
  const elements = {};
  const alerts = [];
  const element = (id) => {
    if (!elements[id]) {
      elements[id] = {
        id,
        style: {},
        innerText: '',
        innerHTML: '',
        value: '',
        disabled: false,
        classList: {
          contains: () => false,
          add() {},
          remove() {},
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        getAttribute: () => null,
        setAttribute() {},
      };
    }
    return elements[id];
  };

  const sandbox = {
    addEventListener: () => {},
    removeEventListener: () => {},
    window: {
      addEventListener: () => {},
      removeEventListener: () => {},
      location: {
        search: '',
        href: 'https://benmi-order.pages.dev/?tenant_id=miyansuo',
        hostname: 'benmi-order.pages.dev',
        pathname: '/',
        hash: '',
      },
    },
    location: {
      search: '',
      href: 'https://benmi-order.pages.dev/?tenant_id=miyansuo',
      hostname: 'benmi-order.pages.dev',
      pathname: '/',
      hash: '',
    },
    document: {
      getElementById: (id) => element(id),
      querySelectorAll: (sel) => [],
      querySelector: (sel) => null,
      createElement: (tag) => element(tag),
      documentElement: {
        style: { setProperty() {}, getPropertyValue: () => '' },
        classList: { add() {}, remove() {}, contains: () => false }
      },
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    URLSearchParams,
    AbortController,
    AbortSignal,
    WORKER_BASE: 'https://worker.test',
    cart: { 'cat_egg_cake_原味雞蛋糕 (5入)': 1 },
    customizeData: {},
    comboDrinkData: {},
    bootstrapData: {
      menuComplete: true,
      tenant: { id: 'miyansuo', storeStatus: 'open' },
      catalog: [
        {
          slug: 'cat_egg_cake',
          items: [{ id: 'mys_ec_01', name: '原味雞蛋糕 (5入)', price: 60, isOutOfStock: false }],
        },
      ],
    },
    storeConfig: { storeStatus: 'open' },
    isSubmitting: false,
    customAlert: (msg, cb) => {
      alerts.push({ msg, cb });
      if (typeof cb === 'function') cb();
    },
    getTenantIdFromUrl: () => 'miyansuo',
    formatTaiwanDateTime: () => ({ dateStr: '2026-10-24', timeStr: '12:00' }),
    parseCartKey: (k) => ({ catSlug: 'cat_egg_cake', origName: '原味雞蛋糕 (5入)' }),
    resolveCatalogItem: (k) => ({ displayName: '原味雞蛋糕 (5入)', itemId: 'mys_ec_01', targetItem: { price: 60 } }),
    buildStructuredCartItems: () => [{ itemId: 'mys_ec_01', name: '原味雞蛋糕 (5入)', quantity: 1, price: 60 }],
    getStructuredGlobalCustomizations: () => [],
    updateTotal: () => 60,
    hasAvailableCartItems: () => true,
    generateOrderNumber: () => 'MY1024-T001',
    formatOrderTextMessage: () => '訂單明細',
    getCleanLiffRedirectUri: () => 'https://liff.line.me/2011811292-rNM2Gv9d',
    getLiffLoginRedirectUri: () => 'https://liff.line.me/2011811292-rNM2Gv9d',
    setTimeout,
    clearTimeout,
    console: { log() {}, warn() {}, error() {} },
    ...overrides,
  };

  sandbox.window = sandbox;
  sandbox.__INITIAL_TENANT_ID = 'miyansuo';
  sandbox.elements = elements;
  sandbox.alerts = alerts;

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/order-code.js'), 'utf8'), sandbox);
  const coreCode = fs.readFileSync(path.join(__dirname, '../js/client-core.js'), 'utf8');
  vm.runInContext(coreCode, sandbox);
  const checkoutCode = fs.readFileSync(path.join(__dirname, '../js/client-checkout.js'), 'utf8');
  vm.runInContext(checkoutCode, sandbox);

  // Keep alert and liff mocked after file loading
  sandbox.customAlert = (msg, cb) => {
    alerts.push({ msg, cb });
    if (typeof cb === 'function') cb();
  };
  sandbox.ensureLiffReady = async () => {};
  sandbox.window.ensureLiffReady = async () => {};

  return sandbox;
}

test('doSubmitOrderExecution unlocks submit buttons when server returns 400 rejection', async () => {
  const env = createCheckoutEnvironment({
    fetch: async (url) => {
      if (url.includes('/api/tenant/bootstrap')) {
        return {
          ok: true,
          json: async () => env.bootstrapData,
        };
      }
      if (url.includes('/api/create')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            code: 'BUNDLE_SELECTION_REQUIRED',
            error: '請為套餐選擇內容搭配',
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    },
  });

  // Execute submit
  await env.doSubmitOrderExecution('2026-10-24', '12:00');

  // Verify submit lock is released
  assert.equal(env.isSubmitting, false, 'isSubmitting must be false after server rejection');
  const submitBtn = env.elements['submit-btn'];
  assert.equal(submitBtn.disabled, false, 'submit-btn must be re-enabled');
  assert.equal(submitBtn.innerText, '確認下單', 'submit-btn text must be restored');

  // Verify customAlert displayed server error message
  assert.equal(env.alerts.length, 1);
  assert.match(env.alerts[0].msg, /請為套餐選擇內容搭配/);
  // Verify cart is NOT cleared on rejection
  assert.equal(env.cart['cat_egg_cake_原味雞蛋糕 (5入)'], 1);
});

test('doSubmitOrderExecution unlocks submit buttons when pre-submit stock validation fails', async () => {
  const env = createCheckoutEnvironment({
    fetch: async (url) => {
      if (url.includes('/api/tenant/bootstrap')) {
        return {
          ok: true,
          json: async () => ({
            menuComplete: true,
            tenant: { id: 'miyansuo', storeStatus: 'paused' },
            catalog: [],
          }),
        };
      }
      throw new Error('Should not reach create API when paused');
    },
  });

  await env.doSubmitOrderExecution('2026-10-24', '12:00');

  assert.equal(env.isSubmitting, false, 'isSubmitting must be false when store is paused');
  const submitBtn = env.elements['submit-btn'];
  assert.equal(submitBtn.disabled, false);
  assert.equal(submitBtn.innerText, '確認下單');
  assert.equal(env.alerts.length, 1);
  assert.match(env.alerts[0].msg, /暫停接單/);
});

test('doSubmitOrderExecution unlocks submit buttons on network timeout / abort error', async () => {
  const env = createCheckoutEnvironment({
    fetch: async (url) => {
      if (url.includes('/api/tenant/bootstrap')) {
        return { ok: true, json: async () => env.bootstrapData };
      }
      if (url.includes('/api/create')) {
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      return { ok: true, json: async () => ({}) };
    },
  });

  await env.doSubmitOrderExecution('2026-10-24', '12:00');

  assert.equal(env.isSubmitting, false, 'isSubmitting must be false on network abort');
  const submitBtn = env.elements['submit-btn'];
  assert.equal(submitBtn.disabled, false);
  assert.equal(submitBtn.innerText, '確認下單');
  assert.equal(env.alerts.length, 1);
  assert.match(env.alerts[0].msg, /連線逾時/);
});

test('doSubmitOrderExecution on successful create: clears cart immediately and displays success alert', async () => {
  let confirmationSent = false;
  const env = createCheckoutEnvironment({
    fetch: async (url) => {
      if (url.includes('/api/tenant/bootstrap')) {
        return { ok: true, json: async () => env.bootstrapData };
      }
      if (url.includes('/api/create')) {
        return {
          ok: true,
          json: async () => ({
            key: 'MY1024-T001',
            displayKey: 'MY1024-T001',
            notification: { id: 'rec_123', token: 'tok_abc' },
          }),
        };
      }
      if (url.includes('/api/line/order-receipt/push')) {
        confirmationSent = true;
        return { ok: true, json: async () => ({ success: true }) };
      }
      return { ok: true, json: async () => ({}) };
    },
  });

  await env.doSubmitOrderExecution('2026-10-24', '12:00');

  // Verify cart is cleared immediately
  assert.equal(Object.keys(env.cart).length, 0, 'Cart must be empty on successful order creation');
  // Verify submit button is locked with '訂單已送出'
  const submitBtn = env.elements['submit-btn'];
  assert.equal(submitBtn.disabled, true);
  assert.equal(submitBtn.innerText, '訂單已送出');
  // Verify success alert is shown immediately
  assert.equal(env.alerts.length, 1);
  assert.match(env.alerts[0].msg, /訂單已送出成功/);
});

test('successful checkout separates the short receipt label from the original LINE lookup and request keys', async () => {
  for (const key of ['MY1024-T001', '48cc482f-01ca-4939-ae70-f2c07c9cb4ce']) {
    const env = createCheckoutEnvironment();
    let delivered;
    env.fetch = async url => ({ ok: true, json: async () => url.includes('/api/tenant/bootstrap')
      ? env.bootstrapData : { key, displayKey: 'MY1024-T001' } });
    env.sendOrderConfirmation = async (messages, context) => { delivered = { messages, context }; };
    await env.doSubmitOrderExecution('2026-10-24', '12:00');
    assert.ok(delivered, 'Checkout must deliver a confirmation');
    assert.equal(delivered.context.orderKey, key);
    const message = delivered.messages[0].text;
    assert.match(message, /^取餐號碼：1024-T001\n/);
    assert.equal(message.split('\n').find(line => line.startsWith('訂單編號：')), '訂單編號：' + key);
    assert.equal(message.split('\n').find(line => line.startsWith('訂單參考：')), '訂單參考：' + key);
  }
});

test('index.html extractTenantId cleanly extracts tenant even when LINE appends query params with ? or &', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  
  // Extract the entire script tag containing extractTenantId
  const scriptMatch = indexHtml.match(/<script>([\s\S]*?function extractTenantId[\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'script containing extractTenantId must exist in index.html');
  const scriptContent = scriptMatch[1];

  function runExtractTenantId(urlSearch, href = 'https://benmi-order.pages.dev/' + urlSearch) {
    const sandbox = {
      window: {
        location: {
          search: urlSearch,
          href,
          hostname: 'benmi-order.pages.dev',
          pathname: '/',
          hash: '',
        },
      },
      URLSearchParams,
      decodeURIComponent,
      sessionStorage: { getItem: () => null, setItem() {} },
      localStorage: { getItem: () => null, setItem() {} },
      document: {
        title: '',
        documentElement: { classList: { add() {} } },
        getElementById: () => ({ style: {} }),
      },
      console: { log() {}, warn() {}, error() {} },
    };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(scriptContent, sandbox);
    return sandbox.window.__INITIAL_TENANT_ID;
  }

  // Normal query
  assert.equal(runExtractTenantId('?tenant_id=miyansuo'), 'miyansuo');
  // LINE LIFF malformed concatenation: ?tenant_id=miyansuo?liffClientId=2011811292-rNM2Gv9d
  assert.equal(runExtractTenantId('?tenant_id=miyansuo?liffClientId=2011811292-rNM2Gv9d'), 'miyansuo');
  // LINE LIFF duplicated concatenation: ?tenant_id=miyansuo?tenant_id=miyansuo
  assert.equal(runExtractTenantId('?tenant_id=miyansuo?tenant_id=miyansuo'), 'miyansuo');
  // Normal multi-param: ?tenant_id=miyansuo&code=xyz
  assert.equal(runExtractTenantId('?tenant_id=miyansuo&code=xyz'), 'miyansuo');
});
