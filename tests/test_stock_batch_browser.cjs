const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'orders.html'), 'utf8');
const screenshots = process.env.MENU_QA_ARTIFACT_DIR || path.join(root, 'artifacts/menu-qa/bulk-stock-local');

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: bulk stock selection, filters, drafts, retry and responsive layout`, async t => {
    const browser = await engine.launch({ headless: true });
    t.after(() => browser.close());
    for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      for (const lang of ['vi', 'zh-TW']) {
        const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
        page.setDefaultTimeout(4000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('http://stock.test/', route => route.fulfill({ contentType: 'text/html', body: '<!DOCTYPE html><html></html>' }));
        await page.goto('http://stock.test/');
        const panel = await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html').getElementById('menu-editor-panel').outerHTML, html);
        await page.setContent(`<!DOCTYPE html><html><body><main id="view-menu" data-mobile-view="detail"><div class="menu-layout-grid">${panel}</div></main><button id="btn-menu-save">Save</button></body></html>`);
        for (const file of ['css/orders.css', 'css/orders-menu.css', 'css/orders-stock.css', 'css/pos-session.css']) await page.addStyleTag({ path: path.join(root, file) });
        for (const file of ['js/orders-i18n.js', 'js/orders-menu-model.js', 'js/pos-session.js', 'js/orders-stock-batch.js', 'js/orders-menu.js']) await page.addScriptTag({ path: path.join(root, file) });
        await page.evaluate(lang => {
          window.WORKER_BASE = 'http://stock.test'; window.getTenantIdFromUrl = () => 'fixture';
          window.escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
          currentLang = lang; window.currentLang = lang;
          currentMenuData = [
            { id: 'meals', title: 'Meals', type: 'catalog', items: [
              { id: 'a', name: 'Chicken', originalName: 'Chicken', price: 60, isOos: false },
              { id: 'b', name: 'Beef', originalName: 'Beef', price: 80, isOos: false },
              { id: 'c', name: 'Vegetarian', originalName: 'Vegetarian', price: 50, isOos: true, outOfStockUntil: '9999-12-31T23:59:59.000Z' }
            ] },
            { id: 'drinks', title: 'Drinks', type: 'catalog', items: [{ id: 'd', name: 'Tea', price: 20, isOos: false }] }
          ];
          isMenuLoadedCompletely = true; activeCategoryIndex = 0;
          window.UnifiedMenu = { enabled: true, workspace: () => false, groupCount: () => 0, load: async () => {} };
          renderMenuCategories = () => {}; getItemImageUrl = () => '';
          clearMenuDirty(); renderMenuCategoryEditor(0);
        }, lang);
        const requests = [];
        let fail = false, hold = false, held;
        await page.route('http://stock.test/api/menu/stock-status/batch?**', async route => {
          const body = route.request().postDataJSON(); requests.push(body);
          assert.ok(route.request().headers().authorization?.startsWith('Bearer '));
          if (hold) await new Promise(resolve => { held = resolve; });
          if (fail) return route.abort();
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true,
            changed: body.item_ids.length, unchanged: 0, cache_refreshed: true,
            items: body.item_ids.map(id => ({ id, out_of_stock_until: body.status === 'in_stock' ? null : body.duration === 'indefinite' ? '9999-12-31T23:59:59.000Z' : new Date(body.until_date).toISOString() })) }) });
        });
        // Exercise the actual PIN dialog once, then keep the resulting POS token.
        await page.route('http://stock.test/api/pos/session?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 'synthetic-token-for-fixture', expiresAt: new Date(Date.now() + 3600000).toISOString() }) }));
        await page.locator('.menu-item-price-input').first().fill('65');
        await page.locator('#btn-menu-stock-select').click();
        await page.locator('.batch-stock-checkbox input').nth(0).check();
        await page.locator('#menu-item-card-0-1').click({ position: { x: 100, y: 25 } });
        assert.equal(await page.locator('.batch-stock-checkbox input:checked').count(), 2);
        assert.equal(await page.locator('#batch-stock-all').evaluate(input => input.indeterminate), true);
        assert.equal(await page.locator('#btn-menu-save').isDisabled(), true);
        await page.locator('#batch-stock-pause').click();
        assert.equal(requests.length, 0);
        await page.locator('#batch-stock-save').click();
        await page.locator('.pos-session-dialog input').fill('1234');
        await page.locator('.pos-session-dialog button[type="submit"]').click();
        await page.locator('#batchStockModal').waitFor({ state: 'detached' });
        assert.deepEqual(requests[0].item_ids.sort(), ['a', 'b']);
        assert.deepEqual(await page.evaluate(() => [currentMenuData[0].items[0].price, JSON.parse(savedMenuSnapshot)[0].items[0].price, isMenuDirty]), [65, 60, true]);
        assert.equal(await page.locator('.menu-item-stock-toggle.is-oos').count(), 3);

        await page.locator('[data-filter="oos"]').click();
        await page.locator('#batch-stock-all').check();
        await page.locator('#menu-stock-search').fill('Beef ');
        assert.equal(await page.locator('#menu-stock-search').inputValue(), 'Beef ');
        assert.equal(await page.locator('.batch-stock-checkbox input:checked').count(), 1);
        await page.locator('#batch-stock-restore').click();
        fail = true;
        await page.locator('#batch-stock-save').click();
        await page.locator('#batch-stock-error').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.batch-stock-checkbox input:checked').count(), 1);
        const failedBody = requests.at(-1);
        fail = false; hold = true;
        await page.locator('#batch-stock-save').click();
        await page.waitForFunction(() => isStockSaving);
        assert.equal(await page.locator('#batch-stock-save').isDisabled(), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#batchStockModal').count(), 1);
        await new Promise(resolve => setTimeout(resolve, 50)); held(); hold = false;
        await page.locator('#batchStockModal').waitFor({ state: 'detached' });
        assert.deepEqual(requests.at(-1), failedBody);
        assert.equal(await page.locator('.menu-catalog-row:visible').count(), 0); // restored Beef leaves the sold-out filter
        await page.locator('#menu-stock-search').fill('');
        await page.locator('[data-filter="all"]').click();
        await page.locator('#batch-stock-all').check();
        await page.locator('#batch-stock-pause').click();
        await page.locator('input[value="multiple_days"]').check();
        assert.equal(await page.locator('#batch-stock-save').isDisabled(), true);
        await page.locator('#batch-stock-date').fill('2099-12-01');
        assert.equal(await page.locator('#batch-stock-save').isEnabled(), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#batch-stock-pause').evaluate(node => node === document.activeElement), true);

        // Layout: all primary hit regions are 48px, no horizontal overflow.
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          row: document.querySelector('.menu-catalog-row').getBoundingClientRect().toJSON(),
          selection: document.querySelector('.batch-stock-checkbox').getBoundingClientRect().toJSON(),
          checkbox: document.querySelector('.batch-stock-checkbox').getBoundingClientRect().height,
          action: document.querySelector('#batch-stock-pause').getBoundingClientRect().height
        }));
        assert.equal(layout.overflow, false); assert.ok(layout.checkbox >= 48); assert.ok(layout.action >= 48);
        assert.ok(layout.selection.x >= layout.row.x && layout.selection.x < layout.row.x + 65, JSON.stringify(layout));
        for (const button of await page.locator('#menu-editor-toolbar .menu-filter-pill').all()) assert.ok((await button.boundingBox()).height >= 48);
        if (name === 'webkit' && lang === 'vi') {
          fs.mkdirSync(screenshots, { recursive: true });
          await page.screenshot({ path: path.join(screenshots, `selection-${viewport.width}.png`), fullPage: true });
        }
        await page.evaluate(() => { activeCategoryIndex = 1; renderMenuCategoryEditor(1); });
        assert.equal(await page.evaluate(() => MenuStockBatch.active), false);
        assert.equal(await page.locator('#btn-menu-save').isEnabled(), true);
        if (viewport.width === 1024 && lang === 'vi') {
          await page.evaluate(() => {
            currentMenuData[1].items.push({ name: 'Unsaved', price: 1, isOos: false });
            renderMenuCategoryEditor(1);
          });
          await page.locator('#btn-menu-stock-select').click();
          assert.equal(await page.locator('.batch-stock-checkbox input').last().isDisabled(), true);
          await page.locator('#batch-stock-all').check();
          assert.equal(await page.locator('.batch-stock-checkbox input:checked').count(), 1);
          await page.evaluate(() => {
            currentMenuData[1].items = Array.from({ length: 101 }, (_, i) => ({ id: `many-${i}`, name: `Meal ${i}`, price: 1, isOos: false }));
            clearMenuDirty(); renderMenuCategoryEditor(1);
          });
          assert.equal(await page.locator('#batch-stock-all').isDisabled(), true);
          await page.locator('#menu-stock-search').fill('Meal 100');
          assert.equal(await page.locator('#batch-stock-all').isEnabled(), true);
        }
        assert.deepEqual(errors, []);
        await page.close();
      }
    }
  });
}
