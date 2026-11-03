const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

// Helper to create an isolated sandbox for testing orders-core.js tab logic
function createCoreSandbox(initialUrl = 'https://pos.blabfood.app/orders.html?tenant=benmi', initialSessionStorage = {}) {
  const store = { ...initialSessionStorage };
  const urlObj = new URL(initialUrl);

  const mockWindow = {
    location: {
      href: urlObj.href,
      hostname: urlObj.hostname,
      pathname: urlObj.pathname,
      search: urlObj.search,
      hash: urlObj.hash,
      toString() { return this.href; }
    },
    history: {
      replaceState(state, title, newUrl) {
        if (newUrl.startsWith('http://') || newUrl.startsWith('https://')) {
          const u = new URL(newUrl);
          mockWindow.location.href = u.href;
          mockWindow.location.pathname = u.pathname;
          mockWindow.location.search = u.search;
          mockWindow.location.hash = u.hash;
        } else if (newUrl.startsWith('/')) {
          const u = new URL('https://pos.blabfood.app' + newUrl);
          mockWindow.location.href = u.href;
          mockWindow.location.pathname = u.pathname;
          mockWindow.location.search = u.search;
          mockWindow.location.hash = u.hash;
        } else {
          // Hash or relative
          mockWindow.location.hash = newUrl.startsWith('#') ? newUrl : '#' + newUrl;
        }
      }
    },
    sessionStorage: {
      getItem(k) { return store[k] !== undefined ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; },
      clear() { for (const k in store) delete store[k]; }
    },
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    },
    addEventListener(evt, fn) {
      if (!this._listeners) this._listeners = {};
      if (!this._listeners[evt]) this._listeners[evt] = [];
      this._listeners[evt].push(fn);
    },
    dispatchEvent(evtName) {
      if (this._listeners && this._listeners[evtName]) {
        for (const fn of this._listeners[evtName]) fn();
      }
    },
    innerWidth: 1024,
    confirmLeaveMenu: () => true
  };

  const elements = {};
  const mockDoc = {
    documentElement: { classList: { toggle() {} } },
    body: { classList: { toggle() {} } },
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = {
          id,
          style: {},
          classList: {
            classes: new Set(),
            add(c) { this.classes.add(c); },
            remove(c) { this.classes.delete(c); },
            toggle(c, f) {
              if (f === undefined) f = !this.classes.has(c);
              f ? this.classes.add(c) : this.classes.delete(c);
              return f;
            },
            contains(c) { return this.classes.has(c); }
          },
          innerText: '',
          textContent: '',
          setAttribute() {},
          appendChild() {}
        };
      }
      return elements[id];
    },
    querySelectorAll() { return []; },
    addEventListener() {}
  };

  const sandbox = {
    window: mockWindow,
    document: mockDoc,
    sessionStorage: mockWindow.sessionStorage,
    localStorage: mockWindow.localStorage,
    location: mockWindow.location,
    history: mockWindow.history,
    URLSearchParams,
    URL,
    console,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {}
  };

  sandbox.window.window = sandbox.window;
  sandbox.window.document = mockDoc;

  const coreCode = fs.readFileSync(path.join(root, 'js/orders-core.js'), 'utf8');
  vm.runInNewContext(coreCode, sandbox);

  return { sandbox, mockWindow, store, elements };
}

test('getInitialTab: returns "live" by default when no hash, search, or sessionStorage', () => {
  const { sandbox } = createCoreSandbox('https://pos.blabfood.app/orders.html?tenant=benmi');
  assert.equal(typeof sandbox.getInitialTab, 'function');
  assert.equal(sandbox.getInitialTab(), 'live');
  assert.equal(sandbox.activeTab, 'live');
});

test('getInitialTab: restores tab from URL hash, including staff ordering', () => {
  for (const tab of ['menu', 'history', 'reports', 'settings', 'live', 'staff-order']) {
    const { sandbox } = createCoreSandbox(`https://pos.blabfood.app/orders.html?tenant=benmi#${tab}`);
    assert.equal(sandbox.getInitialTab(), tab, `Expected initial tab to be ${tab} from hash`);
    assert.equal(sandbox.activeTab, tab, `Expected activeTab to initialize to ${tab}`);
  }
});

test('getInitialTab: normalizes case and ignores invalid hashes', () => {
  const { sandbox: s1 } = createCoreSandbox('https://pos.blabfood.app/orders.html?tenant=benmi#MENU');
  assert.equal(s1.getInitialTab(), 'menu');

  const { sandbox: s2 } = createCoreSandbox('https://pos.blabfood.app/orders.html?tenant=benmi#unknown_tab_xyz');
  assert.equal(s2.getInitialTab(), 'live');
});

test('getInitialTab: falls back to query param ?tab= when hash is empty', () => {
  const { sandbox } = createCoreSandbox('https://pos.blabfood.app/orders.html?tenant=benmi&tab=history');
  assert.equal(sandbox.getInitialTab(), 'history');
  assert.equal(sandbox.activeTab, 'history');
});

test('getInitialTab: falls back to sessionStorage when hash and query param are empty', () => {
  const { sandbox } = createCoreSandbox('https://pos.blabfood.app/orders.html?tenant=benmi', {
    pos_active_tab: 'settings'
  });
  assert.equal(sandbox.getInitialTab(), 'settings');
  assert.equal(sandbox.activeTab, 'settings');
});

test('getInitialTab: URL hash takes precedence over sessionStorage', () => {
  const { sandbox } = createCoreSandbox('https://pos.blabfood.app/orders.html?tenant=benmi#menu', {
    pos_active_tab: 'history'
  });
  assert.equal(sandbox.getInitialTab(), 'menu');
});

test('getInitialTab: reports tab falls back to live on native app platform', () => {
  const { sandbox } = createCoreSandbox('https://pos.blabfood.app/orders.html?tenant=benmi#reports');
  sandbox.isNativeAppPlatform = () => true;
  assert.equal(sandbox.getInitialTab(), 'live');
});

test('switchTab: saves tab to sessionStorage and updates URL hash silently', () => {
  const { sandbox, store, mockWindow } = createCoreSandbox('https://pos.blabfood.app/orders.html?tenant=benmi');

  // Switch to menu
  sandbox.switchTab('menu');
  assert.equal(sandbox.activeTab, 'menu');
  assert.equal(store.pos_active_tab, 'menu');
  assert.equal(mockWindow.location.hash, '#menu');

  // Switch to history
  sandbox.switchTab('history');
  assert.equal(sandbox.activeTab, 'history');
  assert.equal(store.pos_active_tab, 'history');
  assert.equal(mockWindow.location.hash, '#history');

  // Switch back to live (hash is cleared)
  sandbox.switchTab('live');
  assert.equal(sandbox.activeTab, 'live');
  assert.equal(store.pos_active_tab, 'live');
  assert.equal(mockWindow.location.hash, '');
});

test('switchTab: respects confirmLeaveMenu when leaving dirty menu', () => {
  const { sandbox, store, mockWindow } = createCoreSandbox('https://pos.blabfood.app/orders.html?tenant=benmi#menu');
  sandbox.activeTab = 'menu';

  // Deny leaving menu
  sandbox.confirmLeaveMenu = () => false;
  sandbox.switchTab('history');

  // Must remain on menu
  assert.equal(sandbox.activeTab, 'menu');
  assert.equal(mockWindow.location.hash, '#menu');
  assert.equal(store.pos_active_tab, undefined);
});

test('switchTab: opens staff workspace and returns to live orders', () => {
  const { sandbox, store, mockWindow, elements } = createCoreSandbox();
  let initialized = 0;
  sandbox.initStaffOrderFrame = () => { initialized++; };

  sandbox.switchTab('staff-order');
  assert.equal(sandbox.activeTab, 'staff-order');
  assert.equal(store.pos_active_tab, 'staff-order');
  assert.equal(mockWindow.location.hash, '#staff-order');
  assert.equal(elements['view-staff-order'].style.display, 'block');
  assert.equal(elements['view-live'].style.display, 'none');
  assert.equal(initialized, 1);

  sandbox.switchTab('live');
  assert.equal(elements['view-staff-order'].style.display, 'none');
  assert.equal(elements['view-live'].style.display, 'flex');
  assert.equal(mockWindow.location.hash, '');
});

test('orders-menu.js: menuSidebarTab initializes from and saves to sessionStorage', () => {
  const store = { pos_menu_subtab: 'options' };
  const mockDoc = {
    getElementById: () => ({
      classList: {
        add() {},
        remove() {},
        toggle() {},
        contains() { return false; }
      },
      setAttribute() {},
      style: {},
      addEventListener() {}
    }),
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  const mockWin = {
    addEventListener: () => {},
    sessionStorage: {
      getItem: (k) => store[k] || null,
      setItem: (k, v) => { store[k] = String(v); }
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    location: { search: '?tenant=benmi', hash: '', pathname: '/orders.html', hostname: 'pos.blabfood.app' },
    document: mockDoc,
    t: k => k
  };
  mockWin.window = mockWin;

  const sandbox = {
    window: mockWin,
    document: mockDoc,
    sessionStorage: mockWin.sessionStorage,
    localStorage: mockWin.localStorage,
    location: mockWin.location,
    t: k => k,
    confirmLeaveMenu: () => true,
    isMenuDirty: false,
    syncMenuDataFromDOM: () => {},
    renderMenuCategories: () => {},
    renderMenuCategoryEditor: () => {},
    console
  };

  const menuCode = fs.readFileSync(path.join(root, 'js/orders-menu.js'), 'utf8');
  vm.runInNewContext(menuCode, sandbox);

  // Initialized from sessionStorage 'options'
  assert.equal(sandbox.menuSidebarTab, 'options');

  // Switch to products
  sandbox.setMenuSidebarTab('products');
  assert.equal(sandbox.menuSidebarTab, 'products');
  assert.equal(store.pos_menu_subtab, 'products');

  // Switch back to options
  sandbox.setMenuSidebarTab('options');
  assert.equal(sandbox.menuSidebarTab, 'options');
  assert.equal(store.pos_menu_subtab, 'options');
});

test('orders.html: includes versioned tab scripts and initializes with getInitialTab()', () => {
  const html = fs.readFileSync(path.join(root, 'orders.html'), 'utf8');
  assert.ok(/js\/orders-core\.js\?v=\w+/.test(html), 'orders-core.js must have a versioned cache buster');
  assert.ok(/js\/orders-menu\.js\?v=\w+/.test(html), 'orders-menu.js must have a versioned cache buster');
  assert.ok(html.includes('getInitialTab()'), 'orders.html must call getInitialTab() on DOMContentLoaded');
  assert.ok(html.includes('switchTab(initialTab)'), 'orders.html must switch to initialTab on DOMContentLoaded');
});
