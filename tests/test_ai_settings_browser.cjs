const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const { fixture } = require('./helpers/ai-settings.cjs');
const root = path.resolve(__dirname, '..');

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: AI settings save, restore failures, retain switches and explain behavior in both languages`, async t => {
    const f = fixture(); t.after(() => f.db.close());
    const browser = await engine.launch({ headless: true }); t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    page.setDefaultTimeout(8000);
    const errors = [], writes = [];
    let failSave = false, failLoad = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname === '/orders.html') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(root, 'orders.html'), 'utf8').replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '') });
      if (/^\/(js|css)\/[\w.-]+$/.test(url.pathname)) return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(path.join(root, url.pathname.slice(1)), 'utf8') });
      if (url.pathname === '/api/config') {
        if ((request.method() === 'POST' && failSave) || (request.method() === 'GET' && failLoad)) return route.fulfill({ status: 503, json: { error: 'Offline' } });
        const body = request.method() === 'POST' ? request.postDataJSON() : null;
        if (body) writes.push(body);
        const response = body ? await f.save(body) : await f.get();
        return route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto('https://pos.test/orders.html?tenant=a&env=dev');
    await page.evaluate(() => { initSidebarState(); setLanguage('vi'); openSettings(); switchSettingTab('setting-card-ai'); });
    const master = page.locator('#ai-setting-enabled'), address = page.locator('#ai-setting-address');
    await master.waitFor({ state: 'visible' });
    await page.waitForFunction(() => !posAISettings.busy && posAISettings.values);
    assert.equal(await master.isChecked(), true);
    assert.equal(await page.locator('#ai-settings-retry').isVisible(), false);
    await page.locator('label[for="ai-setting-address"]').click();
    await page.waitForFunction(() => posAISettings.status === 'aiSaved');
    assert.equal(await address.isChecked(), false);
    assert.deepEqual(writes[0], { aiSettings: { address: false } });
    await page.locator('label[for="ai-setting-enabled"]').click();
    await page.waitForFunction(() => posAISettings.status === 'aiSaved');
    assert.equal(await address.isDisabled(), true);
    assert.equal(await address.isChecked(), false);
    await page.locator('label[for="ai-setting-enabled"]').click();
    await page.waitForFunction(() => posAISettings.status === 'aiSaved');
    assert.equal(await address.isChecked(), false);
    failSave = true;
    await page.locator('label[for="ai-setting-address"]').click();
    await page.waitForFunction(() => posAISettings.status === 'aiSaveError');
    assert.equal(await address.isChecked(), false);
    assert.equal(await address.isDisabled(), false);
    failSave = false;
    await page.evaluate(() => loadAISettings());
    assert.equal(await address.isChecked(), false);
    failLoad = true;
    await page.evaluate(() => loadAISettings());
    assert.equal(await master.isDisabled(), true);
    assert.equal(await page.locator('#ai-settings-retry').isVisible(), true);
    failLoad = false;
    await page.click('#ai-settings-retry');
    await page.waitForFunction(() => !posAISettings.busy && posAISettings.values);
    await page.locator('.ai-guide summary').click();
    for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      for (const lang of ['vi', 'zh-TW']) {
        await page.evaluate(lang => setLanguage(lang), lang);
        await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
        assert.equal(await page.locator('#i18n-settings-title').innerText(), lang === 'vi' ? 'Cài đặt AI' : 'AI 設定');
        const layout = await page.locator('#setting-card-ai').evaluate(el => ({
          overflow: el.scrollWidth > el.clientWidth + 1,
          translated: [...el.querySelectorAll('[data-ai-i18n]')].every(el => el.textContent === t(el.dataset.aiI18n)),
          switches: [...el.querySelectorAll('[role="switch"]')].map(el => { const box = el.getBoundingClientRect(); return { width: box.width, height: box.height, label: el.getAttribute('aria-labelledby') }; })
        }));
        assert.equal(layout.overflow, false, `${name}/${viewport.width}/${lang}: overflow`);
        assert.equal(layout.translated, true);
        assert(layout.switches.every(box => box.width >= 48 && box.height >= 48 && box.label), JSON.stringify(layout.switches));
        if (process.env.AI_SETTINGS_SCREENSHOT_DIR) {
          fs.mkdirSync(process.env.AI_SETTINGS_SCREENSHOT_DIR, { recursive: true });
          await page.locator('.ai-settings-heading').scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(process.env.AI_SETTINGS_SCREENSHOT_DIR, `${name}-${viewport.width}-${lang}.png`) });
          await page.locator('.ai-guide').scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(process.env.AI_SETTINGS_SCREENSHOT_DIR, `${name}-${viewport.width}-${lang}-guide.png`) });
        }
      }
    }
    assert.deepEqual(errors, []);
  });
}
