const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadMenuEditor } = require('./helpers/menu-editor-loader.cjs');

function createDOMEnvironment() {
  const domElements = {};
  function createElement(id, tagName = 'div') {
    return {
      id,
      tagName,
      value: '',
      style: {},
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        toggle(c, force) {
          if (force === undefined) {
            if (this._classes.has(c)) this._classes.delete(c);
            else this._classes.add(c);
          } else if (force) {
            this._classes.add(c);
          } else {
            this._classes.delete(c);
          }
          return this._classes.has(c);
        },
        contains(c) { return this._classes.has(c); }
      },
      attributes: {},
      addEventListener() {},
      removeEventListener() {},
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      removeAttribute(k) { delete this.attributes[k]; },
      appendChild(child) { (this.children = this.children || []).push(child); return child; },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      children: [],
      innerHTML: '',
      innerText: '',
      textContent: ''
    };
  }

  // Pre-populate common elements
  const commonIds = [
    'btn-menu-save', 'i18n-btn-menu-save',
    'itemDetailModal', 'item-detail-name-input', 'item-detail-price-input', 'item-detail-badge-input', 'item-detail-recommended',
    'itemModifiersModal', 'item-modifiers-modal-title', 'item-modifiers-groups-container',
    'modal-bundle-editor', 'bundle-modal-item-name', 'bundle-modal-item-price', 'btn-bundle-remove-config', 'bundle-danger-zone-card',
    'menu-editor-body', 'menu-categories', 'tab-menu'
  ];
  commonIds.forEach(id => {
    domElements[id] = createElement(id);
  });

  const queryElements = [];

  const documentMock = {
    getElementById(id) {
      if (!domElements[id]) domElements[id] = createElement(id);
      return domElements[id];
    },
    createElement(tag) {
      return createElement(`mock-${Math.random()}`, tag);
    },
    querySelectorAll(selector) {
      if (selector.includes('#menu-editor-body input')) {
        return queryElements;
      }
      return [];
    },
    addEventListener() {}
  };

  const sandbox = {
    document: documentMock,
    window: null,
    alert: () => {},
    confirm: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
    getTenantIdFromUrl: () => 'test_tenant',
    WORKER_BASE: 'https://test.workers.dev',
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
    escapeHtml: s => String(s || ''),
    t: k => k,
    renderMenuCategoryEditor: () => {},
    renderMenuCategories: () => {},
    isMenuLoadedCompletely: true,
    currentLang: 'vi',
    POS_SVG: {}
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  loadMenuEditor(sandbox);

  const getIsMenuDirty = () => vm.runInContext('isMenuDirty', sandbox);
  const setCurrentMenuData = (data) => {
    sandbox._injectData = data;
    vm.runInContext('currentMenuData = _injectData; delete _injectData;', sandbox);
  };
  const getCurrentMenuData = () => vm.runInContext('currentMenuData', sandbox);
  const getTempItemModifierGroups = () => vm.runInContext('tempItemModifierGroups', sandbox);
  const setIsMenuLoadedCompletely = (val) => {
    vm.runInContext(`isMenuLoadedCompletely = ${Boolean(val)};`, sandbox);
  };

  return {
    sandbox,
    domElements,
    queryElements,
    createElement,
    getIsMenuDirty,
    setCurrentMenuData,
    getCurrentMenuData,
    getTempItemModifierGroups,
    setIsMenuLoadedCompletely
  };
}

test('canonicalMenuSnapshot normalizes whitespace, empty modifier lists, and object key order', () => {
  const { sandbox } = createDOMEnvironment();
  const canonical = sandbox.canonicalMenuSnapshot;

  const dataA = [
    {
      id: 'cat_1',
      title: '  Bánh Mì  ',
      type: 'catalog',
      items: [
        {
          name: '  Bánh Mì Thịt  ',
          price: 50,
          badgeText: '',
          modifierGroups: [],
          bundleRule: { groups: [] },
          _internalState: 'discard-me'
        }
      ]
    }
  ];

  const dataB = [
    {
      title: 'Bánh Mì',
      id: 'cat_1',
      type: 'catalog',
      items: [
        {
          price: 50,
          name: 'Bánh Mì Thịt',
          badgeText: null,
          modifierGroups: null,
          bundleRule: null
        }
      ]
    }
  ];

  assert.equal(canonical(dataA), canonical(dataB), 'Snapshots must be identical regardless of whitespace, key order, or empty arrays/nulls');
});

test('Opening Item Detail and closing/saving without changes does NOT mark menu dirty', () => {
  const { sandbox, domElements, setCurrentMenuData, getIsMenuDirty, setIsMenuLoadedCompletely } = createDOMEnvironment();

  setCurrentMenuData([
    {
      id: 'cat_1',
      title: 'Cơm Tấm',
      type: 'catalog',
      items: [
        { id: 'item_1', name: 'Sườn Bì', price: 65, badgeText: '', isRecommended: false, modifierGroups: [] }
      ]
    }
  ]);
  setIsMenuLoadedCompletely(true);
  sandbox.clearMenuDirty();
  assert.equal(getIsMenuDirty(), false, 'Menu starts in saved clean state');

  // Open item detail modal
  sandbox.openItemDetailModal(0, 0);
  assert.equal(domElements.itemDetailModal.style.display, 'flex');

  // Close modal without any changes
  sandbox.closeItemDetailModal();
  assert.equal(domElements.itemDetailModal.style.display, 'none');
  assert.equal(getIsMenuDirty(), false, 'Closing without edit must keep isMenuDirty false');

  // Open item detail modal again and save without modifications
  sandbox.openItemDetailModal(0, 0);
  domElements['item-detail-name-input'].value = 'Sườn Bì';
  domElements['item-detail-price-input'].value = '65';
  domElements['item-detail-badge-input'].value = '';
  domElements['item-detail-recommended'].checked = false;

  sandbox.saveItemDetailModal();
  assert.equal(getIsMenuDirty(), false, 'Saving unchanged values must keep isMenuDirty false');
});

test('Item Detail Modal rolls back draft changes if user cancels / presses Escape / closes modal', () => {
  const { sandbox, domElements, setCurrentMenuData, getCurrentMenuData, getIsMenuDirty, setIsMenuLoadedCompletely } = createDOMEnvironment();

  setCurrentMenuData([
    {
      id: 'cat_1',
      title: 'Cơm Tấm',
      type: 'catalog',
      items: [
        { id: 'item_1', name: 'Sườn Bì', price: 65, badgeText: 'Hot', isRecommended: true, modifierGroups: [] }
      ]
    }
  ]);
  setIsMenuLoadedCompletely(true);
  sandbox.clearMenuDirty();

  sandbox.openItemDetailModal(0, 0);
  // User changes input fields and autoCommit runs
  domElements['item-detail-name-input'].value = 'Sườn Bì Chả Trứng Đặc Biệt';
  domElements['item-detail-price-input'].value = '999';
  domElements['item-detail-badge-input'].value = 'New';
  sandbox.autoCommitItemDetailFields();

  assert.equal(getIsMenuDirty(), true, 'Dirty detected while drafting changes');

  // User decides to cancel
  sandbox.closeItemDetailModal();

  // Assert rollback
  const restoredItem = getCurrentMenuData()[0].items[0];
  assert.equal(restoredItem.name, 'Sườn Bì', 'Item name must be restored to original');
  assert.equal(restoredItem.price, 65, 'Item price must be restored to original');
  assert.equal(restoredItem.badgeText, 'Hot', 'Badge must be restored');
  assert.equal(getIsMenuDirty(), false, 'After cancel, isMenuDirty must revert to false');
});

test('Item Modifiers Modal rolls back draft changes on cancel', () => {
  const { sandbox, setCurrentMenuData, getCurrentMenuData, getIsMenuDirty, getTempItemModifierGroups, setIsMenuLoadedCompletely } = createDOMEnvironment();

  setCurrentMenuData([
    {
      id: 'cat_1',
      title: 'Đồ Uống',
      type: 'catalog',
      items: [
        { id: 'item_1', name: 'Trà Sữa', price: 40, modifierGroups: [{ group_id: 'sugar', name: 'Đường', options: [] }] }
      ]
    }
  ]);
  setIsMenuLoadedCompletely(true);
  sandbox.clearMenuDirty();

  sandbox.openItemModifiersModal(0, 0);
  // Modify draft modifier groups
  getTempItemModifierGroups().push({ group_id: 'ice', name: 'Đá', options: [] });

  // User clicks close/cancel
  sandbox.closeItemModifiersModal();

  assert.equal(getCurrentMenuData()[0].items[0].modifierGroups.length, 1, 'Original modifiers intact');
  assert.equal(getIsMenuDirty(), false, 'isMenuDirty remains false');
});

test('Real-time inline DOM editing toggles isMenuDirty on change and dims back on revert', () => {
  const { sandbox, queryElements, createElement, setCurrentMenuData, getIsMenuDirty, setIsMenuLoadedCompletely } = createDOMEnvironment();

  setCurrentMenuData([
    {
      id: 'cat_1',
      title: 'Món Chính',
      type: 'catalog',
      items: [
        { id: 'item_1', name: 'Phở Bò', price: 60, badgeText: '', modifierGroups: [] }
      ]
    }
  ]);
  setIsMenuLoadedCompletely(true);
  sandbox.clearMenuDirty();

  // Mock DOM input element for price
  const priceInput = createElement('price-input-0-0', 'input');
  priceInput.setAttribute('data-cidx', '0');
  priceInput.setAttribute('data-iidx', '0');
  priceInput.value = '60';
  queryElements.push(priceInput);

  // User edits price to 75
  priceInput.value = '75';
  sandbox.markMenuDirty();
  assert.equal(getIsMenuDirty(), true, 'Changing price turns isMenuDirty to true');

  // User reverts price back to 60
  priceInput.value = '60';
  sandbox.markMenuDirty();
  assert.equal(getIsMenuDirty(), false, 'Reverting price back to 60 automatically turns isMenuDirty to false');
});

test('confirmLeaveMenu returns true without prompting confirm when no changes made', () => {
  const { sandbox, setCurrentMenuData, setIsMenuLoadedCompletely } = createDOMEnvironment();

  setCurrentMenuData([
    {
      id: 'cat_1',
      title: 'Món Chính',
      type: 'catalog',
      items: [
        { id: 'item_1', name: 'Phở Bò', price: 60, badgeText: '', modifierGroups: [] }
      ]
    }
  ]);
  setIsMenuLoadedCompletely(true);
  sandbox.clearMenuDirty();

  let confirmCalled = false;
  sandbox.confirm = () => {
    confirmCalled = true;
    return false;
  };

  const canLeave = sandbox.confirmLeaveMenu();
  assert.equal(canLeave, true, 'Must allow leaving without prompt');
  assert.equal(confirmCalled, false, 'confirm() dialog must NOT be triggered');
});

function stockFixture(kind = 'catalog') {
  const app = createDOMEnvironment();
  const { sandbox, setCurrentMenuData, setIsMenuLoadedCompletely } = app;
  const option = { id: 'option_1', name: 'Normal', originalName: 'Normal', price: 0, isOos: false, isOutOfStock: false };
  const group = { id: 'group_1', key: 'flavor', canonicalId: 'canonical_1', title: 'Flavor', options: [{ ...option }] };
  setCurrentMenuData([
    kind === 'catalog'
      ? { id: 'food', type: 'catalog', title: 'Food', sortOrder: 0, items: [
        { id: 'item_1', name: 'Meal', originalName: 'Meal', price: 60, isOos: false },
        { id: 'item_2', name: 'Soup', originalName: 'Soup', price: 30, isOos: false }
      ] }
      : { id: 'flavor', type: kind, title: 'Flavor', groups: [group], items: kind === 'modifier'
        ? [{ id: 'other', name: 'Other', isOos: false }, { ...option }] : [] },
    { id: 'other', type: 'catalog', title: 'Other', items: [{ id: 'other_meal', name: 'Other meal', price: 50,
      modifierGroups: [{ ...group, options: [{ ...option }] }] }], groups: [
      { id: 'unrelated', key: 'unrelated', options: [{ id: 'other_option', name: 'Normal', isOos: false }] }
    ] }
  ]);
  setIsMenuLoadedCompletely(true);
  sandbox.renderMenuCategories = () => {};
  sandbox.renderMenuCategoryEditor = () => {};
  sandbox.renderOrderCustomizationEditor = () => {};
  const alerts = [], requests = [];
  const stockChoices = new Map();
  sandbox.localStorage = {
    getItem: key => stockChoices.get(key) || null,
    setItem: (key, value) => stockChoices.set(key, value),
    removeItem: key => stockChoices.delete(key)
  };
  sandbox.alert = message => alerts.push(message);
  sandbox.fetch = async (url, request) => {
    requests.push({ url, body: JSON.parse(request.body) });
    return { ok: true, json: async () => ({ success: true }) };
  };
  sandbox.clearMenuDirty();
  const open = () => kind === 'catalog' ? sandbox.openStockModal(0, 0) : sandbox.openStockModalForCustomization(0, 0, 0);
  open();
  const control = id => sandbox.document.getElementById(id);
  const choose = (status, duration = 'today', date = '') => {
    control('stock-status-select').value = status;
    control('stock-duration-select').value = duration;
    control('oos-until-date').value = date;
  };
  const target = () => kind === 'catalog' ? app.getCurrentMenuData()[0].items[0] : app.getCurrentMenuData()[0].groups[0].options[0];
  const saved = () => JSON.parse(vm.runInContext('savedMenuSnapshot', sandbox));
  return { ...app, kind, alerts, requests, control, choose, target, saved, open };
}

for (const kind of ['catalog', 'order_customization', 'modifier']) {
  test(`${kind}: a stock save closes the modal and is clean without a full menu save`, async () => {
    const app = stockFixture(kind);
    for (const status of ['out_of_stock', 'in_stock']) {
      app.open();app.choose(status);
      await app.sandbox.saveStockStatus();
      assert.equal(app.control('stockModal').style.display, 'none');
      assert.equal(app.target().isOos, status === 'out_of_stock');
      assert.equal(app.getIsMenuDirty(), false);
      assert.equal(app.control('btn-menu-save').disabled, true);
      assert.equal(app.sandbox.confirmLeaveMenu(), true);
      if (kind !== 'catalog') {
        assert.equal(app.getCurrentMenuData()[1].items[0].modifierGroups[0].options[0].isOos, status === 'out_of_stock');
        assert.equal(app.getCurrentMenuData()[1].groups[0].options[0].isOos, false, 'Same-name option in another group is untouched');
      }
      if (kind === 'modifier') {
        assert.equal(app.getCurrentMenuData()[0].items[1].isOos, status === 'out_of_stock', 'Mirror is resolved by ID, not array position');
        assert.equal(app.getCurrentMenuData()[0].items[0].isOos, false);
      }
    }
    assert.deepEqual(app.alerts, []);
    assert.equal(app.requests.length, 2);
    assert.ok(app.requests.every(request => request.url.includes('/api/menu/stock-status?tenant_id=test_tenant')));
  });
}

test('stock save preserves unrelated names, prices and order drafts; discarding drafts retains persisted stock', async () => {
  const app = stockFixture();
  const data = app.getCurrentMenuData();
  data[0].items[0].name = 'Draft meal';data[0].items[0].price = 99;
  data[0].sortOrder = 20;data[0].items.reverse();data.reverse();
  app.sandbox.checkMenuDirty();
  app.sandbox.openStockModal(1, 1);app.choose('out_of_stock');
  await app.sandbox.saveStockStatus();
  assert.equal(app.requests[0].body.name, 'Meal', 'Use persisted name despite a local rename');
  assert.equal(app.getIsMenuDirty(), true);
  assert.equal(data[1].items[1].name, 'Draft meal');
  assert.equal(data[1].items[1].price, 99);
  assert.equal(data[1].sortOrder, 20);
  assert.equal(app.saved()[0].items[0].name, 'Meal');
  assert.equal(app.saved()[0].items[0].price, 60);
  assert.equal(app.saved()[0].items[0].isOos, true);
  assert.equal(app.sandbox.confirmLeaveMenu(), true);
  assert.equal(app.getCurrentMenuData()[0].items[0].isOos, true);
  assert.equal(app.getCurrentMenuData()[0].items[0].name, 'Meal');
  assert.equal(app.getCurrentMenuData()[0].items[0].price, 60);
  assert.equal(app.getIsMenuDirty(), false);
});

test('modifier stock save preserves an option name/price draft and updates its saved mirrors', async () => {
  const app = stockFixture('modifier');
  app.target().name = 'Draft choice';app.target().price = 8;
  app.choose('out_of_stock');await app.sandbox.saveStockStatus();
  assert.equal(app.target().name, 'Draft choice');assert.equal(app.target().price, 8);
  assert.equal(app.getIsMenuDirty(), true);
  assert.equal(app.sandbox.confirmLeaveMenu(), true);
  const data = app.getCurrentMenuData();
  assert.equal(data[0].groups[0].options[0].name, 'Normal');
  assert.equal(data[0].groups[0].options[0].price, 0);
  assert.equal(data[0].groups[0].options[0].isOos, true);
  assert.equal(data[0].items[1].isOos, true);
  assert.equal(data[1].items[0].modifierGroups[0].options[0].isOutOfStock, true);
});

test('stock changes update linked option copies by group/product identity without touching unrelated choices', async () => {
  const custom = stockFixture('modifier');
  custom.getCurrentMenuData()[1].items[0].modifierGroups.push({ group_id: 'canonical_1', options: [
    { id: 'option_1', name: 'Normal', isOos: false }, { id: 'different', name: 'Normal', isOos: false }
  ] });
  custom.sandbox.clearMenuDirty();custom.choose('out_of_stock');await custom.sandbox.saveStockStatus();
  const copies = custom.getCurrentMenuData()[1].items[0].modifierGroups[1].options;
  assert.equal(copies[0].isOos, true);assert.equal(copies[1].isOos, false);
  assert.equal(custom.getIsMenuDirty(), false);
  const product = stockFixture();
  product.getCurrentMenuData()[1].groups[0].options.push({ id: 'linked', productId: 'item_1', isOutOfStock: false });
  product.sandbox.clearMenuDirty();product.choose('out_of_stock');await product.sandbox.saveStockStatus();
  assert.equal(product.getCurrentMenuData()[1].groups[0].options[1].isOutOfStock, true);
  assert.equal(product.getIsMenuDirty(), false);
});

test('legacy products without IDs retain stock after a name draft is discarded', async () => {
  const app = stockFixture();delete app.target().id;app.sandbox.clearMenuDirty();
  app.target().name = 'Draft meal';app.choose('out_of_stock');
  await app.sandbox.saveStockStatus();app.sandbox.confirmLeaveMenu();
  assert.equal(app.target().name, 'Meal');assert.equal(app.target().isOos, true);
});

test('resuming an option clears stale expiry fields so a later menu save cannot pause it again', async () => {
  const app = stockFixture('modifier');
  app.target().isOos = true;
  app.target().outOfStockUntil = '9999-12-31T23:59:59.000Z';
  app.target().out_of_stock_until = '9999-12-31T23:59:59.000Z';
  app.sandbox.clearMenuDirty();app.choose('in_stock');
  await app.sandbox.saveStockStatus();
  assert.equal(app.target().outOfStockUntil, null);assert.equal(app.target().out_of_stock_until, null);
  assert.equal(app.saved()[0].groups[0].options[0].outOfStockUntil, null);
  assert.equal(app.getIsMenuDirty(), false);
});

for (const failure of ['offline', 'http', 'non-json']) {
  test(`${failure}: failed stock writes preserve state and selections for retry`, async () => {
    const app = stockFixture();const before = JSON.stringify(app.saved());
    const date = app.control('oos-until-date').min;
    app.choose('out_of_stock', 'multiple_days', date);
    app.sandbox.fetch = async () => {
      if (failure === 'offline') throw new Error('Offline');
      return { ok: false, json: async () => { if (failure === 'non-json') throw new Error('HTML error');return { error: 'Unavailable' }; } };
    };
    await app.sandbox.saveStockStatus();
    assert.equal(app.target().isOos, false);assert.equal(JSON.stringify(app.saved()), before);
    assert.equal(app.getIsMenuDirty(), false);assert.equal(app.control('stockModal').style.display, 'flex');
    assert.equal(app.control('stock-duration-select').value, 'multiple_days');
    assert.equal(app.control('oos-until-date').value, date);
    assert.equal(app.control('btn-stock-save').disabled, false);
    assert.equal(app.control('stock-drawer-error').hidden, false);
    assert.equal(app.control('stock-drawer-error').textContent, 'stockSaveError');
    assert.equal(app.alerts.length, 0, 'Errors stay in the drawer instead of blocking the POS');
    app.sandbox.fetch = async () => ({ ok: true });await app.sandbox.saveStockStatus();
    assert.equal(app.target().isOos, true);assert.equal(app.getIsMenuDirty(), false);
    assert.equal(app.control('stockModal').style.display, 'none');
  });
}

test('pending stock save prevents duplicate requests, dismissal, target changes and full menu writes', async () => {
  const app = stockFixture();let resolve, writes = 0;
  app.sandbox.fetch = () => { writes++;return new Promise(done => { resolve = done; }); };
  app.choose('out_of_stock');const saving = app.sandbox.saveStockStatus();
  assert.equal(app.control('btn-stock-save').disabled, true);
  assert.equal(app.control('stock-status-select').disabled, true);
  assert.equal(app.control('stockModal').getAttribute('aria-busy'), 'true');
  app.sandbox.closeStockModal();app.sandbox.openStockModal(0, 1);
  await app.sandbox.saveStockStatus();await app.sandbox.saveMenuData(true);
  assert.equal(app.control('stockModal').style.display, 'flex');
  assert.equal(app.sandbox.confirmLeaveMenu(), false);assert.equal(writes, 1);
  // Category order can change while a response is pending; the original target survives.
  const target = app.target();app.getCurrentMenuData().reverse();
  resolve({ ok: true });await saving;
  assert.equal(target.isOos, true);assert.equal(app.saved()[0].items[0].isOos, true);
  assert.equal(app.getIsMenuDirty(), true, 'Unpersisted category order remains dirty');
  assert.equal(app.control('stockModal').getAttribute('aria-busy'), 'false');
});

test('all existing stock durations preserve the API payload and missing dates prevent writes', async () => {
  for (const duration of ['today', 'indefinite', 'multiple_days']) {
    const app = stockFixture();
    const date = duration === 'multiple_days' ? app.control('oos-until-date').min : '';
    app.choose('out_of_stock', duration, date);
    await app.sandbox.saveStockStatus();
    assert.equal(app.requests[0].body.duration, duration);
    assert.equal(app.requests[0].body.until_date, date ? date + 'T04:00:00+07:00' : null);
    assert.equal(app.getIsMenuDirty(), false);
  }
  const app = stockFixture();app.choose('out_of_stock', 'multiple_days');
  await app.sandbox.saveStockStatus();assert.equal(app.requests.length, 0);
  assert.equal(app.control('stockModal').style.display, 'flex');
  assert.equal(app.control('stock-drawer-error').textContent, 'alertSelectOosDate');
});

for (const kind of ['catalog', 'order_customization', 'modifier']) {
  test(`${kind}: choosing a stock duration saves immediately and restoring takes one action`, async () => {
    const app = stockFixture(kind);
    for (const duration of ['today', 'indefinite']) {
      app.open();
      assert.equal(app.control('btn-stock-save').hidden, true);
      await app.sandbox.chooseStockStatus(duration);
      assert.equal(app.target().isOos, true);
      assert.equal(app.requests.at(-1).body.duration, duration);
      assert.equal(app.control('stockModal').style.display, 'none');
      app.open();
      assert.equal(app.control('stock-duration-select').value, duration, 'Reopening restores the persisted duration');
      assert.equal(app.control('btn-stock-restore').hidden, false);
      await app.sandbox.chooseStockStatus('in_stock');
      assert.equal(app.target().isOos, false);
      assert.equal(app.requests.at(-1).body.status, 'in_stock');
    }
    assert.equal(app.requests.length, 4);
    assert.equal(app.getIsMenuDirty(), false);
  });
}

test('a specific date is not saved before applying, and past dates cannot write', async () => {
  const app = stockFixture();
  await app.sandbox.chooseStockStatus('multiple_days');
  assert.equal(app.requests.length, 0);
  assert.equal(app.control('oos-date-container').style.display, 'block');
  assert.equal(app.control('btn-stock-save').hidden, false);
  assert.equal(app.control('btn-stock-save').disabled, true);
  app.control('oos-until-date').value = '2000-01-01';
  await app.sandbox.saveStockStatus();
  assert.equal(app.requests.length, 0);
  assert.equal(app.control('stock-drawer-error').textContent, 'stockDateInvalid');
  const date = app.control('oos-until-date').min;
  app.control('oos-until-date').value = date;
  await app.sandbox.saveStockStatus();
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].body.until_date, date + 'T04:00:00+07:00');
  app.open();
  assert.equal(app.control('stock-duration-select').value, 'multiple_days');
  assert.equal(app.control('oos-until-date').value, date);
  assert.equal(app.requests.length, 1, 'Reopening does not save again');
});

test('server expiry restores a saved selection without storage and ignores stale cached choices', async () => {
  const app = stockFixture();
  const date = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  app.choose('out_of_stock', 'multiple_days', date);await app.sandbox.saveStockStatus();
  assert.equal(app.saved()[0].items[0].outOfStockUntil, new Date(date + 'T04:00:00+07:00').toISOString());
  app.target().outOfStockUntil = '9999-12-31T23:59:59.000Z';app.open();
  assert.equal(app.control('stock-duration-select').value, 'indefinite', 'Server state wins over an old remembered date');
  app.sandbox.localStorage = { getItem() { throw new Error('Unavailable'); } };
  app.target().outOfStockUntil = new Date(date + 'T04:00:00+07:00').toISOString();app.open();
  assert.equal(app.control('stock-duration-select').value, 'multiple_days');
  assert.equal(app.control('oos-until-date').value, date);
});

test('switching from a date to a quick duration drops the unused expiry and cancellation sends nothing', async () => {
  const app = stockFixture();
  await app.sandbox.chooseStockStatus('multiple_days');
  app.control('oos-until-date').value = app.control('oos-until-date').min;
  await app.sandbox.chooseStockStatus('indefinite');
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].body.until_date, null);
  app.open();app.sandbox.closeStockModal();
  assert.equal(app.requests.length, 1);
});

test('an unavailable Unified catalog refresh cannot turn a successful stock write into a save error', async () => {
  const app = stockFixture();
  app.sandbox.UnifiedMenu = { enabled: true, load: async () => { throw new Error('Refresh offline'); } };
  app.choose('out_of_stock');await app.sandbox.saveStockStatus();
  assert.equal(app.target().isOos, true);assert.equal(app.getIsMenuDirty(), false);
  assert.equal(app.control('stockModal').style.display, 'none');assert.deepEqual(app.alerts, []);
});
