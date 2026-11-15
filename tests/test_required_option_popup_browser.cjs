const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const chromium = require(process.env.PLAYWRIGHT_MODULE || 'playwright')[process.env.MENU_QA_BROWSER || 'chromium'];
const root = path.resolve(__dirname, '..');
const phase = process.env.OPTION_REQUIRED_PHASE || 'after';
const artifacts = process.env.OPTION_REQUIRED_ARTIFACT_DIR;
const sourceRef = process.env.OPTION_REQUIRED_SOURCE_REF;
const source = file => sourceRef
  ? execFileSync('git', ['show', `${sourceRef}:${file}`], { cwd: root, encoding: 'utf8' })
  : fs.readFileSync(path.join(root, file), 'utf8');
async function shot(page, name) {
  if (!artifacts) return;
  fs.mkdirSync(artifacts, { recursive: true });
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)));
  await page.screenshot({ path: path.join(artifacts, `${phase}-${name}.png`), fullPage: true });
}
async function pageFor(browser, lang, viewport) {
  const page = await browser.newPage({ viewport, hasTouch: true });
  page.setDefaultTimeout(5000);
  await page.route('https://menu.test/**', route => route.fulfill({ body: '<!doctype html><html><body></body></html>', contentType: 'text/html' }));
  await page.goto('https://menu.test/');
  await page.evaluate(lang => { document.documentElement.lang = lang; }, lang);
  return page;
}

test('required toggle alone controls POS saving and mobile option popup behavior', async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  try {
    for (const lang of ['vi', 'zh-TW']) {
      const pos = await pageFor(browser, lang, { width: 1024, height: 900 });
      const errors = [];
      pos.on('pageerror', error => errors.push(error.message));
      for (const file of ['css/orders.css', 'css/orders-menu.css']) await pos.addStyleTag({ content: source(file) });
      await pos.evaluate(lang => {
        window.I18N = { vi: {}, 'zh-TW': {} }; window.currentLang = lang;
        window.WORKER_BASE = 'https://worker.test'; window.getTenantIdFromUrl = () => 'test';
        window.currentMenuData = []; window.savedMenuSnapshot = '[]';
        window.renderMenuCategories = window.renderMenuCategoryEditor = window.checkMenuDirty = () => {};
        window.t = (key, args) => (I18N[currentLang][key] || key).replace(/\{(\w+)\}/g, (_, name) => args?.[name] ?? '');
        window.posts = [];
        window.testCatalog = { products: [], categories: [], groups: [], links: [], categoryLinks: [] };
        window.fetch = async (url, init) => {
          if (init) {
            const payload = JSON.parse(init.body); posts.push(payload);
            testCatalog.groups = [{ ...payload, revision: posts.length }];
          }
          return { ok: true, json: async () => init ? { catalog: structuredClone(testCatalog) } : structuredClone(testCatalog) };
        };
      }, lang);
      await pos.addScriptTag({ content: source('js/orders-option-groups.js') });
      await pos.evaluate(async () => { await UnifiedMenu.load(); UnifiedMenu.group(); });
      await pos.locator('[data-action="select-new-scope"][data-scope="item"]').click();
      await pos.locator('[data-field="name"]').fill(lang === 'vi' ? 'Chọn món ăn kèm' : '配餐選擇');
      await pos.locator('[data-action="add-option"]').click();
      await pos.locator('[data-action="custom"]').click();
      await pos.locator('[data-field="option.name"]').fill(lang === 'vi' ? 'Thêm trứng' : '加蛋');
      await pos.locator('[data-field="option.price"]').fill('5');
      await pos.locator('[data-action="apply"]').click();
      assert.equal(await pos.locator('[data-field="required"]').isChecked(), false);
      assert.equal(await pos.locator('[data-field="autoPopup"]').count(), phase === 'before' ? 1 : 0);
      await shot(pos, `pos-${lang}`);
      if (phase !== 'before') {
        // Native pointer, label and keyboard events must all retain their state after rerender.
        await pos.locator('[data-field="required"]').click();
        assert.equal(await pos.locator('[data-field="minSelection"]').inputValue(), '1');
        await pos.locator('label[for="ug-required"]').click();
        assert.equal(await pos.locator('[data-field="required"]').isChecked(), false);
        await pos.locator('[data-field="required"]').focus();
        await pos.keyboard.press('Space');
        assert.equal(await pos.locator('[data-field="required"]').isChecked(), true);
        await pos.locator('[data-action="save"]').click();
        assert.equal(await pos.evaluate(() => posts[0].minSelection), 1);
        assert.equal(await pos.evaluate(() => posts[0].autoPopup), true);
        await pos.evaluate(() => UnifiedMenu.group(testCatalog.groups[0].id));
        assert.equal(await pos.locator('[data-field="required"]').isChecked(), true);
        await pos.locator('[data-field="required"]').click();
        await pos.locator('[data-action="save"]').click();
        assert.equal(await pos.evaluate(() => posts[1].minSelection), 0);
        assert.equal(await pos.evaluate(() => posts[1].autoPopup), false);
        await pos.evaluate(() => UnifiedMenu.group(testCatalog.groups[0].id));
        assert.equal(await pos.locator('[data-field="required"]').isChecked(), false);
      }
      assert.deepEqual(errors, []);
      await pos.close();

      const page = await pageFor(browser, lang, { width: 390, height: 844 });
      page.on('pageerror', error => errors.push(error.message));
      await page.evaluate(() => { document.body.innerHTML = '<main style="padding:20px"><h1 id="menu-heading"></h1><div id="catalog"></div><p><span id="total-label"></span>: $<span id="total-price">0</span></p></main>'; });
      for (const file of ['index.css', 'css/client-option-groups.css']) await page.addStyleTag({ content: source(file) });
      for (const file of ['js/client-core.js', 'js/client-menu.js', 'js/client-customizations.js', 'js/client-cart.js', 'js/bundle-builder-v2.js', 'js/client-option-groups.js', 'js/client-checkout.js'])
        await page.addScriptTag({ content: source(file) });
      await page.evaluate(lang => {
        window.currentLocale = lang; window.checkDesktopAuthGuard = () => true;
        window.updateFooterButtonState = () => {}; window.cart = {}; window.customizeData = {}; window.bundleCartData = {};
        const item = { id: 'meal', name: lang === 'vi' ? 'Cơm gà' : '雞肉飯', price: 100, bundleRule: {
          version: 3, autoPopup: true, groups: [{ id: 'sides', name: lang === 'vi' ? 'Chọn món ăn kèm' : '配餐選擇',
            minSelection: 0, maxSelection: 1, autoPopup: true, eligibleItems: [{ id: 'egg', name: lang === 'vi' ? 'Thêm trứng' : '加蛋', price: 5 }] }],
        } };
        window.bootstrapData = { unifiedMenu: true, catalog: [{ slug: 'food', name: 'Food', items: [item] }] };
        document.getElementById('menu-heading').textContent = lang === 'vi' ? 'Thực đơn' : '菜單';
        document.getElementById('total-label').textContent = lang === 'vi' ? 'Tổng tiền' : '總計';
        document.getElementById('catalog').appendChild(createDynamicItemCard('food', item));
      }, lang);
      await page.locator('.card-main').click();
      if (phase === 'before') {
        await page.locator('#unified-option-modal').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => Object.values(cart)[0] || 0), 0);
        await shot(page, `liff-${lang}`);
      } else {
        assert.equal(await page.locator('#unified-option-modal:visible').count(), 0);
        assert.equal(await page.evaluate(() => Object.values(cart)[0]), 1);
        assert.equal(await page.locator('.bundle-edit-btn').isVisible(), true);
        assert.equal(await page.locator('.bundle-edit-btn').textContent().then(s => s.trim()), lang === 'vi' ? 'Tuỳ chọn' : '選項');
        await shot(page, `liff-${lang}`);
        await page.locator('.bundle-edit-btn').click();
        await page.locator('[data-choose="0"][data-option="0"]').click();
        await page.locator('[data-confirm]').click();
        assert.equal(await page.evaluate(() => updateTotal()), 105);
        assert.equal(await page.evaluate(() => buildStructuredCartItems()[0].subtotal), 105);
        await page.locator('.btn-qty').last().click();
        assert.equal(await page.evaluate(() => Object.values(cart)[0]), 2);
        assert.equal(await page.evaluate(() => Object.values(bundleCartData)[0][1].groups[0].items.length), 0);
        await page.evaluate(() => {
          const state = JSON.parse(JSON.stringify({ cart, customizeData, bundleCartData }));
          window.cart = state.cart; window.customizeData = state.customizeData; window.bundleCartData = state.bundleCartData;
          bootstrapData.catalog[0].items[0].bundleRule.groups[0].minSelection = 1;
          bootstrapData.catalog[0].items[0].bundleRule.autoPopup = false;
        });
        // Both entry points use required groups even when the cached flag contradicts them.
        await page.locator('.btn-qty').last().click();
        await page.locator('#unified-option-modal').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => Object.values(cart)[0]), 2);
        await shot(page, `liff-required-${lang}`);
        await page.locator('[data-close]').click();
        await page.locator('.card-main').click();
        await page.locator('#unified-option-modal').waitFor({ state: 'visible' });
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
