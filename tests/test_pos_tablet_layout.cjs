const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const { getPosDistDir } = require('./helpers/pos-dist.cjs');
const viewports = [
  { width: 768, height: 1024 }, { width: 800, height: 600 },
  { width: 960, height: 600 }, { width: 1024, height: 768 }, { width: 1280, height: 800 },
  { width: 1512, height: 861 }
];

async function withPOS(check) {
  const dist = getPosDistDir();
  const browser = await (process.env.POS_DISPLAY_BROWSER === 'webkit' ? webkit : chromium).launch();
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, hasTouch: true });
    await page.route('**/*', route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/orders.html') return route.fulfill({ contentType: 'text/html',
        body: fs.readFileSync(path.join(dist, 'orders.html'), 'utf8').replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '') });
      if (/^\/(js|css|assets)\/[\w.-]+$/.test(pathname)) return route.fulfill({
        path: path.join(dist, pathname.slice(1)) });
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    });
    await page.addInitScript(() => {
      window.setInterval = () => 0;
      window.fetch = async () => ({ ok: true, headers: new Headers(), json: async () => ({}) });
    });
    await page.goto('http://pos.test/orders.html?tenant=fixture');
    await page.evaluate(() => {
      window.currentTenantFeatures = ['dine_in'];
      window.IS_NATIVE_APP = true;
      syncPlatformClasses();
      PrinterService.getPrintCapabilities = () => ({ stickers: true, bill: true });
      latestOrders = ['ACCEPTED', 'DONE'].map((status, i) => ({
        key: `tablet-${i}`, displayKey: 'DEMO1009-T001', customer: 'Duc Cao', status,
        diningOption: i ? 'dine_in' : 'takeaway', tableNumber: i ? 'A1' : '',
        content: '1份 x 雞胸肉 $60\n1份 x 無骨鳳爪 $50',
        items: [{ name: '雞胸肉', quantity: 1, price: 60 }, { name: '無骨鳳爪', quantity: 1, price: 50 }],
        subtotal: 110, total: 110, time: '15:05', createdAt: Date.now()
      }));
      initSidebarState();
      initLiveMobileView();
      renderAll();
    });
    await check(page);
  } finally { await browser.close(); }
}

async function configure(page, viewport, lang, mode) {
  await page.setViewportSize(viewport);
  await page.evaluate(({ lang, mode }) => {
    closeModal(); selectPOSTextSize(mode); setLanguage(lang); switchTab('live'); renderAll();
  }, { lang, mode });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(animation => animation.effect.getTiming().iterations !== Infinity)
    .map(animation => animation.finished.catch(() => {}))));
}

async function snapshot(page, name) {
  if (!process.env.POS_DISPLAY_SCREENSHOT_DIR) return;
  fs.mkdirSync(process.env.POS_DISPLAY_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.POS_DISPLAY_SCREENSHOT_DIR, `${name}.png`) });
}

test('tablet live cards keep ordinary order identifiers on one line beside the action', async () => {
  await withPOS(async page => {
    for (const viewport of viewports) for (const lang of ['zh-TW', 'vi']) for (const mode of ['auto', 'standard', 'extra-large']) {
      await configure(page, viewport, lang, mode);
      const metrics = await page.locator('#list-left .tile').first().evaluate(tile => {
        const key = tile.querySelector('.tile-order-key');
        const keyStyle = getComputedStyle(key);
        const button = tile.querySelector('button').getBoundingClientRect();
        const info = tile.querySelector('.tile-count-row').getBoundingClientRect();
        return { keyHeight: key.getBoundingClientRect().height,
          singleLineHeight: parseFloat(keyStyle.lineHeight) + parseFloat(keyStyle.paddingTop) + parseFloat(keyStyle.paddingBottom),
          overflow: key.scrollWidth > key.clientWidth + 1,
          buttonHeight: button.height, buttonWidth: button.width,
          overlaps: button.left < info.right && button.top < info.bottom,
          tileHeight: tile.getBoundingClientRect().height };
      });
      if (viewport.width === 960 && lang === 'zh-TW' && mode === 'auto') await snapshot(page, 'tablet-live');
      assert(metrics.keyHeight <= metrics.singleLineHeight + 1, `${viewport.width}/${lang}/${mode}: ordinary order ID wraps: ${JSON.stringify(metrics)}`);
      assert(!metrics.overflow && !metrics.overlaps);
      assert(metrics.buttonHeight >= 48 && metrics.buttonWidth >= 48);
    }
  });
});

test('reference cards align identity, timing and totals in three rows with the action on the right', async () => {
  await withPOS(async page => {
    await page.evaluate(() => {
      const base = latestOrders[0];
      latestOrders = [
        ['Duc Cao', 'B0823-8BRG', 'ACCEPTED', '1', 4, 498],
        ['Duc Cao', 'B0823-9T4W', 'ACCEPTED', 'A2', 2, 240],
        ['Evan', 'B0823-4SG3', 'ACCEPTED', '7', 1, 180],
        ['Evan', 'B0823-MW7C', 'ACCEPTED', '4', 1, 57],
        ['Evan', 'B0823-A6G5', 'DONE', '5', 1, 80],
        ['Evan', 'B0823-MMRL', 'DONE', '5', 2, 185],
        ['Evan', 'B0823-U87M', 'DONE', '', 1, 80],
      ].map(([customer, displayKey, status, tableNumber, round_count, total], index) => ({
        ...base, key: `reference-${index}`, customer, displayKey, status, tableNumber, round_count, total,
        diningOption: tableNumber ? 'dine_in' : 'takeaway', createdAt: Date.now() - 1573 * 3600000
      }));
    });
    await configure(page, { width: 1512, height: 861 }, 'zh-TW', 'auto');
    const cards = await page.locator('.tile').evaluateAll(tiles => tiles.map(tile => {
      const rect = selector => tile.querySelector(selector).getBoundingClientRect().toJSON();
      return { top: rect('.tile-top'), name: rect('.tile-customer'), key: rect('.tile-order-key'),
        badge: rect('.tile-badge'), meta: rect('.tile-meta-row'), count: rect('.tile-count-row'),
        price: rect('.tile-price'), eta: rect('.tile-eta'), button: rect('.tile-action-btn'),
        height: tile.getBoundingClientRect().height, bounds: tile.getBoundingClientRect().toJSON() };
    }));
    for (const card of cards) {
      const middle = r => r.top + r.height / 2;
      assert(Math.abs(middle(card.name) - middle(card.key)) < 1);
      assert(Math.abs(middle(card.badge) - middle(card.key)) < 1, 'Identity and badges share the first row');
      assert(card.meta.top >= card.top.bottom && card.count.top >= card.meta.bottom, 'Timing and total follow identity');
      assert(Math.abs(card.price.right - card.eta.right) < 4, 'Total aligns with the waiting time');
      assert(card.button.left >= card.meta.right && card.button.left >= card.count.right - 1, 'Action occupies right dock beside info');
      assert(Math.abs(middle(card.button) - middle(card.bounds)) < 12, 'Action is vertically centered in the card');
      assert(card.button.height >= 48 && card.button.width >= 48, 'Action maintains touch targets');
      assert(card.height < 150, 'Normal reference cards remain compact');
    }
    await snapshot(page, 'reference-live-1512');
    for (const viewport of [...viewports, { width: 320, height: 700 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      for (const lang of ['zh-TW', 'vi']) for (const mode of ['auto', 'extra-large']) {
        await configure(page, viewport, lang, mode);
        const overflow = await page.locator('.live-panel:not([hidden]) .tile').evaluateAll(tiles => tiles.flatMap(tile => {
          const bounds = tile.getBoundingClientRect();
          return [...tile.querySelectorAll('.tile-top,.tile-meta-row,.tile-count-row,.tile-order-key,.tile-customer,.tile-badge,.tile-eta,.tile-price,button')]
            .filter(node => {
              const rect = node.getBoundingClientRect();
              return rect.width && (node.scrollWidth > node.clientWidth + 1 || rect.left < bounds.left - 1 || rect.right > bounds.right + 1);
            }).map(node => node.className);
        }));
        assert.deepEqual(overflow, [], `${viewport.width}/${lang}/${mode}: no clipped reference card content`);
        if (viewport.width <= 680) {
          const action = await page.locator('.live-panel:not([hidden]) .tile').first().evaluate(tile => {
            const button = tile.querySelector('button').getBoundingClientRect();
            const count = tile.querySelector('.tile-count-row').getBoundingClientRect();
            return { button: button.toJSON(), count: count.toJSON() };
          });
          assert(action.button.top >= action.count.bottom && action.button.width >= action.count.width - 1,
            'Phone actions fill the row below the order information');
        }
        if (lang === 'zh-TW' && mode === 'auto') await snapshot(page, `reference-live-${viewport.width}`);
      }
    }
  });
});

test('tablet order details keep status and actions beside items; phones retain one column', async () => {
  await withPOS(async page => {
    for (const viewport of [...viewports, { width: 390, height: 844 }]) for (const lang of ['zh-TW', 'vi']) for (const mode of ['auto', 'extra-large']) {
      await configure(page, viewport, lang, mode);
      await page.evaluate(() => openReview('tablet-0'));
      const layout = await page.evaluate(() => {
        const main = document.querySelector('.order-detail-main-col').getBoundingClientRect();
        const side = document.querySelector('.order-detail-side-col').getBoundingClientRect();
        const grid = document.querySelector('.order-detail-grid');
        const print = document.querySelector('.review-item-print-btn').getBoundingClientRect();
        return { main: main.toJSON(), side: side.toJSON(), print: print.toJSON(),
          overflow: grid.scrollWidth > grid.clientWidth + 1 };
      });
      if (viewport.width === 960 && lang === 'zh-TW' && mode === 'auto') await snapshot(page, 'tablet-detail');
      assert(!layout.overflow, `${viewport.width}/${lang}/${mode}: detail overflows`);
      assert(layout.print.width >= 48 && layout.print.height >= 48, 'Native sticker action remains usable');
      if (viewport.width >= 768) {
        assert(Math.abs(layout.main.top - layout.side.top) < 1 && layout.side.left >= layout.main.right,
          `${viewport.width}/${lang}/${mode}: tablet detail collapsed: ${JSON.stringify(layout)}`);
        assert(layout.main.width > layout.side.width, 'Items retain the larger column');
      } else {
        assert(layout.side.top >= layout.main.bottom, 'Phone detail remains stacked');
      }
    }
  });
});
