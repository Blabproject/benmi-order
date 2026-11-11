const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const distRoot = path.join(root, 'dist');
function ensureDistBuilt() {
  if (!fs.existsSync(path.join(distRoot, '.vite/manifest.json')) || !fs.existsSync(path.join(distRoot, 'orders.html'))) {
    execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.config.mts'], { cwd: root, stdio: 'inherit' });
  }
}
const read = file => fs.readFileSync(path.join(distRoot, file), 'utf8');

async function setup(page) {
  ensureDistBuilt();
  const requests = [];
  let change = route => route.fulfill({ json: { ok: true } });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/change') {
      requests.push({ url, method: route.request().method(), body: route.request().postDataJSON() });
      return change(route);
    }
    if (url.pathname === '/orders.html') {
      // Keep real asset order and markup; isolate startup polling and API calls.
      return route.fulfill({ contentType: 'text/html', body: read('orders.html')
        .replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '') });
    }
    if (/^\/(js|css|assets)\/[\w.-]+$/.test(url.pathname)) {
      const rel = url.pathname.slice(1);
      const contentType = rel.endsWith('.css') ? 'text/css' : rel.endsWith('.png') ? 'image/png' : 'application/javascript';
      return route.fulfill({ body: fs.readFileSync(path.join(distRoot, rel)),
        contentType, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    return route.fulfill({ json: {} });
  });
  await page.addInitScript(() => {
    window.setInterval = () => 0;
    window.confirm = () => true;
    localStorage.setItem('pos_device_tenant_id', 'fixture');
    sessionStorage.setItem('staff_session_token_fixture', 'old-session');
    sessionStorage.setItem('staff_session_token_other', 'other-session');
  });
  await page.goto('http://pos.test/orders.html?tenant=fixture');
  await page.evaluate(() => { initSidebarState(); switchTab('settings'); switchSettingTab('store-pairing'); setLanguage('vi'); });
  return { requests, respond: handler => { change = handler; } };
}

async function fill(page, current = 'Legacy PIN', next = '00123456', confirmation = next) {
  await page.fill('#store-pin-current', current);
  await page.fill('#store-pin-new', next);
  await page.fill('#store-pin-confirm', confirmation);
}

async function feedback(page, key) {
  await page.waitForFunction(key => document.querySelector('#store-pin-feedback').textContent === t(key), key);
}

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: PIN form layout, translations, validation, requests and cleanup`, async t => {
    const browser = await engine.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const f = await setup(page);

    for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 600 }]) {
      await page.setViewportSize(viewport);
      for (const locale of ['vi', 'zh-TW']) {
        await page.evaluate(locale => setLanguage(locale), locale);
        assert.equal(await page.locator('.store-pin-title').innerText(), locale === 'vi' ? 'Đổi mã PIN quản lý' : '變更管理 PIN 碼');
        const layout = await page.locator('#store-pin-form').evaluate(form => ({
          overflow: form.scrollWidth > form.clientWidth + 1,
          targets: [...form.querySelectorAll('input,button')].filter(el => el.getClientRects().length).map(el => ({
            id: el.id || el.textContent, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height
          })),
          labels: [...form.querySelectorAll('[data-store-pin-i18n]')].every(el => el.textContent === t(el.dataset.storePinI18n))
        }));
        assert.equal(layout.overflow, false, `${name}/${viewport.width}/${locale}: form overflow`);
        assert(layout.targets.every(rect => rect.width >= 47.9 && rect.height >= 47.9),
          `${name}/${viewport.width}/${locale}: 48px touch targets: ${JSON.stringify(layout.targets)}`);
        assert(layout.labels);
        if (process.env.STORE_PIN_SCREENSHOT_DIR) {
          fs.mkdirSync(process.env.STORE_PIN_SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.STORE_PIN_SCREENSHOT_DIR, `${name}-${viewport.width}-${locale}.png`), fullPage: true });
        }
      }
    }
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.evaluate(() => setLanguage('vi'));

    await page.click('#store-pin-submit');
    await feedback(page, 'pinRequired');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'store-pin-current');
    await fill(page, 'Legacy PIN', '12ab');
    await page.click('#store-pin-submit');
    await feedback(page, 'pinInvalidFormat');
    assert.equal(await page.locator('#store-pin-new').getAttribute('aria-invalid'), 'true');
    await fill(page, 'Legacy PIN', '0123', '0124');
    await page.click('#store-pin-submit');
    await feedback(page, 'pinMismatch');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'store-pin-confirm');
    assert.equal(f.requests.length, 0, 'Client validation prevents invalid requests');

    await page.click('[data-store-pin-toggle="store-pin-current"]');
    assert.equal(await page.locator('#store-pin-current').getAttribute('type'), 'text');
    await page.evaluate(() => setLanguage('zh-TW'));
    assert.equal(await page.locator('[data-store-pin-toggle="store-pin-current"]').innerText(), '隱藏');
    await feedback(page, 'pinMismatch');
    await page.click('[data-store-pin-i18n="pinClear"]');
    assert.equal(await page.inputValue('#store-pin-current'), '');
    assert.equal(await page.locator('#store-pin-current').getAttribute('type'), 'password');
    assert.equal(await page.locator('#store-pin-feedback').innerText(), '');

    f.respond(route => route.fulfill({ status: 401, json: { ok: false, error: 'Wrong current password' } }));
    await fill(page);
    await page.click('#store-pin-submit');
    await feedback(page, 'pinWrongCurrent');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'store-pin-current');
    assert.equal(await page.inputValue('#store-pin-new'), '00123456');

    f.respond(route => route.fulfill({ status: 503, json: { ok: false, error: 'PIN_STORAGE_UNAVAILABLE' } }));
    await page.click('#store-pin-submit');
    await feedback(page, 'pinSaveError');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('staff_session_token_fixture')), 'old-session');
    f.respond(route => route.abort());
    await page.click('#store-pin-submit');
    await feedback(page, 'pinNetworkError');
    assert.equal(await page.locator('#store-pin-submit').isEnabled(), true);

    let release, started;
    const requestStarted = new Promise(resolve => { started = resolve; });
    f.respond(route => new Promise(resolve => {
      release = async () => { await route.fulfill({ json: { ok: true } }); resolve(); };
      started();
    }));
    const count = f.requests.length;
    await page.evaluate(() => { submitStorePinChange(); submitStorePinChange(); });
    await page.waitForFunction(() => document.querySelector('#store-pin-submit').disabled);
    await requestStarted;
    assert.equal(f.requests.length, count + 1);
    assert.equal(await page.locator('#store-pin-submit').innerText(), '正在儲存…');
    await release();
    await feedback(page, 'pinChangeSuccess');
    assert.equal(await page.inputValue('#store-pin-new'), '');
    assert.equal(await page.locator('#store-pin-current').getAttribute('type'), 'password');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('staff_session_token_fixture')), null);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('staff_session_token_other')), 'other-session');
    assert.equal(await page.evaluate(() => localStorage.getItem('pos_device_tenant_id')), 'fixture');
    assert.deepEqual(f.requests.at(-1).body, { current: 'Legacy PIN', newPassword: '00123456', tenant_id: 'fixture' });
    assert.equal(f.requests.at(-1).method, 'POST');
    assert.deepEqual([...f.requests.at(-1).url.searchParams], [['tenant_id', 'fixture']]);

    let finishHiddenRequest, hiddenRequestStarted;
    const hiddenStarted = new Promise(resolve => { hiddenRequestStarted = resolve; });
    f.respond(route => new Promise(resolve => {
      finishHiddenRequest = async () => { await route.fulfill({ json: { ok: true } }); resolve(); };
      hiddenRequestStarted();
    }));
    await fill(page);
    await page.evaluate(() => { submitStorePinChange(); });
    await hiddenStarted;
    await page.evaluate(() => switchSettingTab('status'));
    assert.equal(await page.inputValue('#store-pin-new'), '');
    await finishHiddenRequest();
    await page.waitForFunction(() => !document.querySelector('#store-pin-submit').disabled);
    assert.equal(await page.locator('#store-pin-feedback').innerText(), '', 'A completed hidden request cannot restore stale feedback');
    await page.evaluate(() => switchSettingTab('store-pairing'));
    await fill(page);
    await page.evaluate(() => switchTab('live'));
    assert.equal(await page.inputValue('#store-pin-current'), '');
    await page.evaluate(() => { switchTab('settings'); switchSettingTab('store-pairing'); });
    await fill(page);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    assert.equal(await page.inputValue('#store-pin-current'), '');
    assert.deepEqual(errors, []);
  });
}
