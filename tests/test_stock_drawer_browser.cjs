const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const root = path.resolve(__dirname, '..');
const orders = fs.readFileSync(path.join(root, 'orders.html'), 'utf8');
const drawer = orders.slice(orders.indexOf('  <!-- Stock actions'), orders.indexOf('  <!-- Modal Thiết Lập Combo'));
const output = process.env.STOCK_SCREENSHOT_DIR || path.join(root, 'artifacts/stock-drawer-local-20261107');

const engines = { chromium, webkit };
const browserNames = process.env.MENU_QA_BROWSER ? [process.env.MENU_QA_BROWSER] : Object.keys(engines);
for (const name of browserNames) {
  const engine = engines[name];
  test(`${name}: stock drawer quick actions, dates, errors and keyboard on tablet and phone`, async t => {
    const browser = await engine.launch({ headless: true });
    t.after(() => browser.close());
    fs.mkdirSync(output, { recursive: true });
    for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      for (const lang of ['vi', 'zh-TW']) {
        const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
        page.setDefaultTimeout(5000);
        const errors = [], requests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => { errors.push(dialog.message()); void dialog.dismiss(); });
        await page.route('http://stock.test/', route => route.fulfill({ contentType: 'text/html', body: '<!DOCTYPE html><html></html>' }));
        await page.goto('http://stock.test/');
        await page.setContent(`<!DOCTYPE html><html><body><main style="padding:32px">
          <h1>BLAB Demo</h1><button id="menu-item-stock-0-0" onclick="openStockModal(0,0)">雞胸肉</button>
          <button id="menu-option-stock-1-0-0" onclick="openStockModalForCustomization(1,0,0)">小辣</button>
          <div id="menu-editor-body"></div></main>${drawer}</body></html>`);
        for (const file of ['css/orders.css', 'css/orders-stock.css']) await page.addStyleTag({ path: path.join(root, file) });
        for (const file of ['js/orders-i18n.js', 'js/orders-menu-model.js', 'js/orders-menu.js']) {
          await page.addScriptTag({ path: path.join(root, file) });
        }
        await page.evaluate(lang => {
          window.WORKER_BASE = 'http://stock.test';
          window.getTenantIdFromUrl = () => 'stock_fixture';
          currentLang = lang;window.currentLang = lang;
          currentMenuData = [
            { id: 'food', type: 'catalog', title: 'Food', items: [{ id: 'meal', name: '雞胸肉', originalName: '雞胸肉', price: 60, isOos: false }] },
            { id: 'flavor', type: 'modifier', groups: [{ id: 'spice', key: 'spice', title: '辣度', options: [{ id: 'mild', name: '小辣', isOos: false }] }] }
          ];
          isMenuLoadedCompletely = true;
          // Isolate the real stock component from unrelated menu layout controllers.
          renderMenuCategories = () => {};
          renderMenuCategoryEditor = () => {};
          renderOrderCustomizationEditor = () => {};
          clearMenuDirty();
          applyLanguageToDOM();
        }, lang);
        let fail = false, pending = null;
        await page.route('http://stock.test/api/menu/stock-status?**', async route => {
          requests.push(route.request().postDataJSON());
          if (pending) await pending;
          await route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(fail ? { error: 'Unavailable' } : { success: true }) });
        });
        const visible = selector => page.locator(selector).isVisible();
        const waitClosed = () => page.waitForFunction(() => document.getElementById('stockModal').style.display === 'none');

        await page.click('#menu-item-stock-0-0');
        assert.equal(await visible('#stock-linked-notice'), false);
        assert.equal(await visible('#btn-stock-save'), false);
        const box = await page.locator('.stock-drawer-panel').boundingBox();
        assert.equal(Math.round(box.x + box.width), viewport.width);
        assert.equal(box.height, viewport.height);
        assert.equal(await page.locator('.stock-choice').count(), 3);
        for (const row of await page.locator('.stock-choice').all()) assert((await row.boundingBox()).height >= 48);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(output, `${name}-${viewport.width}-${lang}.png`) });
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-stock-cancel');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-stock-close');

        // Opening + choosing is the entire quick-pause workflow.
        await page.click('label:has(#stock-choice-today)');await waitClosed();
        assert.equal(requests.length, 1);assert.equal(requests[0].duration, 'today');
        assert.equal(requests[0].status, 'out_of_stock');assert.equal(requests[0].until_date, null);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'menu-item-stock-0-0');
        await page.click('#menu-item-stock-0-0');
        assert.equal(await page.locator('#stock-choice-today').isChecked(), true);
        await page.click('#btn-stock-restore');await waitClosed();
        assert.equal(requests.at(-1).status, 'in_stock');

        await page.click('#menu-option-stock-1-0-0');
        assert.equal(await visible('#stock-linked-notice'), true);
        await page.click('label:has(#stock-choice-multiple_days)');
        assert.equal(requests.length, 2, 'Selecting a date duration does not write yet');
        assert.equal(await page.locator('#btn-stock-save').isDisabled(), true);
        const min = await page.locator('#oos-until-date').getAttribute('min');
        await page.locator('#oos-until-date').fill(min);
        assert.equal(await page.locator('#btn-stock-save').isEnabled(), true);
        await page.screenshot({ path: path.join(output, `${name}-${viewport.width}-${lang}-date.png`) });
        await page.click('#btn-stock-save');await waitClosed();
        assert.equal(requests.length, 3);assert.equal(requests.at(-1).customization_key, 'spice');
        assert.equal(requests.at(-1).until_date, min + 'T04:00:00+07:00');
        await page.click('#menu-option-stock-1-0-0');
        assert.equal(await page.locator('#stock-choice-multiple_days').isChecked(), true);
        assert.equal(await page.locator('#oos-until-date').inputValue(), min);
        await page.click('#btn-stock-cancel');await waitClosed();
        assert.equal(requests.length, 3, 'Reopening a saved date does not write');

        // A failed instant write stays visible and can be retried without reopening.
        fail = true;
        await page.click('#menu-item-stock-0-0');
        await page.click('label:has(#stock-choice-indefinite)');
        await page.locator('#stock-drawer-error').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => currentMenuData[0].items[0].isOos), false);
        assert.equal(await visible('#btn-stock-save'), true);
        fail = false;
        await page.click('#btn-stock-save');await waitClosed();
        assert.equal(requests.at(-1).duration, 'indefinite');
        assert.equal(await page.evaluate(() => currentMenuData[0].items[0].isOos), true);

        let finish;
        pending = new Promise(resolve => { finish = resolve; });
        await page.click('#menu-item-stock-0-0');
        assert.equal(await page.locator('#stock-choice-indefinite').isChecked(), true);
        await page.click('#btn-stock-restore');
        await page.waitForFunction(() => document.getElementById('stockModal').getAttribute('aria-busy') === 'true');
        assert.equal(await page.locator('#btn-stock-close').isDisabled(), true);
        assert.equal(await page.locator('#stock-choice-today').isDisabled(), true);
        await page.keyboard.press('Escape');
        assert.equal(await visible('#stockModal'), true);
        finish();await waitClosed();pending = null;
        assert.equal(await page.evaluate(() => isMenuDirty), false);
        assert.equal(requests.length, 6);
        assert(requests.every(r => r.name === '雞胸肉' || r.name === '小辣'));

        await page.click('#menu-item-stock-0-0');
        await page.keyboard.press('Escape');await waitClosed();
        assert.equal(requests.length, 6, 'Dismissing does not save');
        assert.deepEqual(errors, []);
        await page.close();
      }
    }
  });
}
