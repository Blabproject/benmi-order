// Run with PLAYWRIGHT_MODULE pointing to the bundled Playwright package if needed.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const { getPosDistDir } = require('./helpers/pos-dist.cjs');

async function loadFixture(page) {
  const dist = getPosDistDir();
  await page.route('**/*', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/orders.html') {
      const body = fs.readFileSync(path.join(dist, 'orders.html'), 'utf8')
        .replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '');
      return route.fulfill({ body, contentType: 'text/html' });
    }
    if (/^\/(js|css|assets)\/[\w.-]+$/.test(pathname)) {
      return route.fulfill({ path: path.join(dist, pathname.slice(1)) });
    }
    return route.fulfill({ body: '', contentType: pathname.endsWith('.css') ? 'text/css' : 'application/javascript' });
  });
  await page.addInitScript(() => {
    window.fixtureIntervals = [];
    window.setInterval = (callback, delay) => window.fixtureIntervals.push({ callback, delay });
    window.alert = message => { throw new Error(`Unexpected alert: ${message}`); };
    window.confirm = () => true;
    window.fixturePosts = [];
    window.fetch = async (url, options = {}) => {
      if (url.includes('/api/orders') && window.fixtureOrdersUnavailable) {
        return { ok: false, status: 503 };
      }
      if (url.includes('/api/update')) {
        const update = JSON.parse(options.body);
        window.fixturePosts.push(update);
        if (window.holdFixtureStatus) {
          window.holdFixtureStatus = false;
          await new Promise(resolve => { window.releaseFixtureStatus = resolve; });
        }
        window.fixtureOrders.find(order => order.key === update.key).status = update.status;
      }
      return {
        ok: true, status: 200, headers: new Headers(),
        json: async () => url.includes('/api/orders') ? structuredClone(window.fixtureOrders) : {}
      };
    };
  });
  await page.goto('http://pos.test/orders.html?tenant=fixture');
  await page.evaluate(() => {
    window.currentTenantFeatures = ['dine_in'];
    window.fixtureOrders = Array.from({ length: 80 }, (_, index) => ({
      key: `fixture-${index}`, displayKey: index === 1 ? 'K1004-very-long-order-identifier-0123456789' : `K1004-${String(index + 1).padStart(3, '0')}`,
      customer: index === 1 ? 'Khách có tên rất dài để kiểm tra bố cục đơn hàng trên điện thoại' : `Khách ${index + 1}`,
      status: index < 24 ? 'ACCEPTED' : 'DONE',
      diningOption: index % 2 ? 'dine_in' : 'takeaway',
      tableNumber: index % 2 ? 'A-12' : '', round_count: 3, is_modified: 1,
      content: '1 x 招牌特餐\n2 x 鮮奶茶', total: 1234567,
      time: '23:59', createdAt: Date.now()
    }));
    latestOrders = structuredClone(window.fixtureOrders);
    if (typeof initLiveMobileView === 'function') initLiveMobileView();
    applyLanguageToDOM();
    renderAll();
  });
}

async function scrollList(page, selector, position) {
  await page.locator(selector).evaluate((node, value) => { node.scrollTop = value; }, position);
  await page.waitForFunction(({ selector, position }) => document.querySelector(selector).scrollTop === position, { selector, position });
  // Let the browser dispatch the scroll event before switching the panel.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function snapshot(page, name) {
  if (!process.env.POS_LIVE_SCREENSHOT_DIR) return;
  fs.mkdirSync(process.env.POS_LIVE_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.POS_LIVE_SCREENSHOT_DIR, `${name}.png`) });
}

async function resize(page, viewport) {
  await page.setViewportSize(viewport);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function touchGesture(page, from, to, { cancel = false, multi = false, refresh = false } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const points = (x, y) => [{ x, y, id: 1 }, ...(multi ? [{ x: x - 28, y, id: 2 }] : [])];
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from.x, from.y) });
    for (let step = 1; step <= 6; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: points(from.x + (to.x - from.x) * step / 6, from.y + (to.y - from.y) * step / 6)
      });
      if (refresh && step === 3) await page.evaluate(() => renderAll());
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  } finally {
    await cdp.detach();
  }
}

async function swipeQueue(page, direction, options) {
  const info = await page.locator('.live-panel:not([hidden]) .tile-top').evaluateAll(nodes => {
    const list = nodes[0].closest('.live-panel-body').getBoundingClientRect();
    return nodes.map(node => node.getBoundingClientRect()).find(rect => rect.top >= list.top && rect.top + 20 < list.bottom).toJSON();
  });
  const left = { x: info.x + info.width * 0.25, y: info.y + 20 };
  const right = { x: info.x + info.width * 0.75, y: info.y + 20 };
  await touchGesture(page, direction === 'left' ? right : left, direction === 'left' ? left : right, options);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    headless: true
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await loadFixture(page);

    assert.equal(await page.locator('#list-left .tile').first().getAttribute('data-slot'), 'card');
    assert.equal(await page.locator('#list-left .tile-action-btn').first().getAttribute('data-slot'), 'button');
    assert.equal(await page.locator('#list-left .tile-badge').first().getAttribute('data-slot'), 'badge');

    for (const lang of ['zh-TW', 'vi']) {
      await page.evaluate(lang => { currentLang = lang; window.currentLang = lang; applyLanguageToDOM(); renderAll(); }, lang);
      assert.equal(await page.locator('#filter-count-all').innerText(), '80');
      assert.equal(await page.locator('#filter-count-takeaway').innerText(), '40');
      assert.equal(await page.locator('#filter-count-dinein').innerText(), '40');
      for (const width of [320, 375, 390, 430, 600]) {
        await resize(page, { width, height: 900 });
        assert(await page.locator('#live-mobile-tabs').isVisible());
        assert(await page.locator('#live-panel-pending').isVisible());
        assert(!(await page.locator('#live-panel-ready').isVisible()));
        const metrics = await page.evaluate(() => {
          const list = document.getElementById('list-left');
          const tile = list.querySelector('.tile');
          const info = tile.querySelector('.tile-info').getBoundingClientRect();
          const button = tile.querySelector('button').getBoundingClientRect();
          const longName = list.querySelector('[data-order-key="fixture-1"] .tile-customer');
          const longNameStyle = getComputedStyle(longName);
          const nameRange = document.createRange();
          nameRange.selectNodeContents(longName);
          const visibleNodes = [list, tile, ...tile.querySelectorAll('.tile-info > *, .tile-info span, button'), ...document.querySelectorAll('.live-mobile-tab')];
          return {
            listHeight: list.clientHeight, listBottom: list.getBoundingClientRect().bottom,
            documentWidth: document.documentElement.scrollWidth,
            overflow: visibleNodes.filter(node => node.getBoundingClientRect().right > window.innerWidth + 1 ||
              (!node.classList.contains('tile-customer') && node.scrollWidth > node.clientWidth + 1)).map(node => node.className),
            longName: {
              width: longName.clientWidth, scrollWidth: longName.scrollWidth,
              textOverflow: longNameStyle.textOverflow, overflowX: longNameStyle.overflowX,
              lines: new Set([...nameRange.getClientRects()].map(rect => rect.top)).size
            },
            overlap: button.top < info.bottom,
            buttonHeight: button.height,
            tabHeights: [...document.querySelectorAll('.live-mobile-tab')].map(node => node.getBoundingClientRect().height),
            filterHeights: [...document.querySelectorAll('.dining-filter-btn')].map(node => node.getBoundingClientRect().height)
          };
        });
        assert(metrics.listHeight > 100 && metrics.listBottom <= 900, `${lang}/${width}: list must fit viewport`);
        assert.equal(metrics.documentWidth, width);
        assert.deepEqual(metrics.overflow, [], `${lang}/${width}: overflowing content`);
        const { width: nameWidth, scrollWidth, textOverflow, overflowX, lines } = metrics.longName;
        assert(nameWidth > 0 && scrollWidth > nameWidth && textOverflow === 'ellipsis' && overflowX === 'hidden' && lines === 1,
          `${lang}/${width}: expected a single-line customer name with ellipsis, got ${JSON.stringify(metrics.longName)}`);
        assert(!metrics.overlap && metrics.buttonHeight >= 48);
        assert(metrics.tabHeights.every(height => height >= 48));
        assert(metrics.filterHeights.every(height => height >= 48));
        assert.equal(await page.locator('#live-mobile-count-pending').innerText(), '24');
        assert.equal(await page.locator('#live-mobile-count-ready').innerText(), '56');
      }
    }
    await resize(page, { width: 390, height: 844 });
    await snapshot(page, 'live-mobile-vi');

    await page.locator('#list-left [data-order-key="fixture-1"] .tile-customer').tap();
    assert.equal(await page.locator('#review-customer').innerText(), 'Khách có tên rất dài để kiểm tra bố cục đơn hàng trên điện thoại');
    await page.evaluate(() => closeModal());

    await page.locator('#mobile-nav-toggle-btn').tap();
    assert(await page.locator('#app-sidebar.expanded').count());
    await page.locator('#sidebar-backdrop').tap({ position: { x: 380, y: 160 } });
    assert.equal(await page.locator('#app-sidebar.expanded').count(), 0);
    await page.locator('#store-status-btn').tap();
    assert.equal(await page.locator('#store-status-dropdown.open .status-option:visible').count(), 4);
    await page.locator('#store-status-btn').tap();

    await swipeQueue(page, 'left');
    assert(await page.locator('#live-panel-ready').isVisible(), 'Swipe left selects ready queue');
    assert(!(await page.locator('#reviewModal').isVisible()), 'Swiping a card must not open its details');
    await swipeQueue(page, 'left');
    assert(await page.locator('#live-panel-ready').isVisible(), 'Swiping past the last queue does not wrap');
    await swipeQueue(page, 'right');
    assert(await page.locator('#live-panel-pending').isVisible(), 'Swipe right selects pending queue');
    await swipeQueue(page, 'right');
    assert(await page.locator('#live-panel-pending').isVisible(), 'Swiping past the first queue does not wrap');
    await swipeQueue(page, 'left', { cancel: true });
    assert(await page.locator('#live-panel-pending').isVisible(), 'Cancelled gestures keep the current queue');
    await swipeQueue(page, 'left', { multi: true });
    assert(await page.locator('#live-panel-pending').isVisible(), 'Multi-touch does not switch queues');

    const info = await page.locator('#list-left .tile-info').first().boundingBox();
    const touchPoint = { x: info.x + info.width * 0.75, y: info.y + 20 };
    await touchGesture(page, touchPoint, { x: touchPoint.x - 20, y: touchPoint.y });
    assert(await page.locator('#live-panel-pending').isVisible(), 'Short movements do not switch queues');
    await touchGesture(page, { x: 375, y: touchPoint.y }, { x: 200, y: touchPoint.y });
    assert(await page.locator('#live-panel-pending').isVisible(), 'Screen-edge gestures are reserved for the browser');
    const button = await page.locator('#list-left .tile-action-btn').first().boundingBox();
    await touchGesture(page, { x: button.x + button.width * 0.75, y: button.y + button.height / 2 }, { x: button.x + 20, y: button.y + button.height / 2 });
    assert(await page.locator('#live-panel-pending').isVisible(), 'Swiping on action buttons does not switch queues');
    assert.equal(await page.evaluate(() => window.fixturePosts.length), 0, 'Gestures do not update order status');
    await page.evaluate(() => closeModal());

    await touchGesture(page, { x: touchPoint.x, y: info.y + 120 }, { x: touchPoint.x, y: info.y + 20 }, { cancel: true });
    assert(await page.locator('#live-panel-pending').isVisible(), 'Vertical scrolling retains the queue');
    assert(await page.locator('#list-left').evaluate(node => node.scrollTop > 0), 'Vertical touch gestures still scroll natively');
    await scrollList(page, '#list-left', 0);
    await touchGesture(page, { x: touchPoint.x, y: info.y + 120 }, { x: touchPoint.x - 50, y: info.y + 20 }, { cancel: true });
    assert(await page.locator('#live-panel-pending').isVisible(), 'Vertical-dominant diagonal gestures retain the queue');
    await scrollList(page, '#list-left', 0);
    await swipeQueue(page, 'left', { refresh: true });
    assert(await page.locator('#live-panel-ready').isVisible(), 'Live refresh during a swipe must not lose the gesture');
    await page.locator('#live-mobile-tab-pending').tap();

    const tabPosition = await page.locator('#live-mobile-tabs').boundingBox();
    await scrollList(page, '#list-left', 500);
    assert.deepEqual(await page.locator('#live-mobile-tabs').boundingBox(), tabPosition, 'Tabs remain stationary');
    await page.locator('#live-mobile-tab-ready').click();
    assert.equal(await page.locator('#live-mobile-tab-ready').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#live-panel-pending').getAttribute('inert'), '');
    assert.equal(await page.locator('#list-right').evaluate(node => node.scrollTop), 0);
    await scrollList(page, '#list-right', 700);
    await page.evaluate(() => window.fixtureIntervals.find(timer => timer.delay === 10000).callback());
    assert.equal(await page.locator('#list-right').evaluate(node => node.scrollTop), 700);
    await page.evaluate(async () => {
      const current = window.fixtureOrders.find(order => order.status === 'DONE');
      const currentTile = [...document.querySelectorAll('#list-right .tile')].find(tile => tile.dataset.orderKey === current.key);
      currentTile.dataset.identityProbe = 'retained';
      window.fixtureOrders.push({ ...current, key: 'poll-arrival', customer: 'Khách mới qua polling' });
      await fetchOrders();
    });
    assert.equal(await page.locator('#list-right [data-identity-probe="retained"]').count(), 1, 'React retains the same card node');
    assert.equal(await page.locator('#list-right [data-order-key="poll-arrival"] .tile-customer').innerText(), 'Khách mới qua polling');
    assert.equal(await page.locator('#list-right').evaluate(node => node.scrollTop), 700, 'Polling preserves scroll');
    await page.evaluate(async () => {
      window.fixtureOrders = window.fixtureOrders.filter(order => order.key !== 'poll-arrival');
      await fetchOrders();
    });
    await page.locator('#live-mobile-tab-pending').click();
    assert.equal(await page.locator('#list-left').evaluate(node => node.scrollTop), 500, 'Hidden queue retains scroll');
    await swipeQueue(page, 'left');
    assert.equal(await page.locator('#list-right').evaluate(node => node.scrollTop), 700, 'Swipe retains ready queue scroll');
    await swipeQueue(page, 'right');
    assert.equal(await page.locator('#list-left').evaluate(node => node.scrollTop), 500, 'Swipe retains pending queue scroll');

    await page.locator('#live-mobile-tab-pending').focus();
    await page.keyboard.press('ArrowRight');
    assert(await page.locator('#live-mobile-tab-ready').evaluate(node => node === document.activeElement));
    await page.keyboard.press('Home');
    assert(await page.locator('#live-mobile-tab-pending').evaluate(node => node === document.activeElement));
    await page.keyboard.press('End');
    assert(await page.locator('#live-panel-ready').isVisible());

    await page.evaluate(() => switchTab('settings'));
    await resize(page, { width: 844, height: 390 });
    await resize(page, { width: 390, height: 844 });
    assert(!(await page.locator('#view-live').isVisible()), 'Resizing must not reveal Live over another main tab');
    await page.evaluate(() => switchTab('live'));
    assert(await page.locator('#live-panel-ready').isVisible());
    assert.equal(await page.locator('#list-right').evaluate(node => node.scrollTop), 700);
    const returnedList = await page.locator('#list-right').boundingBox();
    assert(returnedList.y + returnedList.height <= 844, 'Returning to Live retains bounded scrolling');

    await resize(page, { width: 1000, height: 390 });
    await page.waitForFunction(() => !document.getElementById('live-panel-pending').inert);
    assert(await page.locator('#live-panel-pending').isVisible());
    assert(await page.locator('#live-panel-ready').isVisible());
    assert.equal(await page.locator('#live-panel-pending').getAttribute('inert'), null);
    await resize(page, { width: 390, height: 844 });
    assert(await page.locator('#live-panel-ready').isVisible());
    assert.equal(await page.locator('#list-right').evaluate(node => node.scrollTop), 700);

    await page.locator('#filter-btn-takeaway').click();
    assert.equal(await page.locator('#filter-btn-takeaway').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#filter-btn-all').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#list-right').evaluate(node => node.scrollTop), 0);
    await page.locator('#live-mobile-tab-pending').click();
    assert.equal(await page.locator('#list-left').evaluate(node => node.scrollTop), 0);
    await page.locator('#filter-btn-all').click();
    assert.equal(await page.locator('#filter-btn-all').getAttribute('aria-pressed'), 'true');
    // Use actual action buttons and production status handlers; only HTTP is mocked.
    await page.evaluate(() => { window.holdFixtureStatus = true; });
    const readyAction = page.locator('#list-left .btn-action-ready').first();
    await readyAction.tap();
    assert(await readyAction.isDisabled());
    assert.equal(await readyAction.getAttribute('aria-busy'), 'true');
    await page.evaluate(() => window.releaseFixtureStatus());
    await page.waitForFunction(() => document.getElementById('live-mobile-count-pending').innerText === '23');
    assert.equal(await page.locator('#live-mobile-count-ready').innerText(), '57');
    assert(await page.locator('#live-panel-pending').isVisible());
    await page.locator('#live-mobile-tab-ready').click();
    await page.locator('#list-right .btn-action-pickup').first().tap();
    await page.waitForFunction(() => document.getElementById('live-mobile-count-ready').innerText === '56');
    await page.locator('#list-right .btn-action-paid').first().tap();
    await page.waitForFunction(() => document.getElementById('live-mobile-count-ready').innerText === '55');
    assert(await page.locator('#live-panel-ready').isVisible());
    assert.deepEqual(await page.evaluate(() => window.fixturePosts.map(post => post.status)), ['DONE', 'PICKED_UP', 'PAID']);
    await page.locator('#list-right .tile.is-takeaway').first().press('Enter');
    assert(await page.locator('#reviewModal').isVisible(), 'Opening order details from the keyboard works');
    await page.locator('#btn-review-picked').tap();
    await page.locator('#reviewModal').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.fixturePosts.at(-1).status), 'PICKED_UP');

    await page.locator('#live-mobile-tab-pending').click();
    await page.evaluate(() => {
      const [newOrder, change, reject] = window.fixtureOrders.filter(order => order.status === 'ACCEPTED');
      newOrder.status = 'NEW';
      change.status = 'WAITING_CUSTOMER_CHANGE';
      reject.status = 'WAITING_CUSTOMER_REJECT';
      latestOrders = structuredClone(window.fixtureOrders);
      renderAll();
    });
    assert.equal(await page.locator('#list-left .btn-action-waiting:disabled').count(), 2);
    await page.locator('#list-left .btn-action-review').tap();
    assert(await page.locator('#reviewModal').isVisible(), 'Reviewing a new order still works');
    await page.locator('#btn-review-change').tap();
    assert(await page.locator('#changeModal').isVisible());
    await page.locator('.preset-card[data-mins="30"]').tap();
    assert.equal(await page.locator('#change-note').inputValue(), await page.locator('#preset-target-30').textContent());
    await page.evaluate(() => closeModal());
    await page.locator('#list-left .btn-action-review').tap();
    await page.locator('#btn-review-reject').tap();
    assert(await page.locator('#rejectModal').isVisible());
    await page.evaluate(() => closeModal());
    await page.locator('#list-left .btn-action-review').tap();
    await page.evaluate(() => { window.holdFixtureStatus = true; });
    const accept = page.locator('#btn-review-accept');
    await accept.tap();
    assert.equal(await accept.getAttribute('aria-busy'), 'true');
    assert(await page.locator('#btn-review-reject').isDisabled());
    await page.evaluate(() => window.releaseFixtureStatus());
    await page.locator('#reviewModal').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.fixturePosts.at(-1).status), 'ACCEPTED');

    await page.evaluate(async () => {
      window.fetchTenantMenuItems = async () => [{ name: 'Trà đá', category: 'Nước' }];
      window.fixtureOrders.find(order => order.status === 'ACCEPTED').status = 'NEW';
      await fetchOrders();
    });
    await page.locator('#btn-alert-review').tap();
    await page.locator('#btn-review-change').tap();
    await page.locator('#tab-reason-soldout').tap();
    await page.locator('.checkbox-card').filter({ hasText: 'Trà đá' }).tap();
    await page.locator('#btn-change-send').tap();
    await page.locator('#changeModal').waitFor({ state: 'hidden' });
    assert.deepEqual(await page.evaluate(() => {
      const { status, reason, note } = window.fixturePosts.at(-1);
      return { status, reason, note };
    }), { status: 'CHANGED', reason: '口味售完', note: 'Trà đá' });

    await page.evaluate(async () => {
      window.fixtureOrders.find(order => order.status === 'ACCEPTED').status = 'NEW';
      await fetchOrders();
    });
    await page.locator('#btn-alert-review').tap();
    await page.locator('#btn-review-reject').tap();
    await page.locator('.reject-card[data-val="訂單過多"]').tap();
    await page.locator('#btn-reject-confirm').tap();
    await page.locator('#rejectModal').waitFor({ state: 'hidden' });
    assert.deepEqual(await page.evaluate(() => {
      const { status, reason } = window.fixturePosts.at(-1);
      return { status, reason };
    }), { status: 'REJECTED', reason: '訂單過多' });

    await page.evaluate(() => { window.currentTenantFeatures = []; renderAll(); });
    assert(!(await page.locator('#dining-filter-bar').isVisible()), 'Takeaway-only tenants retain feature gating');
    assert(await page.locator('#live-mobile-tabs').isVisible());
    await page.locator('#live-mobile-tab-ready').click();

    await page.evaluate(() => { window.fixtureOrders = []; latestOrders = []; renderAll(); });
    assert(await page.locator('#list-right .empty-state-card').isVisible());
    await page.locator('#live-mobile-tab-pending').click();
    assert(await page.locator('#list-left .empty-state-card').isVisible());
    assert.equal(await page.locator('#live-mobile-count-pending').innerText(), '0');
    assert.equal(await page.locator('#live-mobile-count-ready').innerText(), '0');
    await page.evaluate(async () => {
      window.fixtureOrdersUnavailable = true;
      await fetchOrders();
    });
    assert.match(await page.locator('#list-left [role=alert]').innerText(), /503/);
    await page.evaluate(async () => {
      window.fixtureOrdersUnavailable = false;
      await fetchOrders();
    });
    assert(await page.locator('#list-left .empty-state-card').isVisible(), 'Queue recovers after a fetch error');

    // Wide screens show both queues only when each has space for scaled text.
    const current = await browser.newPage({ hasTouch: true });
    await loadFixture(current);
    for (const viewport of [
      { width: 601, height: 900 }, { width: 600, height: 390 }, { width: 844, height: 390 },
      { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }
    ]) {
      await resize(current, viewport);
      const adaptive = await current.evaluate(() => isLiveMobilePortrait());
      assert.equal(await current.locator('#live-mobile-tabs').isVisible(), adaptive);
      assert(await current.locator('#live-panel-pending').isVisible());
      assert.equal(await current.locator('#live-panel-ready').isVisible(), !adaptive);
      if (!adaptive) {
        const stationBeforeSwipe = await current.evaluate(() => liveMobileStation);
        await swipeQueue(current, 'left');
        assert.equal(await current.evaluate(() => liveMobileStation), stationBeforeSwipe, 'Wide queues do not swipe');
      }
      await current.evaluate(() => { switchTab('settings'); switchTab('live'); });
      assert.equal(await current.locator('#live-panel-ready').isVisible(), !adaptive, 'Main-tab return keeps adaptive layout');
    }
    await resize(current, { width: 1024, height: 768 });
    await snapshot(current, 'live-tablet-zh-TW');
    assert.deepEqual(errors, [], 'No browser runtime errors');
    console.log('PASS: native touch swipes, vertical scroll, gesture exclusions/cancellation, refresh during swipe, mobile widths/languages, keyboard tabs, independent scrolling, polling, rotation, main-tab return, filters, status actions, details, empty queues, and adaptive wider/landscape layouts.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
