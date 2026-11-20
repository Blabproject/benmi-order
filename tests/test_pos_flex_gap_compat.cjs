const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const readDist = pathname => fs.readFileSync(path.join(root, 'dist', pathname), 'utf8');

async function openSettingsInPOS(page) {
  if (!fs.existsSync(path.join(root, 'dist/.vite/manifest.json'))) {
    execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, stdio: 'inherit' });
  }
  await page.route('**/*', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/orders.html') {
      return route.fulfill({
        contentType: 'text/html',
        body: readDist('orders.html').replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '')
      });
    }
    if (/^\/(js|css|assets)\/[\w.-]+$/.test(pathname)) {
      return route.fulfill({
        contentType: pathname.endsWith('.css') ? 'text/css' : 'text/javascript',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: readDist(pathname.slice(1))
      });
    }
    return route.fulfill({ contentType: 'application/json', body: '{}' });
  });
  await page.addInitScript(() => {
    window.setInterval = () => 0;
    window.fetch = async () => ({ ok: true, headers: new Headers(), json: async () => ({}) });
  });
  await page.goto('http://pos.test/orders.html?tenant=fixture');
  await page.evaluate(() => {
    window.IS_NATIVE_APP = true;
    syncPlatformClasses();
    switchTab('settings');
    switchSettingTab('setting-card-store-pairing');
  });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function settle(page) {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(() => Promise.all(
    document.getAnimations()
      .filter(a => a.effect?.getTiming?.().iterations !== Infinity)
      .map(a => a.finished.catch(() => {}))
  ));
}

async function measureSettingsSpacing(page) {
  return page.evaluate(() => {
    const activeToc = document.getElementById('toc-item-store-pairing');
    const iconBox = activeToc.querySelector('.toc-icon-box').getBoundingClientRect();
    const label = activeToc.querySelector('.toc-item-label').getBoundingClientRect();
    const visibleTocs = [...document.querySelectorAll('.settings-toc-item')].filter(
      el => getComputedStyle(el).display !== 'none'
    );
    const prevToc = visibleTocs[visibleTocs.length - 2].getBoundingClientRect();
    const activeRect = visibleTocs[visibleTocs.length - 1].getBoundingClientRect();
    const pinHeading = document.querySelector('#store-pin-form > div').getBoundingClientRect();
    const pinField = document.querySelector('#store-pin-form .store-pin-field').getBoundingClientRect();
    const statusDot = document.querySelector('#setting-card-store-pairing [style*="border-radius: 50%"]').getBoundingClientRect();
    const statusText = document.getElementById('i18n-pairing-status-connected').getBoundingClientRect();
    return {
      hasNoFlexGapClass: document.documentElement.classList.contains('no-flex-gap'),
      tocIconToLabelGap: Math.round((label.left - iconBox.right) * 10) / 10,
      tocVerticalGap: Math.round((activeRect.top - prevToc.bottom) * 10) / 10,
      pinFormVerticalGap: Math.round((pinField.top - pinHeading.bottom) * 10) / 10,
      statusDotToTextGap: Math.round((statusText.left - statusDot.right) * 10) / 10
    };
  });
}

test('Settings TOC and pairing card keep exact spacing in modern WebView and WebView < 84 fallback', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    await openSettingsInPOS(page);

    const desktopModern = await measureSettingsSpacing(page);
    assert.equal(desktopModern.hasNoFlexGapClass, false);
    assert.equal(desktopModern.tocIconToLabelGap, 11);
    assert.equal(desktopModern.tocVerticalGap, 6);
    assert.equal(desktopModern.pinFormVerticalGap, 16);
    assert.equal(desktopModern.statusDotToTextGap, 8);

    await page.setViewportSize({ width: 800, height: 600 });
    await settle(page);
    const narrowModern = await measureSettingsSpacing(page);
    assert.equal(narrowModern.tocIconToLabelGap, 9);
    assert.equal(narrowModern.tocVerticalGap, 6);
    assert.equal(narrowModern.pinFormVerticalGap, 16);
    assert.equal(narrowModern.statusDotToTextGap, 8);

    // Simulate WebView < 84 ignoring Flexbox gap while keeping CSS margins
    await page.addStyleTag({
      content: `
        .settings-toc-item, .settings-toc-list,
        .store-pin-form, .store-pin-field, .store-pin-input-row { gap: 0px !important; }
      `
    });
    await page.evaluate(() => document.documentElement.classList.add('no-flex-gap'));
    await settle(page);

    const narrowLegacy = await measureSettingsSpacing(page);
    assert.equal(narrowLegacy.tocIconToLabelGap, 9);
    assert.equal(narrowLegacy.tocVerticalGap, 6);
    assert.equal(narrowLegacy.pinFormVerticalGap, 16);
    assert.equal(narrowLegacy.statusDotToTextGap, 8);
  } finally {
    await browser.close();
  }
});
