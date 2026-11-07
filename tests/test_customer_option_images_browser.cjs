const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const chromium = require(process.env.PLAYWRIGHT_MODULE || 'playwright')[process.env.MENU_QA_BROWSER || 'chromium'];
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const photo = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#166534"/></svg>';
const option = (id, extra = {}) => ({ id, name: id, price: 0, productId: id, ...extra });
const group = (id, items, extra = {}) => ({ id, name: id, minSelection: 0, maxSelection: 4, allowRepeats: true, eligibleItems: items, ...extra });
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined }); });
after(async () => { await browser?.close(); });

async function fixture(page, groups, lang = 'vi') {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/index.css"><link rel="stylesheet" href="/css/client-option-groups.css"></head><body><button id="launch">Open</button></body></html>` });
    if (['/index.css', '/css/client-option-groups.css'].includes(url.pathname))
      return route.fulfill({ contentType: 'text/css', body: read(url.pathname.slice(1)) });
    if (url.pathname.endsWith('.jpg')) {
      await gate;
      if (url.pathname === '/missing.jpg') return route.fulfill({ status: 404, body: '' });
      if (url.pathname === '/invalid.jpg') return route.fulfill({ contentType: 'text/plain', body: 'This is not an image' });
      return route.fulfill({ contentType: 'image/svg+xml', body: photo });
    }
    return route.abort();
  });
  await page.goto('https://menu.test/fixture');
  await page.evaluate(({ groups, lang }) => {
    window.currentLocale = lang;
    window.cart = {};
    window.bundleCartData = {};
    window.customizeData = {};
    window.WORKER_BASE = 'https://worker.test';
    window.rule = { version: 3, groups };
    window.resolveCatalogItem = () => ({ targetItem: { price: 100 }, bundleRule: rule });
    window.updateTotal = () => {};
    window.imageChecks = [];
    const NativeImage = window.Image;
    window.Image = function (...args) {
      const image = new NativeImage(...args);
      imageChecks.push(image);
      return image;
    };
  }, { groups, lang });
  await page.addScriptTag({ content: read('js/client-option-groups.js') });
  await page.evaluate(() => { document.getElementById('launch').onclick = () => UnifiedOptions.open('food', 'Meal'); });
  return { release, errors };
}

async function positions(page) {
  return page.locator('.bundle-item-info > div > span').evaluateAll(nodes =>
    nodes.map(node => ({ name: node.textContent, x: node.getBoundingClientRect().x })));
}
function stable(before, after) {
  assert.deepEqual(after.map(row => row.name), before.map(row => row.name));
  for (let i = 0; i < before.length; i++)
    assert.ok(Math.abs(before[i].x - after[i].x) <= 1, `${before[i].name}: ${before[i].x} -> ${after[i].x}`);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
  for (const lang of ['vi', 'zh-TW']) {
    test(`option text stays fixed after image checks: ${viewport.width}px ${lang}`, async () => {
      const page = await browser.newPage({ viewport, hasTouch: true });
      try {
        const app = await fixture(page, [group('Sides', [
          option('No photo'), option('Blank photo', { imageUrl: ' ' }),
          option('Missing photo', { imageUrl: '/missing.jpg' }),
          option('Invalid photo', { imageUrl: '/invalid.jpg' }),
          option('With photo', { imageUrl: '/valid.jpg' }),
          option('Shared photo', { imageUrl: '/valid.jpg' }),
        ])], lang);
        await page.locator('#launch').click();
        await page.locator('.uoc-image-loading').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.bundle-item-card').count(), 0);
        assert.equal(await page.locator('.uoc-body').getAttribute('aria-busy'), 'true');
        assert.equal(await page.locator('[data-confirm]').isDisabled(), true);
        assert.equal(await page.locator('.uoc-image-status').textContent(), lang === 'vi' ? 'Đang tải tùy chọn…' : '載入選項中…');
        assert.equal(await page.evaluate(() => imageChecks.length), 3, 'duplicate URLs share a single check');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await page.locator('.uoc-image-spinner').evaluate(el => getComputedStyle(el).animationName), 'none');
        // Isolate image layout from the sheet's existing entrance transform.
        await page.evaluate(() => Promise.all(document.getAnimations()
          .filter(animation => animation.effect.getTiming().iterations !== Infinity)
          .map(animation => animation.finished.catch(() => {}))));
        const artifacts = process.env.OPTION_IMAGES_ARTIFACT_DIR;
        if (artifacts && lang === 'vi' && viewport.width !== 1024) {
          fs.mkdirSync(artifacts, { recursive: true });
          await page.screenshot({ path: path.join(artifacts, `loading-${viewport.width}.png`) });
        }
        app.release();
        await page.locator('.uoc-image-loading').waitFor({ state: 'detached' });
        assert.equal(await page.locator('.bundle-item-card').count(), 6);
        assert.equal(await page.locator('.uoc-item-image').count(), 2);
        for (const name of ['No photo', 'Blank photo', 'Missing photo', 'Invalid photo'])
          assert.equal(await page.locator('.bundle-item-card').filter({ hasText: name }).locator('img').count(), 0);
        assert.equal(await page.locator('.uoc-item-image').first().evaluate(el => el.getBoundingClientRect().width), 48);
        const before = await positions(page);
        if (artifacts && lang === 'vi' && viewport.width !== 1024)
          await page.screenshot({ path: path.join(artifacts, `ready-${viewport.width}.png`) });
        await page.waitForTimeout(120);
        stable(before, await positions(page));
        await page.locator('[data-add="0"][data-option="0"]').click();
        assert.equal(await page.locator('.uoc-image-loading').count(), 0);
        assert.equal(await page.evaluate(() => imageChecks.length), 3);
        stable(before, await positions(page));
        await page.locator('[data-note]').fill('Ít sốt');
        // Capture the transient loading state in the same browser task as the
        // error; separate protocol calls can cross the 100 ms recovery timer.
        const recovering = await page.locator('.uoc-item-image').first().evaluate(image => {
          image.dispatchEvent(new Event('error'));
          return {
            loading: (document.querySelector('.uoc-image-loading')?.getBoundingClientRect().height || 0) > 0,
            cards: document.querySelectorAll('.bundle-item-card').length
          };
        });
        assert.equal(recovering.loading, true);
        assert.equal(recovering.cards, 0, 'late failures hide the list before changing its layout');
        await page.locator('.uoc-image-loading').waitFor({ state: 'detached' });
        assert.equal(await page.locator('.uoc-item-image').count(), 0);
        assert.equal(await page.locator('[data-note]').inputValue(), 'Ít sốt');
        assert.equal(await page.locator('[data-minus="0"][data-option="0"]').count(), 1);
        const recovered = await positions(page);
        await page.waitForTimeout(120);
        stable(recovered, await positions(page));
        assert.deepEqual(app.errors, []);
      } finally { await page.close(); }
    });
  }
}

test('pending images cannot overwrite another step or a newly opened popup', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    const app = await fixture(page, [
      group('First', [option('First choice')]),
      group('Photo step', [option('Pending photo', { imageUrl: '/valid.jpg' })]),
      group('Last', [option('Last choice')]),
    ]);
    await page.locator('#launch').click();
    assert.equal(await page.locator('.uoc-image-loading').count(), 0);
    assert.equal(await page.evaluate(() => imageChecks.length), 0);
    await page.locator('[data-add="0"][data-option="0"]').click();
    await page.locator('[data-note]').fill('Giữ ghi chú');
    await page.locator('[data-step="1"]').click();
    await page.locator('.uoc-image-loading').waitFor({ state: 'visible' });
    await page.locator('[data-step="2"]').click();
    assert.equal(await page.locator('.uoc-image-loading').count(), 0);
    assert.equal(await page.locator('[data-note]').inputValue(), 'Giữ ghi chú');
    app.release();
    await page.waitForFunction(() => imageChecks[0].complete);
    await page.waitForTimeout(50);
    assert.match(await page.locator('.uoc-body').textContent(), /Last choice/);
    await page.locator('[data-step="0"]').click();
    assert.equal(await page.locator('[data-minus="0"][data-option="0"]').count(), 1);
    await page.locator('[data-step="1"]').click();
    assert.equal(await page.locator('.uoc-image-loading').count(), 0, 'returning to a checked group is immediate');
    await page.locator('[data-close]').click();
    await page.evaluate(() => { rule.groups = [{ id: 'new', name: 'New group', minSelection: 0, maxSelection: 1, eligibleItems: [{ id: 'new-option', name: 'New option' }] }]; });
    await page.locator('#launch').click();
    assert.match(await page.locator('.uoc-body').textContent(), /New option/);
    assert.equal(await page.locator('.uoc-item-image').count(), 0);
    assert.deepEqual(app.errors, []);
  } finally { await page.close(); }
});

test('image timeout reveals text without a slot and reopening retries failed images', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    const app = await fixture(page, [group('Slow', [option('Slow photo', { imageUrl: '/slow.jpg' })])]);
    const started = Date.now();
    await page.locator('#launch').click();
    await page.locator('.uoc-image-loading').waitFor({ state: 'visible' });
    await page.locator('.uoc-image-loading').waitFor({ state: 'detached', timeout: 3500 });
    assert.ok(Date.now() - started < 3200, 'network waits are bounded by the 2-second image deadline');
    assert.equal(await page.locator('.uoc-item-image').count(), 0);
    const before = await positions(page);
    app.release();
    await page.waitForTimeout(200);
    stable(before, await positions(page));
    assert.equal(await page.locator('.uoc-item-image').count(), 0, 'a late success cannot insert a thumbnail');
    await page.locator('[data-close]').click();
    await page.locator('#launch').click();
    await page.locator('.uoc-image-loading').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.uoc-item-image').count(), 1);
    assert.equal(await page.evaluate(() => imageChecks.length), 2);
    assert.deepEqual(app.errors, []);
  } finally { await page.close(); }
});

test('closing during preflight prevents old results from replacing a new popup', async () => {
  const page = await browser.newPage();
  try {
    const app = await fixture(page, [group('Old group', [option('Old photo', { imageUrl: '/valid.jpg' })])]);
    await page.locator('#launch').click();
    await page.locator('.uoc-image-loading').waitFor({ state: 'visible' });
    await page.locator('[data-close]').click();
    await page.evaluate(() => { rule.groups = [{ id: 'new', name: 'New group', minSelection: 0, maxSelection: 1, eligibleItems: [{ id: 'fresh', name: 'Fresh option' }] }]; });
    await page.locator('#launch').click();
    app.release();
    await page.waitForTimeout(200);
    assert.match(await page.locator('.uoc-body').textContent(), /Fresh option/);
    assert.equal(await page.locator('.uoc-image-loading').count(), 0);
    assert.equal(await page.locator('.uoc-item-image').count(), 0);
    await page.locator('[data-close]').click();
    assert.equal(await page.locator('#launch').evaluate(el => el.inert), false);
    assert.deepEqual(app.errors, []);
  } finally { await page.close(); }
});

test('nested image checks preserve parent choices and cannot overwrite the parent on Back', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    const app = await fixture(page, [group('Parent', [option('Parent choice', {
      optionGroups: [group('Child', [option('Child photo', { imageUrl: '/valid.jpg' })], { minSelection: 1 })],
    })])]);
    await page.locator('#launch').click();
    assert.equal(await page.evaluate(() => imageChecks.length), 0, 'nested photos are not loaded before their group is opened');
    await page.locator('[data-add="0"][data-option="0"]').click();
    await page.locator('.uoc-image-loading').waitFor({ state: 'visible' });
    await page.locator('[data-back]').click();
    assert.equal(await page.locator('.uoc-image-loading').count(), 0);
    assert.equal(await page.locator('[data-minus="0"][data-option="0"]').count(), 1);
    app.release();
    await page.waitForFunction(() => imageChecks[0].complete);
    await page.waitForTimeout(50);
    assert.match(await page.locator('.uoc-body').textContent(), /Parent choice/);
    assert.equal(await page.locator('.uoc-item-image').count(), 0);
    await page.locator('[data-child="0.0"]').click();
    assert.equal(await page.locator('.uoc-image-loading').count(), 0);
    assert.equal(await page.locator('.uoc-item-image').count(), 1);
    assert.deepEqual(app.errors, []);
  } finally { await page.close(); }
});

test('a decode failure omits the image and Escape closes a loading popup', async () => {
  const page = await browser.newPage();
  try {
    const app = await fixture(page, [group('Photo', [option('Undecodable', { imageUrl: '/valid.jpg' })])]);
    await page.evaluate(() => {
      const ImageFactory = window.Image;
      window.Image = function () {
        const image = new ImageFactory();
        image.decode = () => Promise.reject(new Error('Decode failed'));
        return image;
      };
    });
    await page.locator('#launch').click();
    await page.locator('.uoc-image-loading').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#unified-option-modal').isVisible(), false);
    app.release();
    await page.locator('#launch').click();
    await page.locator('.uoc-image-loading').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.uoc-item-image').count(), 0);
    assert.match(await page.locator('.uoc-body').textContent(), /Undecodable/);
    assert.deepEqual(app.errors, []);
  } finally { await page.close(); }
});
