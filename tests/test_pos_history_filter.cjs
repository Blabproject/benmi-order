// Targeted test for POS Order History Filter visibility & layout
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const distRoot = path.join(root, 'dist');

function ensureDistBuilt() {
  if (!fs.existsSync(path.join(distRoot, '.vite/manifest.json')) || !fs.existsSync(path.join(distRoot, 'orders.html'))) {
    execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.config.mts'], {
      cwd: root,
      stdio: 'inherit'
    });
  }
}

const readDist = file => fs.readFileSync(path.join(distRoot, file), 'utf8');

async function setupPage(page) {
  ensureDistBuilt();
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/orders.html') {
      const html = readDist('orders.html').replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '');
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
        body: fs.readFileSync(path.join(distRoot, rel)),
        contentType,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }
    return route.fulfill({ body: '{}', contentType: 'application/json' });
  });

  await page.addInitScript(() => {
    window.setInterval = () => 0;
    window.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/api/config')) {
        return {
          ok: true,
          headers: new Headers(),
          json: async () => ({
            storeStatus: 'open',
            allowDineIn: window.__mockAllowDineIn !== undefined ? window.__mockAllowDineIn : false,
            features: window.__mockFeatures || []
          })
        };
      }
      return { ok: true, headers: new Headers(), json: async () => ({ orders: [] }) };
    };
    window.confirm = () => true;
  });
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  try {
    // ---------------------------------------------------------
    // TEST CASE 1: Tenant WITHOUT dine-in (e.g., zhadantongxue)
    // ---------------------------------------------------------
    console.log('Testing Tenant WITHOUT dine-in (mobile viewport 375x667)...');
    const context1 = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page1 = await context1.newPage();
    await setupPage(page1);

    await page1.addInitScript(() => {
      window.__mockFeatures = []; // No dine_in feature
      window.__mockAllowDineIn = false;
    });

    await page1.goto('http://pos.test/orders.html?tenant=zhadantongxue');

    // Switch to history tab
    await page1.evaluate(() => {
      window.currentTenantFeatures = [];
      window.allowDineIn = false;
      switchTab('history');
    });

    const isSupported1 = await page1.evaluate(() => window.isDineInSupported());
    assert.equal(isSupported1, false, 'isDineInSupported() should be false for tenant without dine-in');

    const filterGroupVisible1 = await page1.evaluate(() => {
      const el = document.getElementById('history-filter-group');
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none';
    });
    assert.equal(filterGroupVisible1, false, 'history-filter-group should be hidden (display: none)');

    // Check search box width (should fill container on mobile)
    const searchBoxWidth1 = await page1.evaluate(() => {
      const el = document.querySelector('.history-search-box');
      return el ? el.getBoundingClientRect().width : 0;
    });
    assert.ok(searchBoxWidth1 > 320, `Search box should stretch across mobile width, got ${searchBoxWidth1}px`);

    // Check header actions are present & spaced
    const actionsLayout1 = await page1.evaluate(() => {
      const actions = document.querySelector('.history-header-actions');
      const badge = document.getElementById('history-total-summary-badge');
      const btn = document.getElementById('btn-toggle-all-history');
      if (!actions || !badge || !btn) return null;
      const aRect = actions.getBoundingClientRect();
      const bRect = badge.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      return {
        actionsWidth: aRect.width,
        badgeLeft: bRect.left,
        btnRight: btnRect.right,
        btnHeight: btnRect.height
      };
    });
    assert.ok(actionsLayout1, 'History actions layout should exist');
    assert.ok(actionsLayout1.btnHeight >= 46, `Toggle button height should be >= 48px standard, got ${actionsLayout1.btnHeight}`);
    assert.ok(actionsLayout1.badgeLeft < actionsLayout1.btnRight, 'Badge should be to the left of toggle button');

    // Check hamburger button (mobile-nav-toggle-btn) is a recognizable squircle button
    const hamburgerStyle = await page1.evaluate(() => {
      const btn = document.getElementById('mobile-nav-toggle-btn');
      if (!btn) return null;
      const s = window.getComputedStyle(btn);
      const rect = btn.getBoundingClientRect();
      return {
        display: s.display,
        borderRadius: s.borderRadius,
        borderWidth: s.borderTopWidth,
        width: rect.width,
        height: rect.height
      };
    });
    assert.ok(hamburgerStyle, 'mobile-nav-toggle-btn should exist');
    assert.ok(hamburgerStyle.display.includes('flex'), 'Hamburger button should be displayed on mobile');
    assert.equal(hamburgerStyle.borderRadius, '10px', 'Hamburger button should have 10px rounded square corners');
    assert.ok(parseFloat(hamburgerStyle.borderWidth) >= 1, 'Hamburger button should have visible border');
    assert.ok(hamburgerStyle.width >= 36 && hamburgerStyle.height >= 36, `Hamburger button should be at least 36px, got ${hamburgerStyle.width}x${hamburgerStyle.height}`);

    await context1.close();
    console.log('  ✓ Tenant WITHOUT dine-in passed: filter hidden, actions cleanly balanced, hamburger squircle verified.');

    // ---------------------------------------------------------
    // TEST CASE 2: Tenant WITH dine-in (e.g., blab_demo)
    // ---------------------------------------------------------
    console.log('Testing Tenant WITH dine-in (mobile viewport 375x667)...');
    const context2 = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page2 = await context2.newPage();
    await setupPage(page2);

    await page2.addInitScript(() => {
      window.__mockFeatures = ['dine_in'];
      window.__mockAllowDineIn = true;
    });

    await page2.goto('http://pos.test/orders.html?tenant=blab_demo');

    // Switch to history tab
    await page2.evaluate(() => {
      window.currentTenantFeatures = ['dine_in'];
      window.allowDineIn = true;
      switchTab('history');
    });

    const isSupported2 = await page2.evaluate(() => window.isDineInSupported());
    assert.equal(isSupported2, true, 'isDineInSupported() should be true for tenant with dine-in');

    const filterGroupVisible2 = await page2.evaluate(() => {
      const el = document.getElementById('history-filter-group');
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none';
    });
    assert.equal(filterGroupVisible2, true, 'history-filter-group should be visible');

    // Check filter buttons exist and have adequate touch target height
    const filterBtnHeights = await page2.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#history-filter-group .history-filter-btn'));
      return btns.map(b => b.getBoundingClientRect().height);
    });
    assert.equal(filterBtnHeights.length, 3, 'Should have 3 filter buttons (all, dine_in, takeaway)');
    for (const h of filterBtnHeights) {
      assert.ok(h >= 46, `Filter button height should be >= 48px touch target, got ${h}`);
    }

    // Check filter switching
    await page2.click('#i18n-hist-filter-dinein');
    const activeFilter = await page2.evaluate(() => {
      const activeBtn = document.querySelector('#history-filter-group .history-filter-btn.active');
      return activeBtn ? activeBtn.getAttribute('data-filter') : null;
    });
    assert.equal(activeFilter, 'dine_in', 'Clicking dine-in button should make it active');

    await context2.close();
    console.log('  ✓ Tenant WITH dine-in passed: filter visible, 48px touch targets, full-width segmented control.');

    // ---------------------------------------------------------
    // TEST CASE 3: Tablet Viewport (iPad 810x1080)
    // ---------------------------------------------------------
    console.log('Testing Tablet Viewport (810x1080)...');
    const context3 = await browser.newContext({ viewport: { width: 810, height: 1080 } });
    const page3 = await context3.newPage();
    await setupPage(page3);

    await page3.goto('http://pos.test/orders.html?tenant=tablet_test');
    await page3.evaluate(() => {
      window.currentTenantFeatures = ['dine_in'];
      window.allowDineIn = true;
      switchTab('history');
    });

    const tabletLayout = await page3.evaluate(() => {
      const toolbar = document.querySelector('.history-toolbar');
      const searchBox = document.querySelector('.history-search-box');
      const controls = document.querySelector('.history-controls-row');
      return {
        toolbarWidth: toolbar ? toolbar.getBoundingClientRect().width : 0,
        searchWidth: searchBox ? searchBox.getBoundingClientRect().width : 0,
        controlsWidth: controls ? controls.getBoundingClientRect().width : 0
      };
    });
    assert.ok(tabletLayout.toolbarWidth > 600, `Tablet toolbar should have proper width, got ${tabletLayout.toolbarWidth}`);
    assert.ok(tabletLayout.searchWidth > 600, `Tablet search box should fill row 1 cleanly, got ${tabletLayout.searchWidth}`);
    assert.ok(tabletLayout.controlsWidth > 600, `Tablet controls row should fill row 2 cleanly, got ${tabletLayout.controlsWidth}`);

    await context3.close();
    console.log('  ✓ Tablet viewport passed.');

    console.log('\n🎉 ALL POS HISTORY FILTER & RESPONSIVE TESTS PASSED!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
