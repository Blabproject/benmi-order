const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const browserName = process.env.MENU_QA_BROWSER || 'chromium';
const browserType = require('playwright')[browserName];

let server, viteCache;
before(async () => {
  const { createServer } = await import('vite');
  viteCache = fs.mkdtempSync(path.join(os.tmpdir(), 'benmi-pos-schedule-vite-'));
  server = await createServer({ cacheDir: viteCache, logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
});
after(async () => {
  await server?.close();
  if (viteCache) fs.rmSync(viteCache, { recursive: true, force: true });
});

const artifacts = path.resolve(process.env.MENU_SHIFTS_ARTIFACTS || 'artifacts/menu-shifts-20261118');
for (const [locale, width] of [['vi', 768], ['zh-TW', 1024], ['vi', 390]]) {
  test(`shift editor validates local ranges and saves its own revisioned draft (${locale}, ${width})`, async t => {
    fs.mkdirSync(artifacts, { recursive: true });
    const browser = await browserType.launch(); t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width, height: 1024 }, hasTouch: true });
    page.setDefaultTimeout(8000);
    const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
    const hours = {}; for (let d = 1; d <= 5; d++) hours[d] = [{ start: '11:00', end: d === 5 ? '19:00' : '22:30' }];
    const shifts = [ ['lunch', '午餐', '11:00', '13:30', 5], ['dinner', '晚餐', '16:30', '19:00', 5], ['late', '宵夜', '21:00', '22:30', 4] ].map(([id, name, startTime, endTime, n]) => ({ id, name, shiftType: 'operating', isActive: true, windows: Array.from({ length:n }, (_, i) => ({ id: `${id}-${i}`, dayOfWeek:i+1, startTime, endTime })) }));
    const writes=[];
    const tenant = { id: 'store', name: 'Store', features: ['menu_schedule'], operatingShifts: shifts, operatingHours: hours };
    const catalog = [{
      id: 'main', slug: 'main', name: 'Main', items: [{ id: 'food', name: 'Rice', price: 50 }]
    }];
    const assignments = [];
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,PATCH,PUT' };
    await page.route('**/api/**', async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const respond = json => route.fulfill({ headers, json });
      if (pathname === '/api/menu/shifts') {
        if (request.method() === 'PUT') {
          const body = request.postDataJSON();
          writes.push(body);
          return respond({ operatingHours: hours, operatingShifts: body.operatingShifts, scheduleRevision: 4 });
        }
        return respond({ operatingHours: hours, operatingShifts: shifts, scheduleRevision: 3 });
      }
      if (pathname === '/api/menu/schedule') {
        assignments.push(request.postDataJSON());
        return respond({ success: true });
      }
      if (pathname === '/api/tenant/bootstrap') return respond({ tenant, menuComplete: true, catalog, modifiers: [] });
      if (pathname === '/api/menu/modifier-library') return respond({ complete: true, groups: [] });
      if (pathname === '/api/config') return respond({ tenantId: 'store', ...tenant, storeStatus: 'open' });
      if (pathname === '/api/orders' || pathname === '/api/image_list') return respond([]);
      if (pathname === '/api/orders/events') return route.fulfill({ headers, status: 200, contentType: 'text/event-stream', body: '' });
      return respond({});
    });
    await page.addInitScript(locale => localStorage.setItem('benmi_lang', locale), locale);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/orders.html?tenant=store#menu-schedule`);
    await page.locator('#i18n-btn-start-shift').click();
    await page.locator('.ms-title').waitFor();
    const help = page.locator('.ms-help-btn');
    await help.click();
    const popover = await page.locator('#ms-title-help-popover').boundingBox();
    assert.ok(popover.x >= 0 && popover.x + popover.width <= width);
    await help.press('Escape');
    assert.equal(await help.getAttribute('aria-expanded'), 'false');
    await page.locator('.ms-expand-btn').first().click();
    const itemCell = page.locator('[data-ms-focus="item:main:food:lunch"]');
    const checkbox = await itemCell.boundingBox();
    assert.equal(await page.locator('.ms-title-row').evaluate(el => getComputedStyle(el).display), 'flex');
    await page.screenshot({ path: path.join(artifacts, `matrix-${browserName}-${locale}-${width}.png`) });
    assert.ok(checkbox.width >= 48 && checkbox.height >= 48);
    await itemCell.press('Space');
    assert.equal(await itemCell.isChecked(), false);
    assert.equal(await itemCell.evaluate(el => document.activeElement === el), true);
    const policy = page.locator('.ms-outside-options').getByRole('radio');
    const hide = policy.nth(0), show = policy.nth(1);
    assert.equal(await show.isChecked(), true);
    await show.press('ArrowLeft');
    assert.equal(await hide.isChecked(), true);
    assert.equal(await show.isChecked(), false);
    const hideTarget = await hide.boundingBox(), showTarget = await show.boundingBox();
    assert.ok([hideTarget, showTarget].every(target => target.width >= 48 && target.height >= 48));
    assert.equal(hideTarget.y, showTarget.y);
    await page.locator('#btn-save-menu-schedule').click();
    await page.waitForFunction(() => !hasUnsavedMenuAssignments());
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].categories[0].hideWhenUnavailable, true);
    assert.deepEqual(assignments[0].items.map(item => item.shiftIds), [['dinner', 'late']]);
    await page.locator('.ms-manage-shifts-btn').click();
    await page.locator('#btn-save-menu-shifts').waitFor();
    assert.equal(await page.locator('.ms-table-scroll').evaluate(el => el.inert), false);
    assert.equal(await page.locator('.ms-item-row').count(), 1);
    const firstStart=()=>page.locator('#menu-shifts-cards input[type=time]').first();
    await firstStart().fill('10:00'); await firstStart().press('Tab');
    await page.locator('#btn-save-menu-shifts').click();
    assert.equal(writes.length,0);
    assert(await page.locator('#menu-shifts-error .ms-shift-error-list').textContent());
    await page.evaluate(() => { window.__openedHours = 0; window.__origOpenHours = window.openHoursSettingsFromSchedule; window.openHoursSettingsFromSchedule = () => { window.__openedHours++; }; });
    await page.locator('.ms-shift-error-hours-btn').click();
    assert.equal(await page.evaluate(() => { window.openHoursSettingsFromSchedule = window.__origOpenHours; return window.__openedHours; }), 1);
    await firstStart().fill('11:00'); await firstStart().press('Tab');
    const name=page.locator('#menu-shifts-cards input[type=text]').first(); await name.fill('午餐 A'); await name.press('Tab');
    assert(await page.locator('.ms-table-scroll').evaluate(el=>el.inert));
    assert(await page.locator('.ms-shift-lock-hint').isVisible());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.locator('.ms-shell').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({path:path.join(artifacts,`editor-${browserName}-${locale}-${width}.png`),fullPage:false});
    await page.locator('#btn-save-menu-shifts').click();
    await page.waitForFunction(()=>!hasUnsavedMenuShiftChanges());
    assert.equal(await page.locator('.ms-table-scroll').evaluate(el => el.inert), false);
    assert.equal(writes.length,1); assert.equal(writes[0].scheduleRevision,3); assert.equal(writes[0].operatingShifts[0].name,'午餐 A'); assert.equal(writes[0].operatingHours,undefined);
    assert.deepEqual(pageErrors,[]);
  });
}
