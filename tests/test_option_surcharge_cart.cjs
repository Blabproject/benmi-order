const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function client() {
  const elements = {};
  const element = id => elements[id] ||= {
    id, dataset: {}, setAttribute() {}, removeAttribute() {},
    style: {}, innerText: '', innerHTML: '', value: '',
    classList: { contains: () => false, add() {}, remove() {} },
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
  const context = {
    console,
    document: {
      getElementById: element, querySelector: () => null, querySelectorAll: () => [],
      addEventListener() {}, body: { style: {}, appendChild() {} },
      documentElement: { style: { setProperty() {} } },
    },
    location: { search: '', hostname: 'localhost' },
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    navigator: { userAgent: 'Node' },
    addEventListener() {}, removeEventListener() {},
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    URLSearchParams, AbortController, AbortSignal,
  };
  context.window = context;
  vm.createContext(context);
  for (const file of [
    'js/client-core.js', 'js/client-menu.js', 'js/client-customizations.js',
    'js/client-cart.js', 'js/bundle-builder-v2.js', 'js/client-checkout.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  return context;
}

test('LIFF cart, threshold and order item include parent, child and repeated option surcharges', () => {
  const app = client();
  const key = 'food_Meal';
  app.bootstrapData = { catalog: [{ slug: 'food', name: 'Food', items: [{
    id: 'meal', name: 'Meal', price: 100, bundleRule: { version: 3, groups: [{ id: 'sides' }] },
  }] }] };
  app.cart = { [key]: 2 };
  app.customizeData = { [key]: [{ single: {}, multiple: {} }, { single: {}, multiple: {} }] };
  const option = (surcharge, child) => ({
    optionId: 'egg', name: 'Egg', quantity: 1, surcharge, price: 0,
    groups: [], subOptions: child ? [{ id: 'soft', name: 'Soft', price: child }] : [],
    // The receipt includes this display-only projection. It must not be counted twice.
    modifiers: child ? [{ name: 'Soft', price: child }] : [],
  });
  app.bundleCartData = { [key]: [
    { groups: [{ groupId: 'sides', items: [option(5, 2), option(5, 3)] }] },
    { groups: [{ groupId: 'sides', items: [option(4, 0)] }] },
  ] };
  assert.equal(app.resolveCatalogItem(key).bundleRule.version, 3);
  assert.equal(app.bundlePortionExtra(app.bundleCartData[key][0]), 15);
  assert.equal(app.calculateCurrentFoodSubtotal(), 219);
  assert.equal(app.updateTotal(), 219);
  assert.equal(app.buildStructuredCartItems()[0].subtotal, 219);
  assert.equal(app.document.getElementById('total-price').innerText, 219);
});

test('LIFF cart includes item modifier and its child surcharge exactly once', () => {
  const app = client();
  const key = 'food_Meal';
  app.bootstrapData = { catalog: [{ slug: 'food', name: 'Food', items: [{ id: 'meal', name: 'Meal', price: 100 }] }] };
  app.cart = { [key]: 1 };
  app.customizeData = { [key]: [{
    single: { topping: 'Egg' }, multiple: {},
    selectedDetails: { egg: { id: 'egg', name: 'Egg', price: 5, subOption: { id: 'soft', name: 'Soft', price: 2 } } },
    subOptions: { egg: { id: 'soft', name: 'Soft', price: 2 } },
  }] };
  assert.equal(app.calculateCurrentFoodSubtotal(), 107);
  assert.equal(app.updateTotal(), 107);
  assert.equal(app.buildStructuredCartItems()[0].subtotal, 107);
});

test('legacy bundle modifier surcharges remain in the total', () => {
  const app = client();
  const portion = { groups: [{ groupId: 'sides', items: [{
    itemId: 'coffee', quantity: 2, surcharge: 3, groups: [],
    modifiers: [{ name: 'Ice', price: 2 }],
  }] }] };
  assert.equal(app.bundlePortionExtra(portion), 10);
});

test('card and plus derive v3 popup behavior from all groups and preserve legacy rules', () => {
  for (const [rule, popup] of [
    [{ version: 3, autoPopup: true, groups: [{ minSelection: 0 }] }, false],
    [{ version: 3, autoPopup: false, groups: [{ minSelection: 1 }] }, true],
    [{ version: 3, groups: [{ minSelection: 0 }, { minSelection: 2 }] }, true],
    [{ version: 3, autoPopup: false, groups: [{ minSelection: 0, included: true }] }, true],
    [{ version: 2, autoPopup: false, groups: [{ minSelection: 1 }] }, false],
    [{ version: 2, groups: [{ minSelection: 0 }] }, true],
  ]) {
    const app = client();
    app.bootstrapData = { catalog: [{ slug: 'food', items: [{ id: 'meal', name: 'Meal', price: 100, bundleRule: rule }] }] };
    app.cart = {}; app.checkDesktopAuthGuard = () => true;
    let opens = 0;
    app.openBundleBuilderModal = () => { opens++; };
    app.handleItemCardClick('food', 'Meal');
    app.updateQty('food', 'Meal', 1);
    assert.equal(opens, popup ? 2 : 0, JSON.stringify(rule));
    assert.equal(app.cart.food_Meal || 0, popup ? 0 : 2, JSON.stringify(rule));
  }
});

test('optional portions initialize independent defaults even when adding multiple portions', () => {
  const app = client();
  const rule = { version: 3, autoPopup: true, groups: [{ id: 'sides', minSelection: 0 }] };
  app.bootstrapData = { catalog: [{ slug: 'food', items: [{ id: 'meal', name: 'Meal', price: 100, bundleRule: rule }] }] };
  app.cart = {}; app.bundleCartData = {}; app.checkDesktopAuthGuard = () => true;
  app.UnifiedOptions = { restore: () => [{ groupId: 'sides', items: [] }] };
  app.updateQty('food', 'Meal', 2);
  app.bundleCartData.food_Meal[0].groups[0].items.push({ optionId: 'egg', surcharge: 5 });
  assert.equal(app.bundleCartData.food_Meal[1].groups[0].items.length, 0);
});

for (const flow of ['create', 'append', 'modify']) {
  test(`${flow} rejects a changed price without leaving submit locked or sending a fallback order`, async () => {
    const app = client();
    app.WORKER_BASE = 'https://worker.test';
    app.getTenantIdFromUrl = () => 'test';
    app.validateCartStockBeforeSubmit = async () => ({ valid: true });
    app.ensureLiffReady = async () => {};
    app.DetailCheckout = { prepare: async value => value, enabled: () => false };
    app.isAppendMode = flow === 'append';
    app.isEditOrderMode = flow === 'modify';
    app.parentOrderKey = 'parent';
    app.editOrderKey = 'existing';
    app.bootstrapData = { catalog: [{ slug: 'food', items: [{ id: 'meal', name: 'Meal', price: 100 }] }] };
    app.cart = { food_Meal: 1 };
    app.customizeData = {};
    let attempts = 0, fallbackSends = 0;
    app.liff = { isInClient: () => true, isLoggedIn: () => true, sendMessages: async () => { fallbackSends++; } };
    app.fetch = async (url, init) => {
      if (url.includes('/api/tenant/bootstrap')) {
        assert.ok(init.signal, 'recovery refresh must have a timeout signal');
        throw new Error('Refresh unavailable');
      }
      attempts++;
      return { ok: false, status: 409, json: async () => ({
        code: 'OPTION_PRICE_CHANGED', itemIndex: 0, expectedSubtotal: 110,
      }) };
    };
    for (let attempt = 1; attempt <= 2; attempt++) {
      await app.doSubmitOrderExecution('2026-10-20', '12:00');
      assert.equal(app.isSubmitting, false);
      assert.equal(app.document.getElementById('submit-btn').disabled, false);
      assert.equal(app.cart.food_Meal, 1);
      assert.equal(attempts, attempt);
      assert.equal(fallbackSends, 0);
      assert.match(app.document.getElementById('custom-alert-message').innerHTML, /110/);
    }
  });
}
