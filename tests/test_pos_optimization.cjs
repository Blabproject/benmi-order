const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/duc.cao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { modelCode, menuCode } = require('./helpers/menu-editor-loader.cjs');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.route('**/*', route => route.fulfill({ body: '<html></html>', contentType: 'text/html' }));
    await page.goto('http://pos.test');
    let html = fs.readFileSync(path.join(root, 'orders.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
    await page.setContent(html);
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'css/orders.css'), 'utf8') });
    await page.evaluate(() => {
      window.currentLang = 'zh-TW'; window.activeTab = 'menu'; window.WORKER_BASE = 'http://pos.test';
      window.t = key => key;
      window.getTenantIdFromUrl = () => 'fixture';
      window.alert = message => { window.lastAlert = message; };
      window.confirm = () => true;
    });
    for (const file of ['js/order-legacy-adapter.js', 'js/printer-service.js', 'js/orders-settings.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root, file), 'utf8') });
    await page.addScriptTag({ content: modelCode });
    await page.addScriptTag({ content: menuCode });
    const printing = await page.evaluate(() => {
      window.currentTenantBrandName = '小巷餐廳';
      const order = { key: 'K0909-001', customer: '王小姐', time: '2026-09-09 12:30', total: 180,
        items: [{ item_name: '招牌特餐', quantity: 2, unit_price: 65, selected_options: '[{"choice":"大辣"}]' }, { name: '鮮奶茶', quantity: 1, price: 50 }] };
      const result = {};
      for (const width of [58, 80]) result['bill-' + width] = PrinterService.drawReceiptToCanvas(order, false, width);
      for (const dpi of [203, 300]) result['sticker-' + dpi] = PrinterService.drawItemStickerToCanvas({ name: '鮮奶茶', quantity: 1, options: '少冰、半糖' }, order, 1, 2, 40, 30, dpi);
      return result;
    });
    for (const [name, data] of Object.entries(printing)) fs.writeFileSync('/private/tmp/pos-' + name + '.png', Buffer.from(data.split(',')[1], 'base64'));
    await page.evaluate(() => {
      document.querySelectorAll('.content').forEach(el => el.style.display = 'none');
      document.getElementById('view-menu').style.display = 'block';
    });
    await page.locator('#menu-help-toggle').click();
    assert(await page.locator('.menu-editor-title-group details').getAttribute('open') !== null);
    await page.locator('#menu-editor-title').click();
    assert.equal(await page.locator('.menu-editor-title-group details').getAttribute('open'), null);
    const menu = await page.evaluate(async () => {
      renderMenuCategories = () => {}; renderMenuCategoryEditor = () => {}; syncMenuDataFromDOM = () => {};
      const saved = [{ id: 'a', title: 'A', items: [{ name: 'original', price: 10 }] }, { id: 'b', title: 'B', items: [] }];
      currentMenuData = structuredClone(saved); clearMenuDirty();
      currentMenuData[0].items[0].name = 'unsaved'; markMenuDirty();
      let body;
      window.fetch = async (_, options) => { body = JSON.parse(options.body); return { ok: true }; };
      await deleteCategoryAtIndex(1);
      const deletion = !body.b && body.a.original && !body.a.unsaved && isMenuDirty;
      confirmLeaveMenu();
      return { deletion: !!deletion, remaining: currentMenuData, dirty: isMenuDirty };
    });
    assert(menu.deletion); assert.equal(menu.remaining[0].items[0].name, 'original'); assert.equal(menu.dirty, false);
    const saved = await page.evaluate(() => { updateSettingsPrinterStatusDisplay = () => {}; savePOSPrinterSettings(); return document.getElementById('printer-save-status').dataset.state; });
    assert.equal(saved, 'saved');
    await page.evaluate(() => document.getElementById('changeModal').style.display = 'flex');
    for (const height of [768, 600]) {
      await page.setViewportSize({ width: 1024, height });
      const rect = await page.locator('#btn-change-send').boundingBox();
      assert(rect.y >= 0 && rect.y + rect.height <= height, 'Change action offscreen');
    }
    await page.screenshot({ path: '/private/tmp/pos-change-dialog.png' });
    console.log('PASS: receipt/sticker renders, help dismissal, deletion excludes drafts, discard, printer save, change action visible at 1024x768 and 1024x600');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
