const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const chromium = require(process.env.PLAYWRIGHT_MODULE || 'playwright')[process.env.MENU_QA_BROWSER || 'chromium'];
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const distRoot = path.join(root, 'dist');
function ensureDistBuilt() {
  if (!fs.existsSync(path.join(distRoot, '.vite/manifest.json')) || !fs.existsSync(path.join(distRoot, 'orders.html'))) {
    execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.config.mts'], { cwd: root, stdio: 'inherit' });
  }
}
const read = file => fs.readFileSync(path.join(distRoot, file), 'utf8');
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined }); });
after(async () => { await browser?.close(); });

async function fixture(page, lang) {
  ensureDistBuilt();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/orders.html')
      return route.fulfill({ body: read('orders.html').replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, ''), contentType: 'text/html' });
    if (/^\/(js|css|assets)\/[\w.-]+$/.test(url.pathname)) {
      const rel = url.pathname.slice(1);
      return route.fulfill({ body: fs.readFileSync(path.join(distRoot, rel)), contentType: rel.endsWith('.css') ? 'text/css' : rel.endsWith('.png') ? 'image/png' : 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    return route.fulfill({ body: '{}', contentType: 'application/json' });
  });
  await page.addInitScript(lang => {
    localStorage.setItem('benmi_lang', lang);
    window.setInterval = () => 0;
    window.fetch = async () => ({ ok: true, headers: new Headers(), json: async () => ({}) });
    window.confirm = () => true;
  }, lang);
  await page.goto('https://pos.test/orders.html?tenant=fixture');
  await page.evaluate(lang => {
    window.currentTenantFeatures = ['dine_in'];
    window.IS_NATIVE_APP = true;
    syncPlatformClasses();
    window.ensureTenantCustomizations = async () => [];
    window.printCalls = [];
    PrinterService.getPrintCapabilities = () => ({ stickers: true, bill: true });
    PrinterService.printItemRangeStickers = (...args) => printCalls.push(['range', ...args]);
    PrinterService.printSingleItemSticker = (...args) => printCalls.push(['single', ...args]);
    PrinterService.printFullOrder = (...args) => printCalls.push(['full', ...args]);
    PrinterService.printCashierOnly = (...args) => printCalls.push(['bill', ...args]);
    window.openQuickStickerModal = (...args) => printCalls.push(['custom', ...args]);
    const c = (name, quantity = 1, surcharge = 0, extra = {}) => ({ optionId: name, itemId: name, name, quantity, surcharge, groups: [], subOptions: [], ...extra });
    const g = (groupName, items) => ({ groupId: groupName, groupName, items });
    const vi = lang === 'vi';
    const groups = [
      g(vi ? 'Rau ăn kèm' : '配菜', [c('Lựa chọn A'), c('Lựa chọn B', 2), c('Lựa chọn C'), c('Lựa chọn D'), c('Lựa chọn E'), c('Lựa chọn F')]),
      g(vi ? 'Độ cay' : '辣度', [c(vi ? 'Ít cay' : '微辣')]),
      g(vi ? 'Nước sốt' : '醬料', [c(vi ? 'Để riêng' : '分開裝', 1, 5)]),
      g('Nhóm Z '.repeat(7), [c('Tên lựa chọn rất dài '.repeat(6), 2, 5, { subOptions: [{ name: 'Kèm theo', price: 0 }], groups: [g('Nhóm con', [c('Lựa chọn con')])] })]),
      g(vi ? 'Nhóm trống' : '空白群組', []),
    ];
    const meal = { lineId: 'meal', itemId: 'meal', name: vi ? 'Combo A — Món có nhiều phần ăn' : '套餐 A — 多份餐點', category: 'Main', quantity: 3, unitPrice: 150, subtotal: 465,
      note: vi ? 'Ghi chú riêng của món' : '餐點的專屬備註', portions: [
        { portionIndex: 0, groups, note: vi ? 'Không hành\nĐể riêng' : '不加蔥\n分開裝' },
        { portionIndex: 1, groups: [g(vi ? 'Độ cay' : '辣度', [c(vi ? 'Không cay' : '不辣')])], note: '' },
        { portionIndex: 2, groups: [], note: '' },
      ] };
    const extra = { lineId: 'extra', itemId: 'extra', name: vi ? 'Món thường' : '單點餐點', category: 'Other', quantity: 1, unitPrice: 0, subtotal: 0, note: '', portions: [{ portionIndex: 0, groups: [], note: '' }] };
    window.detailFixture = { key: 'detail-fixture', displayKey: 'TEST-T001', customer: 'Khách hàng', status: 'DONE', diningOption: 'dine_in', tableNumber: '5', round_count: 2,
      total: 465, time: '12:30', createdAt: Date.now(), content: '',
      detailSnapshot: { schemaVersion: 1, total: 465, rounds: [
        { roundNumber: 1, groups: [], note: vi ? 'Ghi chú đợt đầu' : '首輪備註', items: [meal, extra] },
        { roundNumber: 2, groups: [], note: vi ? 'Ghi chú đợt thêm' : '加點備註', items: [{ ...extra, lineId: 'added' }] },
      ] } };
    latestOrders = [detailFixture];
    initSidebarState();
    applyLanguageToDOM();
    openReview('detail-fixture');
  }, lang);
  return errors;
}

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
  for (const lang of ['vi', 'zh-TW']) {
    test(`grouped POS order details: ${viewport.width}x${viewport.height} ${lang}`, async () => {
      const page = await browser.newPage({ viewport, hasTouch: true });
      page.setDefaultTimeout(5000);
      try {
        const errors = await fixture(page, lang);
        const multi = page.locator('#review-content .review-item-row').filter({ has: page.locator('.review-item-qty-badge', { hasText: '3×' }) });
        for (const mode of ['auto', 'standard', 'large', 'extra-large']) {
          await page.evaluate(mode => selectPOSTextSize(mode), mode);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const portions = multi.locator('.detail-portion-block');
          assert.equal(await portions.count(), 3);
          const labels = await portions.first().locator('.detail-group-label').allTextContents();
          assert.deepEqual(labels.slice(0, 3), lang === 'vi' ? ['Rau ăn kèm', 'Độ cay', 'Nước sốt'] : ['配菜', '辣度', '醬料']);
          assert.equal(await portions.first().locator('.detail-group-row').count(), 5);
          assert.equal(await portions.nth(2).locator('.portion-default-chip').textContent(), '—');
          const layout = await page.locator('#review-content').evaluate(root => {
            const selectors = '.review-item-row,.review-item-name,.detail-group-row,.detail-group-label,.detail-choice-chip,.detail-note-text,.review-item-header';
            const overflow = [...root.querySelectorAll(selectors)].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => ({ class: el.className, width: el.clientWidth, scroll: el.scrollWidth }));
            const tooSmall = [...root.querySelectorAll('button')].filter(el => el.getClientRects().length && (el.getBoundingClientRect().height < 47.9 || el.getBoundingClientRect().width < 47.9)).map(el => el.className);
            const firstRow = root.querySelector('.detail-group-row:not(.detail-note-row)');
            const label = firstRow.children[0].getBoundingClientRect(), choices = firstRow.children[1].getBoundingClientRect();
            return { overflow, tooSmall, labelBottom: label.bottom, choicesTop: choices.top, labelRight: label.right, choicesLeft: choices.left, pageWidth: document.documentElement.scrollWidth };
          });
          assert.deepEqual(layout.overflow, [], `${viewport.width}/${lang}/${mode}: content must wrap without clipping`);
          assert.deepEqual(layout.tooSmall, []);
          assert.ok(layout.pageWidth <= viewport.width + 1);
          if (viewport.width <= 600) assert.ok(layout.choicesTop >= layout.labelBottom, 'mobile labels sit above choices');
          else assert.ok(layout.choicesLeft > layout.labelRight, 'tablet labels sit beside choices');
          const printLayout = await page.locator('.review-print-macro-bar').evaluate(bar => {
            const buttons = [...bar.querySelectorAll('button')];
            return buttons.map(button => {
              const rect = button.getBoundingClientRect();
              return { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom,
                clipped: button.scrollWidth > button.clientWidth + 1,
                labelClipped: button.lastElementChild.scrollWidth > button.lastElementChild.clientWidth + 1 };
            });
          });
          assert.ok(printLayout.every(b => b.width >= 48 && b.height >= 48 && !b.clipped && !b.labelClipped));
          assert.ok(printLayout.slice(1).every((b, i) => b.top >= printLayout[i].bottom), 'print actions have room for readable labels');
        }
        await multi.locator('.review-item-print-btn').click();
        assert.deepEqual(await page.evaluate(() => printCalls.at(-1).slice(0, 4)), ['range', 'detail-fixture', 0, 3]);
        assert.equal(await multi.locator('.review-item-price').textContent(), '$465');
        const notes = await page.locator('#review-content .detail-note-text').allTextContents();
        assert.equal(notes.length, 4, 'round, item and portion notes appear once in their own scope');
        assert.match(await page.locator('#i18n-btn-print-full .print-action-summary').textContent(), /5/);
        for (const [id, action] of [['full', 'full'], ['bill', 'bill'], ['custom', 'custom']]) {
          await page.locator(`#btn-review-print-${id}`).click();
          assert.deepEqual(await page.evaluate(() => printCalls.at(-1)), [action, 'detail-fixture']);
        }
        await page.evaluate(() => {
          PrinterService.getPrintCapabilities = () => ({ stickers: false, bill: true });
          updatePrintActionAvailability();
        });
        assert.equal(await page.locator('#btn-review-print-full').isDisabled(), true);
        assert.equal(await page.locator('#btn-review-print-custom').isDisabled(), true);
        assert.equal(await page.locator('#btn-review-print-bill').isEnabled(), true);
        await page.evaluate(() => {
          PrinterService.getPrintCapabilities = () => ({ stickers: true, bill: true });
          updatePrintActionAvailability();
        });
        const artifacts = process.env.ORDER_DETAIL_ARTIFACT_DIR;
        if (artifacts && lang === 'vi' && viewport.width >= 390) {
          fs.mkdirSync(artifacts, { recursive: true });
          await page.evaluate(() => { selectPOSTextSize('standard'); document.getElementById('reviewModal').scrollTop = 0; });
          await page.screenshot({ path: path.join(artifacts, `detail-${viewport.width}.png`) });
        }
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    });
  }
}

test('legacy portion buttons keep their original sticker indexes', async () => {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  try {
    const errors = await fixture(page, 'vi');
    await page.evaluate(() => {
      document.getElementById('review-content').innerHTML = renderItemRowHtml({ name: 'Legacy', quantity: 2, price: '$200', stickerIndex: 4,
        options: '第1份: 少冰\n第2份: 不加糖', note: '' }, 0, 'legacy-order');
    });
    const buttons = page.locator('#review-content .portion-print-btn');
    assert.equal(await buttons.count(), 2);
    await buttons.nth(1).click();
    assert.deepEqual(await page.evaluate(() => printCalls.at(-1)), ['single', 'legacy-order', 5]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a sparse legacy note stays inside bundle portion 3 and prints that portion', async () => {
  const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
  try {
    const errors = await fixture(page, 'vi');
    await page.evaluate(() => {
      const order = { key: 'legacy-bundle', items: [{ name: 'Combo A', quantity: 3, unit_price: 150, subtotal: 465,
        options: [{ choice: '第3份: 備註: Test 3', price: 0 }],
        bundle_snapshot_json: JSON.stringify({ portions: [0, 1, 2].map(portionIndex => ({ portionIndex,
          groups: [{ groupName: 'Nhóm bất kỳ', items: [{ name: 'Lựa chọn A', quantity: 1 }] }] })) }) }] };
      const item = PrinterService.parseOrderItems(order, false)[0];
      document.getElementById('review-content').innerHTML = renderItemRowHtml({ ...item, stickerIndex: 4 }, 0, order.key);
    });
    const portions = page.locator('#review-content .detail-portion-block');
    assert.equal(await portions.count(), 3);
    assert.equal(await portions.nth(2).locator('.detail-note-text').textContent(), 'Test 3');
    assert.equal(await portions.nth(0).locator('.detail-note-row').count(), 0);
    assert.equal(await portions.nth(1).locator('.detail-note-row').count(), 0);
    assert.equal(await page.locator('#review-content .detail-note-row').count(), 1);
    await portions.nth(2).locator('.portion-print-btn').click();
    assert.deepEqual(await page.evaluate(() => printCalls.at(-1)), ['single', 'legacy-bundle', 6]);
    if (process.env.ORDER_DETAIL_ARTIFACT_DIR) {
      await page.locator('#review-content').screenshot({ path: path.join(process.env.ORDER_DETAIL_ARTIFACT_DIR, 'legacy-portion-note.png') });
    }
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
