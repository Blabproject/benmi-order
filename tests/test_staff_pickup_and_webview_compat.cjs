const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { getPosDistDir } = require('./helpers/pos-dist.cjs');

const root = path.resolve(__dirname, '..');

function loadCheckoutHarness(initialTaiwanDate) {
  let currentTw = new Date(initialTaiwanDate.getTime());
  const dateEl = { value: '', min: '', addEventListener() {} };
  const timeEl = { value: '', addEventListener() {} };
  const primaryEl = { textContent: '' };
  const secondaryEl = { textContent: '' };

  const elements = {
    'pickup-date': dateEl,
    'pickup-time': timeEl,
    'pickup-display-primary': primaryEl,
    'pickup-display-secondary': secondaryEl
  };

  const sandbox = {
    console,
    Math,
    Date,
    Set,
    Map,
    Array,
    Object,
    Number,
    String,
    Boolean,
    RegExp,
    JSON,
    URLSearchParams,
    location: { search: '' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    document: {
      body: { style: {}, classList: { add() {}, remove() {}, toggle() {} } },
      documentElement: { style: {}, classList: { add() {}, remove() {}, toggle() {} } },
      getElementById: id => elements[id] || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {}
    },
    window: {},
    storeConfig: {
      storeStatus: 'open',
      prepTimeMinutes: 15,
      allowScheduledPickup: true,
      operatingHours: {
        '0': [{ start: '06:15', end: '13:00' }],
        '1': [{ start: '06:15', end: '13:00' }],
        '2': [{ start: '06:15', end: '13:00' }],
        '3': [{ start: '06:15', end: '13:00' }],
        '4': [{ start: '06:15', end: '13:00' }],
        '5': [{ start: '06:15', end: '13:00' }],
        '6': [{ start: '06:15', end: '13:00' }]
      }
    },
    getTaiwanDate: () => new Date(currentTw.getTime()),
    formatTaiwanDateTime: d => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return { dateStr: `${y}-${m}-${day}`, timeStr: `${hh}:${mm}` };
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/client-checkout.js'), 'utf8'), sandbox, {
    filename: 'js/client-checkout.js'
  });

  return {
    sandbox,
    dateEl,
    timeEl,
    setNow(nextDate) {
      currentTw = new Date(nextDate.getTime());
    }
  };
}

test('Staff pickup time resets back to fresh ASAP after a manual slot and refreshes stale past slots', () => {
  // 2026-11-19 06:25 local
  const h = loadCheckoutHarness(new Date(2026, 10, 19, 6, 25, 0));
  h.sandbox.initPickupTimePicker();
  assert.equal(h.dateEl.value, '2026-11-19');
  assert.equal(h.timeEl.value, '06:40');

  // Staff manually selects 07:00 for one customer
  h.sandbox.pickupTimePickerState.tempDate = '2026-11-19';
  h.sandbox.pickupTimePickerState.tempTime = '07:00';
  h.sandbox.pickupTimePickerState.tempType = 'slot';
  h.sandbox.confirmPickupTimeSelection();
  assert.equal(h.timeEl.value, '07:00');
  assert.equal(h.sandbox.pickupTimePickerState.selectedType, 'slot');

  // While 07:00 is still in the future (at 06:30), refreshPickupTimeIfStale preserves it
  h.setNow(new Date(2026, 10, 19, 6, 30, 0));
  h.sandbox.refreshPickupTimeIfStale();
  assert.equal(h.timeEl.value, '07:00');
  assert.equal(h.sandbox.pickupTimePickerState.selectedType, 'slot');

  // After submitting that order, resetPickupTimeToDefault restores fresh ASAP (06:30 + 15m = 06:45)
  h.sandbox.resetPickupTimeToDefault();
  assert.equal(h.timeEl.value, '06:45');
  assert.equal(h.sandbox.pickupTimePickerState.selectedType, 'asap');
  assert.equal(h.sandbox.isPickupTimeManuallyChanged, false);

  // Later at 08:30, stale ASAP refreshes to 08:45
  h.setNow(new Date(2026, 10, 19, 8, 30, 0));
  h.sandbox.refreshPickupTimeIfStale();
  assert.equal(h.timeEl.value, '08:45');
  assert.equal(h.sandbox.pickupTimePickerState.selectedType, 'asap');

  // Even if a manual slot 07:00 somehow stayed selected until 08:30 (past), refreshPickupTimeIfStale resets it to 08:45
  h.sandbox.pickupTimePickerState.selectedType = 'slot';
  h.sandbox.pickupTimePickerState.selectedTime = '07:00';
  h.timeEl.value = '07:00';
  h.sandbox.refreshPickupTimeIfStale();
  assert.equal(h.timeEl.value, '08:45');
  assert.equal(h.sandbox.pickupTimePickerState.selectedType, 'asap');
});

function walkAst(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child.type === 'string') {
          walkAst(child, visitor);
        }
      }
    } else if (value && typeof value.type === 'string') {
      walkAst(value, visitor);
    }
  }
}

function assertEs2019CompatibleSyntax(code, file, { allowDynamicImport = false, sourceType = 'module' } = {}) {
  const ast = acorn.parse(code, {
    ecmaVersion: allowDynamicImport ? 2020 : 2019,
    sourceType
  });
  walkAst(ast, node => {
    if (node.type === 'ChainExpression') {
      assert.fail(`${file} must not emit optional chaining (?.)`);
    }
    if (node.type === 'LogicalExpression' && node.operator === '??') {
      assert.fail(`${file} must not emit nullish coalescing (??)`);
    }
    if (
      node.type === 'AssignmentExpression' &&
      (node.operator === '||=' || node.operator === '&&=' || node.operator === '??=')
    ) {
      assert.fail(`${file} must not emit ES2021 logical assignment (${node.operator})`);
    }
  });
}

function assertWebViewSafeApis(code, file) {
  for (const banned of ['.replaceChildren(', '.replaceAll(', 'Object.hasOwn(', 'structuredClone(']) {
    assert.equal(code.includes(banned), false, `${file} must not call ${banned}`);
  }
  const guardedPattern = /\b(?:AbortSignal\.timeout|crypto\.randomUUID|Promise\.allSettled)\s*\(/g;
  for (const match of code.matchAll(guardedPattern)) {
    const before = code.slice(Math.max(0, match.index - 140), match.index);
    const after = code.slice(match.index, Math.min(code.length, match.index + 240));
    const isReactViewTransition =
      match[0].startsWith('Promise.allSettled') &&
      file.startsWith('dist/assets/jsx-runtime-') &&
      after.includes('__reactViewTransition');
    if (isReactViewTransition) continue;
    assert.ok(
      before.includes('typeof'),
      `${file} must guard ${match[0]} with a runtime typeof check`
    );
  }
}

test('Vite POS bundles and transpiled dist/js scripts stay compatible with Android WebView >= 74', () => {
  const distAssets = path.join(root, 'dist/assets');
  assert.ok(fs.existsSync(distAssets), 'dist/assets must exist (run npm run build:frontend)');
  const jsBundles = fs.readdirSync(distAssets).filter(f => f.endsWith('.js'));
  assert.ok(jsBundles.length > 0, 'Expected Vite JS bundles in dist/assets');

  for (const file of jsBundles) {
    const code = fs.readFileSync(path.join(distAssets, file), 'utf8');
    assertEs2019CompatibleSyntax(code, `dist/assets/${file}`, {
      allowDynamicImport: /^index-/.test(file),
      sourceType: 'module'
    });
    assertWebViewSafeApis(code, `dist/assets/${file}`);
  }

  const distJs = path.join(root, 'dist/js');
  assert.ok(fs.existsSync(distJs), 'dist/js must exist (run npm run build:frontend)');
  const legacyDistScripts = fs.readdirSync(distJs).filter(f => f.endsWith('.js') && !f.endsWith('.min.js'));
  assert.ok(legacyDistScripts.length > 0, 'Expected transpiled dist/js scripts');

  for (const file of legacyDistScripts) {
    const code = fs.readFileSync(path.join(distJs, file), 'utf8');
    assertEs2019CompatibleSyntax(code, `dist/js/${file}`, {
      allowDynamicImport: file === 'client-pricing-wasm.js',
      sourceType: 'script'
    });
    assertWebViewSafeApis(code, `dist/js/${file}`);
  }
});

test('Legacy Android WebView without Chrome 86+ APIs can open Live and History order details cleanly', async t => {
  const dist = getPosDistDir();
  const ordersHtml = fs.readFileSync(path.join(dist, 'orders.html'), 'utf8')
    .replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '');

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    headless: true
  });
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  page.setDefaultTimeout(8000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.route('**/*', route => {
    const { hostname, pathname } = new URL(route.request().url());
    if (hostname === 'pos.test' && pathname === '/orders.html') {
      return route.fulfill({ body: ordersHtml, contentType: 'text/html' });
    }
    if (hostname === 'pos.test' && /^\/(assets|css|js)\/[\w.-]+$/.test(pathname)) {
      return route.fulfill({ path: path.join(dist, pathname.slice(1)) });
    }
    if (pathname.includes('/api/payments/orders/')) {
      return route.fulfill({ json: { order_key: 'live-001', payments: [], refunds: [], paid_total: 0 } });
    }
    if (pathname.includes('/api/payments/summary')) {
      return route.fulfill({ json: { net_total: 0, total_paid: 0, total_refunded: 0, paid_count: 0 } });
    }
    return route.fulfill({ json: {} });
  });

  // Remove Web APIs introduced after Chrome 79 to reproduce older Android System WebViews
  await page.addInitScript(() => {
    window.setInterval = () => 0;
    delete Element.prototype.replaceChildren;
    delete Document.prototype.replaceChildren;
    delete DocumentFragment.prototype.replaceChildren;
    delete Array.prototype.at;
    delete Array.prototype.findLast;
    delete Array.prototype.findLastIndex;
    delete Object.hasOwn;
    delete Promise.allSettled;
    delete window.structuredClone;
    if (window.Crypto && Crypto.prototype) {
      delete Crypto.prototype.randomUUID;
    }
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      try { delete window.crypto.randomUUID; } catch (_) {}
    }
    if (window.AbortSignal) {
      delete AbortSignal.timeout;
    }
  });

  await page.goto('https://pos.test/orders.html?tenant=fixture&platform=app');
  await page.evaluate(() => {
    window.currentTenantFeatures = ['dine_in'];
    const liveOrder = {
      key: 'live-001',
      displayKey: '1127-T001',
      customer: 'Legacy Live Guest',
      status: 'NEW',
      diningOption: 'takeaway',
      source: 'legacy',
      content: '1 x 招牌餐點 $120',
      subtotal: 120,
      total: 120,
      time: '12:00',
      createdAt: Date.now()
    };
    const historyOrder = {
      key: 'hist-002',
      displayKey: '1127-H002',
      customer: 'Legacy History Guest',
      status: 'DONE',
      diningOption: 'dine_in',
      tableNumber: 'A1',
      source: 'legacy',
      content: '2 x 特調飲品 $90',
      subtotal: 90,
      total: 90,
      time: '11:30',
      createdAt: Date.now() - 3600 * 1000
    };
    window.__historyFixture = [historyOrder];
    latestOrders = [liveOrder];
    lastHistoryOrders = [historyOrder];
    currentOrders = [historyOrder];
    applyLanguageToDOM();
    renderAll();
  });

  // 1. Live tile click must open #reviewModal visibly
  await page.locator('.tile').first().click();
  await page.waitForFunction(() => {
    const modal = document.getElementById('reviewModal');
    return modal && getComputedStyle(modal).display === 'flex';
  });
  const liveModalText = await page.locator('#reviewModal').innerText();
  assert.match(liveModalText, /Legacy Live Guest/);
  assert.match(liveModalText, /120/);

  await page.locator('#reviewModal .order-detail-topbar-left .order-detail-circle-btn').click();
  await page.waitForFunction(() => {
    const modal = document.getElementById('reviewModal');
    return modal && getComputedStyle(modal).display === 'none';
  });

  // 2. History card click must open #reviewModal visibly
  await page.evaluate(() => {
    switchTab('history');
    renderHistory(window.__historyFixture);
  });
  await page.getByText('Legacy History Guest').first().click();
  await page.waitForFunction(() => {
    const modal = document.getElementById('reviewModal');
    return modal && getComputedStyle(modal).display === 'flex';
  });
  const historyModalText = await page.locator('#reviewModal').innerText();
  assert.match(historyModalText, /Legacy History Guest/);
  assert.match(historyModalText, /90/);

  assert.deepEqual(pageErrors, []);
});
