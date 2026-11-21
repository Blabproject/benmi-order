import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const initialScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(initialScript, 'index.html must contain the tenant resolver');

function storage(values = {}) {
  const data = { ...values };
  return {
    getItem: key => data[key] ?? null,
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: key => { delete data[key]; }
  };
}

function resolveTenant(url, pendingTenant, fetch) {
  const parsed = new URL(url);
  const classes = new Set();
  const context = {
    URLSearchParams,
    URL,
    decodeURIComponent,
    fetch,
    location: {
      href: parsed.href,
      hostname: parsed.hostname,
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
      replace: () => {}
    },
    document: {
      title: '',
      documentElement: { classList: { add: value => classes.add(value) } }
    },
    sessionStorage: storage(pendingTenant ? { pending_line_login_tenant_id: pendingTenant } : {}),
    localStorage: storage({ current_tenant_id: 'jiangjiejie', benmi_last_tenant_id: 'jiangjiejie' })
  };
  context.window = context;
  vm.runInNewContext(initialScript, context);
  return {
    tenant: context.__INITIAL_TENANT_ID,
    failed: context.__TENANT_RESOLUTION_FAILED === true,
    classes,
    menuRequest: context.__initialMenuRequest,
  };
}

test('the head starts the customer menu request against the correct environment', async () => {
  const requests = [];
  const response = { ok: true };
  const fetch = async (url, options) => { requests.push([url, options.cache]); return response; };
  for (const [url, worker] of [
    ['https://staging.benmi-order.pages.dev/?tenant_id=bsc', 'platform-worker-staging'],
    ['https://dev.benmi-order.pages.dev/?tenant_id=bsc', 'platform-worker-dev'],
    ['https://order.blabfood.app/bsc', 'benmi-worker-official'],
  ]) {
    const { menuRequest } = resolveTenant(url, undefined, fetch);
    assert.equal(menuRequest.tenantId, 'bsc');
    assert.equal(await menuRequest.response, response);
    assert.deepEqual(requests.shift(), [`https://${worker}.thuanmnc.workers.dev/api/tenant/bootstrap?tenant_id=bsc`, 'no-cache']);
  }
  for (const url of [
    'https://order.blabfood.app/bsc?tenant_id=another',
    'https://benmi-order.pages.dev/?code=abc&state=xyz',
    'https://pos.blabfood.app/?tenant_id=bsc&mode=staff&env=staging',
    'https://blabfood.app/',
  ]) assert.equal(resolveTenant(url, undefined, fetch).menuRequest, undefined);
  assert.equal(requests.length, 0);
});

test('explicit tenant and LIFF state override a stale tenant from a previous visit', () => {
  assert.equal(resolveTenant('https://benmi-order.pages.dev/?tenant_id=bsc').tenant, 'bsc');
  const state = encodeURIComponent('/?tenant_id=bsc');
  assert.equal(resolveTenant(`https://benmi-order.pages.dev/?liff.state=${state}`).tenant, 'bsc');
  assert.equal(resolveTenant(`https://benmi-order.pages.dev/?tenant_id=jiangjiejie&liff.state=${state}`).tenant, 'bsc');
});

test('malformed LINE callback URL recovers the appended tenant', () => {
  const result = resolveTenant('https://benmi-order.pages.dev/?tenant_id=jiangjiejie?tenant_id=bsc');
  assert.equal(result.tenant, 'bsc');
});

test('LINE callback restores only the tenant saved for the current login', () => {
  const result = resolveTenant('https://benmi-order.pages.dev/?code=abc&state=xyz', 'bsc');
  assert.equal(result.tenant, 'bsc');
  assert.equal(result.failed, false);
});

test('LINE callback can recover tenant from its nested redirect URI across origins', () => {
  const redirectUri = encodeURIComponent('https://benmi-order.pages.dev/?tenant_id=bsc');
  const result = resolveTenant(`https://benmi-order.pages.dev/?code=abc&liffRedirectUri=${redirectUri}`);
  assert.equal(result.tenant, 'bsc');
  assert.equal(result.failed, false);
});

test('LINE callback without tenant context is blocked instead of showing another store', () => {
  const result = resolveTenant('https://benmi-order.pages.dev/?code=abc&state=xyz');
  assert.equal(result.tenant, null);
  assert.equal(result.failed, true);
  assert.equal(result.classes.has('tenant-resolution-failed'), true);
});

test('ordinary root visit ignores another store in local storage', () => {
  assert.equal(resolveTenant('https://benmi-order.pages.dev/').tenant, 'benmi');
});

test('desktop LINE login keeps tenant in redirect URI and does not retry without one', async () => {
  const location = new URL('https://benmi-order.pages.dev/?tenant_id=bsc');
  const loginCalls = [];
  const initializedIds = [];
  const configRequests = [];
  const context = {
    URL,
    URLSearchParams,
    WORKER_BASE: 'https://worker.test',
    console: { log() {}, warn() {}, error() {} },
    addEventListener() {},
    location: {
      href: location.href,
      hostname: location.hostname,
      pathname: location.pathname,
      search: location.search,
      hash: location.hash
    },
    document: { title: 'Menu', getElementById() { return null; }, documentElement: { style: { setProperty() {} } } },
    sessionStorage: storage(),
    localStorage: storage({ tenant_bootstrap_bsc: JSON.stringify({ tenant: { id: 'bsc', liffId: '2011532198-9wCmvSiU' } }) }),
    storeConfig: { liffId: '2011532198-9wCmvSiU' },
    extractTenantId: () => 'bsc',
    fetch: async (url, options) => {
      configRequests.push({ url, options });
      return { ok: true, json: async () => ({ tenantId: 'bsc', liffId: '2010595300-lmVTCe1A', customerOrderDomain: 'legacy', liffEndpointUrl: 'https://benmi-order.pages.dev/?tenant_id=bsc' }) };
    },
    liff: {
      init: async ({ liffId }) => { initializedIds.push(liffId); },
      login: options => {
        loginCalls.push(options);
        throw new Error('invalid redirect URI');
      }
    }
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/client-core.js'), 'utf8'), context);
  let shownError = false;
  context.customAlert = () => { shownError = true; };
  await context.triggerDesktopLineLogin();

  assert.equal(loginCalls.length, 1);
  assert.deepEqual(initializedIds, ['2010595300-lmVTCe1A']);
  assert.equal(configRequests.length, 1);
  assert.equal(new URL(configRequests[0].url).searchParams.get('tenant_id'), 'bsc');
  assert.equal(configRequests[0].options.cache, 'no-store');
  assert.equal(new URL(loginCalls[0].redirectUri).searchParams.get('tenant_id'), 'bsc');
  assert.equal(context.sessionStorage.getItem('pending_line_login_tenant_id'), null);
  assert.equal(shownError, true);

  context.isLiffInitialized = false;
  context.liffInitPromise = null;
  context.fetch = async () => { throw new Error('config unavailable'); };
  await assert.rejects(context.ensureLiffReady(), /config unavailable/);
  assert.equal(initializedIds.length, 1, 'cached LIFF ID must not initialize when fresh config fails');
});


test('new domain path is authoritative, with slash and conflicting state blocked', () => {
  for (const suffix of ['', '/']) assert.equal(resolveTenant(`https://order.blabfood.app/bsc${suffix}`).tenant, 'bsc');
  for (const query of ['tenant_id=another', 'tenant=bsc&tenant_id=another',
    `liff.state=${encodeURIComponent('/another')}`, `liff.state=${encodeURIComponent('/?tenant_id=another')}`]) {
    const result = resolveTenant(`https://order.blabfood.app/bsc?${query}`);
    assert.equal(result.failed, true);
    assert.equal(result.tenant, null);
  }
});

function liffRuntime(url, domain, endpoint, failure = false) {
  const current = new URL(url);
  const initialized = [], cleaned = [], moved = [];
  const context = { URL, URLSearchParams, console: { log() {}, warn() {}, error() {} }, addEventListener() {},
    location: { href: current.href, hostname: current.hostname, pathname: current.pathname, search: current.search, hash: current.hash, replace: value => moved.push(value) },
    history: { replaceState: (...args) => cleaned.push(args[2]) },
    document: { title: 'Menu', getElementById() { return null; }, documentElement: { style: { setProperty() {} } } },
    sessionStorage: storage(), localStorage: storage(), extractTenantId: () => 'bsc',
    fetch: async () => { if (failure) throw new Error('D1 unavailable'); return { ok: true, json: async () => ({ tenantId: 'bsc', liffId: '12345678-abcde', customerOrderDomain: domain, liffEndpointUrl: endpoint }) }; },
    liff: { init: async options => { assert.equal(cleaned.length, 0, 'SDK parameters must remain until init completes'); initialized.push(options); } } };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/client-core.js'), 'utf8'), context);
  return { context, initialized, cleaned, moved };
}

test('active endpoint controls login while callback cleanup stays on the current origin', async () => {
  const runtime = liffRuntime('https://order.blabfood.app/bsc/?code=abc&state=xyz&mode=append&parent_order_key=secret', 'blabfood', 'https://order.blabfood.app/bsc');
  await runtime.context.ensureLiffReady();
  assert.equal(runtime.initialized.length, 1);
  assert.equal(new URL(runtime.cleaned[0]).origin, 'https://order.blabfood.app');
  assert.equal(new URL(runtime.cleaned[0]).searchParams.has('code'), false);
  const login = new URL(runtime.context.getLiffLoginRedirectUri());
  assert.equal(login.pathname, '/bsc');
  assert.equal(login.searchParams.get('mode'), 'append');
  assert.equal(login.searchParams.get('parent_order_key'), 'secret');
  assert.equal(login.searchParams.has('code'), false);
});

test('new domain callback cleanup keeps the path tenant and business parameters without tenant queries', async () => {
  for (const suffix of ['', '/']) {
    for (const tenantQuery of ['', '&tenant_id=bsc&tenant=bsc']) {
      const runtime = liffRuntime(`https://order.blabfood.app/bsc${suffix}?code=abc&state=xyz&mode=append&parent_order_key=order123&lang=vi${tenantQuery}`, 'blabfood', 'https://order.blabfood.app/bsc');
      await runtime.context.ensureLiffReady();
      assert.equal(runtime.cleaned.length, 1);
      const cleaned = new URL(runtime.cleaned[0]);
      assert.equal(cleaned.pathname, `/bsc${suffix}`);
      assert.equal(cleaned.searchParams.has('tenant_id'), false);
      assert.equal(cleaned.searchParams.has('tenant'), false);
      assert.equal(cleaned.searchParams.has('code'), false);
      assert.equal(cleaned.searchParams.get('mode'), 'append');
      assert.equal(cleaned.searchParams.get('parent_order_key'), 'order123');
      assert.equal(cleaned.searchParams.get('lang'), 'vi');
      assert.equal(resolveTenant(cleaned.href).tenant, 'bsc');
      assert.equal(new URL(runtime.context.getLiffLoginRedirectUri()).searchParams.has('tenant_id'), false);
    }
  }
});

test('legacy callback cleanup and login preserve the query tenant and edit parameters', async () => {
  for (const pathname of ['/', '/index.html']) {
    const endpoint = 'https://benmi-order.pages.dev/?tenant_id=bsc';
    const runtime = liffRuntime(`https://benmi-order.pages.dev${pathname}?code=abc&state=xyz&tenant_id=bsc&mode=edit&key=order123&lang=vi`, 'legacy', endpoint);
    await runtime.context.ensureLiffReady();
    const cleaned = new URL(runtime.cleaned[0]);
    assert.equal(cleaned.pathname, '/');
    assert.equal(cleaned.searchParams.get('tenant_id'), 'bsc');
    assert.equal(cleaned.searchParams.has('code'), false);
    assert.equal(cleaned.searchParams.get('mode'), 'edit');
    assert.equal(cleaned.searchParams.get('key'), 'order123');
    assert.equal(cleaned.searchParams.get('lang'), 'vi');
    assert.equal(resolveTenant(cleaned.href).tenant, 'bsc');
    const login = new URL(runtime.context.getLiffLoginRedirectUri());
    assert.equal(login.searchParams.get('tenant_id'), 'bsc');
    assert.equal(login.searchParams.get('key'), 'order123');
  }
});

test('normal legacy visit hands off before LIFF; a callback never changes origin', async () => {
  const normal = liffRuntime('https://order.blabfood.app/bsc?mode=edit&key=abc', 'legacy', 'https://benmi-order.pages.dev/?tenant_id=bsc');
  await normal.context.ensureLiffReady();
  assert.equal(normal.initialized.length, 0);
  assert.equal(new URL(normal.moved[0]).searchParams.get('key'), 'abc');
  const callback = liffRuntime('https://order.blabfood.app/bsc?code=abc', 'legacy', 'https://benmi-order.pages.dev/?tenant_id=bsc');
  await assert.rejects(callback.context.ensureLiffReady(), /endpoint changed/);
  assert.equal(callback.moved.length, 0);
});

test('config failure leaves callback untouched and never initializes from cached credentials', async () => {
  const runtime = liffRuntime('https://order.blabfood.app/bsc?code=abc', 'blabfood', 'https://order.blabfood.app/bsc', true);
  await assert.rejects(runtime.context.ensureLiffReady(), /D1 unavailable/);
  assert.equal(runtime.initialized.length, 0);
  assert.equal(runtime.cleaned.length, 0);
  assert.equal(runtime.moved.length, 0);
});


test('recorded legacy index.html endpoint accepts the canonical Pages root without a redirect loop', async () => {
  const runtime = liffRuntime('https://benmi-order.pages.dev/?tenant_id=bsc', 'legacy', 'https://benmi-order.pages.dev/index.html?tenant_id=bsc');
  await runtime.context.ensureLiffReady();
  assert.equal(runtime.initialized.length, 1);
  assert.equal(runtime.moved.length, 0);
  assert.equal(new URL(runtime.context.getLiffLoginRedirectUri()).pathname, '/index.html');
});
