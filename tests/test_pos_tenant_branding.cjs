const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'orders.html'), 'utf8');
const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const earlyTenant = inlineScripts.find(code => code.includes('window.__INITIAL_TENANT_ID ='));
const earlyBrand = inlineScripts.find(code => code.includes('const tenantId = window.__INITIAL_TENANT_ID'));
const core = fs.readFileSync(path.join(root, 'js/orders-core.js'), 'utf8');

function fixture(url, cached = {}) {
  const storage = new Map(Object.entries(cached));
  const element = (text = '') => ({
    innerText: text, textContent: text, innerHTML: '', src: '', style: { display: 'none' },
    removeAttribute(name) { if (name === 'src') this.src = ''; }
  });
  const nodes = {
    'brand-title': element('Blab POS'), 'brand-logo': element(),
    'sidebar-mobile-title': element('Blab POS'), 'sidebar-mobile-logo': element('B')
  };
  const document = {
    title: 'Blab POS', documentElement: { style: { setProperty() {} }, classList: { add() {}, toggle() {} } },
    getElementById: id => nodes[id] || null, querySelectorAll: () => [], addEventListener() {}
  };
  let release;
  const response = new Promise(resolve => { release = resolve; });
  const sandbox = {
    window: { location: new URL(url), innerWidth: 1024, addEventListener() {} },
    document, navigator: { userAgent: 'test' }, URLSearchParams, URL, console,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    fetch: () => response, setInterval() {}, clearInterval() {}, setTimeout() {}, clearTimeout() {}
  };
  vm.createContext(sandbox);
  vm.runInContext(earlyTenant, sandbox);
  vm.runInContext(earlyBrand, sandbox);
  return {
    sandbox, nodes,
    loadCore() { vm.runInContext(core, sandbox); },
    async bootstrap(tenant) {
      release({ ok: true, json: async () => ({ tenant, customizations: [] }) });
      await new Promise(setImmediate);
    }
  };
}

const benmiCache = {
  pos_device_tenant_id: 'benmi',
  tenant_branding_benmi: JSON.stringify({ brandName: 'Benmi', logoUrl: 'https://images.test/benmi.png' })
};

test('initial route branding uses the URL tenant before a paired tenant or Benmi cache', () => {
  for (const route of ['/store-a', '/store-a/orders', '/orders.html?tenant_id=store-a', '/store-b/orders?tenant=%20store-a%20']) {
    const f = fixture('https://pos.blabfood.app' + route, benmiCache);
    assert.equal(f.sandbox.window.__INITIAL_TENANT_ID, 'store-a');
    assert.equal(f.nodes['brand-title'].innerText, 'Blab POS');
    assert.equal(f.nodes['brand-logo'].src, '');
    assert.equal(f.nodes['sidebar-mobile-logo'].innerHTML, '');
    f.loadCore();
    assert.equal(f.sandbox.getTenantIdFromUrl(), 'store-a');
  }
});

test('first bootstrap updates both the header and drawer without a cached tenant', async () => {
  const f = fixture('https://pos.blabfood.app/store-a/orders', benmiCache);
  f.loadCore();
  await f.bootstrap({ brandName: 'Store A', logoUrl: 'https://images.test/store-a.png' });
  assert.equal(f.nodes['brand-title'].innerText, 'Store A');
  assert.equal(f.nodes['sidebar-mobile-title'].innerText, 'Store A');
  assert.equal(f.nodes['brand-logo'].src, 'https://images.test/store-a.png');
  assert.match(f.nodes['sidebar-mobile-logo'].innerHTML, /https:\/\/images.test\/store-a.png/);
  assert.equal(f.sandbox.document.title, 'Store A POS');
});

test('fresh branding replaces cached logos and clears a removed logo in both places', async () => {
  const f = fixture('https://pos.blabfood.app/store-a', {
    'tenant_branding_store-a': JSON.stringify({ brandName: 'Old Store', logoUrl: 'https://images.test/old.png' })
  });
  f.loadCore();
  assert.match(f.nodes['sidebar-mobile-logo'].innerHTML, /old.png/);
  await f.bootstrap({ brandName: 'Store A', logoUrl: 'https://images.test/new.png' });
  assert.match(f.nodes['sidebar-mobile-logo'].innerHTML, /new.png/);
  f.sandbox.applyTenantBranding({ brandName: 'Store A', logoUrl: null });
  assert.equal(f.nodes['brand-logo'].style.display, 'none');
  assert.equal(f.nodes['brand-logo'].src, '');
  assert.equal(f.nodes['sidebar-mobile-logo'].textContent, 'S');
});

test('a delayed bootstrap cannot replace branding after the tenant changes', async () => {
  const f = fixture('https://pos.blabfood.app/store-a');
  f.loadCore();
  f.sandbox.window.location = new URL('https://pos.blabfood.app/store-b');
  f.sandbox.applyTenantBranding({ brandName: 'Store B', logoUrl: 'https://images.test/b.png' });
  await f.bootstrap({ brandName: 'Store A', logoUrl: 'https://images.test/a.png' });
  assert.equal(f.nodes['brand-title'].innerText, 'Store B');
  assert.equal(f.nodes['sidebar-mobile-title'].innerText, 'Store B');
  assert.equal(f.nodes['brand-logo'].src, 'https://images.test/b.png');
});
