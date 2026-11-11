// Browser regression coverage for device-local typography and adaptive queues.
// PLAYWRIGHT_MODULE may point to the bundled package; CHROME_PATH overrides Chrome.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sizes = { standard: 1, large: 1.125, 'extra-large': 1.25 };

async function fixture(page) {
  const nodeFs = require('node:fs');
  const nodePath = require('node:path');
  const { execFileSync } = require('node:child_process');
  const repoRoot = nodePath.resolve(__dirname, '..');
  const distDir = nodePath.join(repoRoot, 'dist');
  if (!nodeFs.existsSync(nodePath.join(distDir, '.vite/manifest.json')) || !nodeFs.existsSync(nodePath.join(distDir, 'orders.html'))) {
    execFileSync(process.execPath, [nodePath.join(repoRoot, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.config.mts'], {
      cwd: repoRoot,
      stdio: 'inherit'
    });
  }

  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/orders.html') {
      // Keep actual linked assets and load order; avoid background API/bootstrap work.
      const html = nodeFs.readFileSync(nodePath.join(distDir, 'orders.html'), 'utf8')
        .replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '');
      return route.fulfill({ body: html, contentType: 'text/html' });
    }
    if (/^\/(js|css|assets)\/[\w.-]+$/.test(url.pathname)) {
      const rel = url.pathname.slice(1);
      const contentType = rel.endsWith('.css')
        ? 'text/css'
        : rel.endsWith('.png')
          ? 'image/png'
          : 'application/javascript';
      return route.fulfill({
        body: nodeFs.readFileSync(nodePath.join(distDir, rel)),
        contentType,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }
    return route.fulfill({ body: '{}', contentType: 'application/json' });
  });
  await page.addInitScript(() => {
    window.setInterval = () => 0;
    window.fetch = async () => ({ ok: true, headers: new Headers(), json: async () => ({}) });
    window.confirm = () => true;
  });
  await page.goto('http://pos.test/orders.html?tenant=fixture');
  await seed(page);
}

async function seed(page) {
  await page.evaluate(() => {
    window.currentTenantFeatures = ['dine_in'];
    window.fixtureOrder = {
      key: 'fixture-long', displayKey: 'K1004-very-long-order-identifier-0123456789',
      customer: 'Khách có tên rất dài để kiểm tra khả năng đọc trên máy tính bảng',
      status: 'DONE', diningOption: 'dine_in', tableNumber: 'A-12', round_count: 3,
      content: Array.from({ length: 25 }, (_, i) => `1 x 招牌餐點 ${i + 1} $60\n  ↳ 微辣、不要蔥、加蒜`).join('\n'),
      items: Array.from({ length: 25 }, (_, i) => ({ name: `Món có tên dài / 招牌餐點 ${i + 1}`, quantity: 1, price: 60, options: 'Ít cay, không hành / 微辣、不要蔥' })),
      subtotal: 1500, total: 1500, time: '11:46', createdAt: Date.now()
    };
    latestOrders = Array.from({ length: 30 }, (_, i) => ({ ...window.fixtureOrder, key: i === 0 ? 'fixture-long' : `fixture-${i}`, status: i % 2 ? 'ACCEPTED' : 'DONE' }));
    initSidebarState();
    initLiveMobileView();
    applyLanguageToDOM();
    renderAll();
  });
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function assertTouchTargets(page) {
  const small = await page.evaluate(() => [...document.querySelectorAll('.app-layout button, .modal button, .new-alert button, .modal-close, .settings-toc-item, label:has(input)')]
    .filter(node => node.getBoundingClientRect().width && getComputedStyle(node).visibility !== 'hidden')
    .filter(node => { const rect = node.getBoundingClientRect(); return rect.width < 47.9 || rect.height < 47.9; })
    .map(node => ({ id: node.id, class: node.className, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
  assert.deepEqual(small, [], 'Visible touch targets must be at least 48px');
}

async function assertNoOverflow(page, selectors) {
  const bad = await page.evaluate(selectors => selectors.flatMap(selector => [...document.querySelectorAll(selector)])
    .filter(node => node.clientWidth > 0 && getComputedStyle(node).visibility !== 'hidden')
    .filter(node => node.scrollWidth > node.clientWidth + 1)
    .map(node => ({ id: node.id, class: node.className, width: node.clientWidth, scroll: node.scrollWidth })), selectors);
  assert.deepEqual(bad, [], 'Readable content must not be clipped horizontally');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page overflow');
}

async function screenshot(page, name) {
  if (!process.env.POS_DISPLAY_SCREENSHOT_DIR) return;
  fs.mkdirSync(process.env.POS_DISPLAY_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.POS_DISPLAY_SCREENSHOT_DIR, `${name}.png`) });
}

async function run() {
  const useWebKit = process.env.POS_DISPLAY_BROWSER === 'webkit';
  const browser = await (useWebKit ? webkit : chromium).launch(useWebKit ? {} : {
    executablePath: process.env.CHROME_PATH || undefined, headless: true
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await fixture(page);
    for (const viewport of [
      { width: 768, height: 1024 }, { width: 820, height: 1180 },
      { width: 1024, height: 768 }, { width: 1366, height: 1024 },
      { width: 390, height: 844 }, { width: 320, height: 600 }, { width: 844, height: 390 }
    ]) {
      await page.setViewportSize(viewport);
      for (const lang of ['vi', 'zh-TW']) {
        await page.evaluate(lang => setLanguage(lang), lang);
        for (const mode of ['auto', 'standard', 'large', 'extra-large']) {
          const scale = mode === 'auto' ? (viewport.width >= 768 ? 1.125 : 1) : sizes[mode];
          await page.evaluate(mode => { closeModal(); selectPOSTextSize(mode); switchTab('live'); }, mode);
          await settle(page);
          const live = await page.evaluate(() => ({
            mainWidth: document.getElementById('main-layout').clientWidth,
            adaptive: document.getElementById('view-live').classList.contains('live-adaptive-stations'),
            listBottom: document.querySelector('.live-panel:not([hidden]) .live-panel-body').getBoundingClientRect().bottom
          }));
          const needsTabs = (viewport.width <= 600 && viewport.height >= viewport.width) || live.mainWidth < 2 * 320 * scale + 64;
          assert.equal(live.adaptive, needsTabs, `${viewport.width}/${mode}: column minimum`);
          assert(live.listBottom <= viewport.height + 1, `${viewport.width}x${viewport.height}/${lang}/${mode}: Live list bottom ${live.listBottom} stays within viewport`);
          await assertNoOverflow(page, ['.tile-info', '.tile-order-key', '.tile-customer', '.tile-price', '.tile-item-preview', '.tile-action-btn']);
          await assertTouchTargets(page);
          if (mode === 'extra-large' && lang === 'vi') await screenshot(page, `live-${viewport.width}`);

          await page.evaluate(() => { switchTab('settings'); switchSettingTab('setting-card-display'); });
          assert(await page.locator(`input[name="pos-text-size"][value="${mode}"]`).isChecked());
          for (const [selector, baseSize] of [
            ['.pos-display-preview-meta', 14], ['.pos-display-preview-item', 16],
            ['.pos-display-preview-title', 22], ['.pos-display-preview-total', 24]
          ]) {
            const actual = await page.locator(selector).evaluate(node => parseFloat(getComputedStyle(node).fontSize));
            assert(Math.abs(actual - baseSize * scale) < 0.01, `${selector}/${mode}: ${actual}`);
          }
          assert.equal(await page.locator('#i18n-settings-title').innerText(), lang === 'vi' ? 'Hiển thị' : '顯示');
          await assertNoOverflow(page, ['.pos-display-option', '.pos-display-preview', '.settings-toc-item']);
          await assertTouchTargets(page);
          if (mode === 'extra-large' && lang === 'vi') await screenshot(page, `display-${viewport.width}`);

          await page.evaluate(() => { switchTab('live'); openReview('fixture-long'); });
          await assertNoOverflow(page, ['.review-item-name', '.review-item-options', '.order-detail-title', '.order-detail-grid']);
          await assertTouchTargets(page);
          await page.locator('#reviewModal').evaluate(node => { node.scrollTop = node.scrollHeight; });
          const total = await page.locator('#review-grandtotal-row').boundingBox();
          assert(total && total.y + total.height <= viewport.height, 'Long order scrolls to its final total');
          // In the two-column layout actions are alongside the items; they must
          // remain reachable by scrolling, including after reading the final item.
          await page.locator('#btn-review-picked').scrollIntoViewIfNeeded();
          const rect = await page.locator('#btn-review-picked').boundingBox();
          if (!(rect && rect.y >= 0 && rect.y + rect.height <= viewport.height)) {
            await screenshot(page, 'detail-failure');
            console.log(await page.locator('#btn-review-picked').evaluate(node => {
              const chain = [];
              for (let parent = node; parent; parent = parent.parentElement) chain.push({ id: parent.id, class: parent.className, top: parent.getBoundingClientRect().top, height: parent.clientHeight, scroll: parent.scrollTop, scrollHeight: parent.scrollHeight, overflow: getComputedStyle(parent).overflowY });
              return chain;
            }));
          }
          assert(rect && rect.y >= 0 && rect.y + rect.height <= viewport.height, `${viewport.width}x${viewport.height}/${lang}/${mode}: Detail action ${JSON.stringify(rect)} accessible at bottom`);
        }
      }
    }

    // Shared CSS must also leave dialogs, history and operating hours usable.
    for (const viewport of [{ width: 768, height: 1024 }, { width: 1024, height: 600 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      for (const lang of ['vi', 'zh-TW']) {
        await page.evaluate(lang => { closeModal(); selectPOSTextSize('extra-large'); setLanguage(lang); openReview('fixture-long'); reviewOpenChange(); }, lang);
        await settle(page);
        await assertTouchTargets(page);
        const send = await page.locator('#btn-change-send').boundingBox();
        assert(send && send.y >= 0 && send.y + send.height <= viewport.height, 'Change submit remains in viewport');
        await assertNoOverflow(page, ['#changeModal .modal-content', '#changeModal .modal-actions']);
        await page.evaluate(() => { closeModal(); switchTab('settings'); switchSettingTab('setting-card-hours'); renderOperatingHours(); });
        await assertTouchTargets(page);
        await page.evaluate(async () => { switchTab('history'); await fetchHistoryOrders(); renderHistory(latestOrders); });
        await assertTouchTargets(page);
        await assertNoOverflow(page, ['.history-card', '#view-history']);
      }
    }

    // Typography preferences must not affect receipt and sticker output.
    const prints = await page.evaluate(() => {
      const results = [];
      for (const mode of ['standard', 'large', 'extra-large']) {
        selectPOSTextSize(mode);
        results.push([
          PrinterService.drawReceiptToCanvas(window.fixtureOrder, false, 80),
          PrinterService.drawItemStickerToCanvas({ name: '鮮奶茶', quantity: 1, options: '少冰、半糖' }, window.fixtureOrder, 1, 2, 40, 30, 203)
        ]);
      }
      return results;
    });
    assert.deepEqual(prints[0], prints[1], 'Large UI must not change receipts');
    assert.deepEqual(prints[0], prints[2], 'Extra-large UI must not change receipts');

    // Use real radios, keyboard navigation, persisted reload and resize behavior.
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.evaluate(() => { closeModal(); switchTab('settings'); switchSettingTab('setting-card-display'); });
    await page.locator('input[value="large"][name="pos-text-size"]').check();
    await page.reload();
    await seed(page);
    assert.equal(await page.locator('html').getAttribute('data-pos-text-size'), 'large');
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);
    assert.equal(await page.evaluate(() => getPOSTextScale()), 1.125, 'Manual size survives rotation');
    await page.evaluate(() => selectPOSTextSize('auto'));
    assert.equal(await page.evaluate(() => getPOSTextScale()), 1);
    await page.setViewportSize({ width: 1024, height: 768 });
    await settle(page);
    assert.equal(await page.evaluate(() => getPOSTextScale()), 1.125);

    // ResizeObserver must account for opening the sidebar without window resize.
    await page.evaluate(() => { switchTab('live'); selectPOSTextSize('extra-large'); toggleSidebar(true); });
    await page.waitForFunction(() => document.getElementById('view-live').classList.contains('live-adaptive-stations'));
    assert(await page.locator('#live-mobile-tabs').isVisible());
    await page.locator('#live-mobile-tab-ready').click();
    await page.locator('#list-right').evaluate(node => { node.scrollTop = 500; });
    await settle(page);
    await page.evaluate(() => renderAll());
    assert.equal(await page.locator('#list-right').evaluate(node => node.scrollTop), 500, 'Refresh preserves queue scroll');
    await page.evaluate(() => toggleSidebar(false));
    await page.waitForFunction(() => !document.getElementById('view-live').classList.contains('live-adaptive-stations'));
    assert(!(await page.locator('#live-mobile-tabs').isVisible()));
    assert(await page.locator('#live-panel-pending').isVisible());
    assert(await page.locator('#live-panel-ready').isVisible());
    assert.deepEqual(errors, [], 'No browser runtime errors');

    // Entire storage may be blocked or writes may fail because it is full.
    const blocked = await browser.newPage({ viewport: { width: 820, height: 1180 } });
    const blockedErrors = [];
    blocked.on('pageerror', error => blockedErrors.push(error.message));
    await blocked.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
      Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    });
    await fixture(blocked);
    await blocked.evaluate(() => { selectPOSTextSize('extra-large'); setLanguage('vi'); switchTab('settings'); switchSettingTab('setting-card-display'); });
    assert.equal(await blocked.evaluate(() => getPOSTextScale()), 1.25);
    assert(await blocked.locator('input[value="extra-large"][name="pos-text-size"]').isChecked());
    await blocked.evaluate(() => showStoreActivationModal(true));
    assert(await blocked.locator('#activation-tenant-id').isVisible(), 'Device activation remains usable when storage is blocked');
    assert.deepEqual(blockedErrors, [], 'Blocked storage must not break initialization or controls');
    console.log('PASS: typography sizes, two languages, seven viewports, four modes, touch targets, long orders, dialog actions, history, hours, unchanged print output, persistence, rotation, sidebar width, refresh and blocked storage.');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
