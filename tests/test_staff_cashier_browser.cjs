const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { fixture } = require('./helpers/staff-ordering.cjs');
const { handleStaffRoute } = require('../benmi-worker-official/src/modules/staff.ts');
const { getConfig } = require('../benmi-worker-official/src/modules/config.ts');
const { createTenantRepository } = require('../benmi-worker-official/src/repositories/tenant.repository.ts');
const { getTenantBootstrap } = require('../benmi-worker-official/src/modules/bootstrap.ts');
const { getOptionCatalog } = require('../benmi-worker-official/src/modules/option-groups.ts');
const { chromium } = require('playwright');

test('chromium: staff order cashier change calculator UI, placement, icons, and persistence', async t => {
  const f = await fixture(t);
  await f.apply(`UPDATE tenant_config SET features='["dine_in"]',allow_dine_in=1,allow_scheduled_pickup=0 WHERE tenant_id='a';`);
  await f.apply(`UPDATE menu_items SET price=215 WHERE id='meal-a';`);

  const distRoot = path.join(process.cwd(), 'dist');
  const server = http.createServer((req, res) => {
    const rel = new URL(req.url, 'http://local').pathname.slice(1);
    const file = path.resolve(distRoot, rel);
    if ((!file.startsWith(distRoot + path.sep) && file !== distRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    const contentType = file.endsWith('.js') ? 'application/javascript'
      : file.endsWith('.css') ? 'text/css'
      : file.endsWith('.png') ? 'image/png'
      : file.endsWith('.svg') ? 'image/svg+xml'
      : file.endsWith('.wasm') ? 'application/wasm'
      : 'text/html';
    res.setHeader('Content-Type', contentType);
    res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));

  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.addInitScript(() => {
    if (!localStorage.getItem('staff_order_lang')) localStorage.setItem('staff_order_lang', 'vi');
    if (!localStorage.getItem('benmi_lang')) localStorage.setItem('benmi_lang', 'vi');
  });

  await page.route('**/api/**', async route => {
    const r = route.request(), url = new URL(r.url()), p = url.pathname;
    const request = new Request(r.url(), {
      method: r.method(),
      headers: r.headers(),
      ...(['GET', 'HEAD'].includes(r.method()) ? {} : { body: r.postData() })
    });
    let response;
    if (p === '/api/config') {
      const ctx = await createTenantRepository(f.env.DB, f.env.ORDER_STATE, f.env).getTenantContext('a');
      response = await getConfig(request, f.env, ctx);
    } else if (p.startsWith('/api/staff')) {
      response = await handleStaffRoute(request, f.env, p, f.context('a'));
    } else if (p === '/api/tenant/bootstrap') {
      response = await getTenantBootstrap(request, f.env);
    } else if (p === '/api/menu/options') {
      response = await getOptionCatalog(request, f.env);
    } else {
      response = new Response('{}');
    }
    await route.fulfill({ status: response.status, body: await response.text(), headers: { 'Content-Type': 'application/json' } });
  });
  await page.route('https://static.line-scdn.net/**', r => r.fulfill({ body: '' }));

  await page.goto(`http://127.0.0.1:${server.address().port}/staff-order.html?tenant_id=a&env=dev`);
  await page.waitForFunction(() => window.StaffOrder?.ready());

  // Empty cart: cashier button is below submit button, disabled, and both buttons have SVG icons.
  assert.equal(await page.locator('#staff-cashier-btn').isVisible(), true);
  assert.equal(await page.locator('#staff-cashier-btn').isDisabled(), true);
  assert.equal(await page.locator('#staff-cashier-btn svg.staff-btn-icon').count(), 1);
  assert.equal(await page.locator('#btn-desktop-submit svg.staff-btn-icon').count(), 1);
  assert.match(await page.locator('#staff-cashier-btn').innerText(), /Tính tiền thối/);

  const orderCheck = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.desktop-sidebar-submit-wrap button')).map(b => b.id);
    return btns;
  });
  assert.deepEqual(orderCheck, ['btn-desktop-submit', 'staff-cashier-btn']);

  // Add 1 meal ($215)
  await page.locator('#item-food-Meal').click();
  await page.locator('[data-staff-table="table-a"]').click();
  assert.equal(await page.locator('#staff-cashier-btn').isDisabled(), false);

  for (const viewport of [{ width: 1024, height: 768 }, { width: 704, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const cashierBox = await page.locator('#staff-cashier-btn').boundingBox();
    const submitBox = await page.locator('#btn-desktop-submit').boundingBox();
    assert(cashierBox && submitBox);
    assert(cashierBox.height >= 48, `Cashier button touch target < 48px: ${JSON.stringify(cashierBox)}`);
    assert(submitBox.height >= 48, `Submit button touch target < 48px: ${JSON.stringify(submitBox)}`);
    assert(submitBox.y + submitBox.height <= cashierBox.y + 1, `Cashier button must be below submit button: ${JSON.stringify({ submitBox, cashierBox })}`);
    assert(cashierBox.y + cashierBox.height <= viewport.height + 1);
  }

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.locator('#staff-cashier-btn').click();
  assert.equal(await page.locator('#staff-cashier-modal').isVisible(), true);
  assert.equal(await page.locator('#staff-cashier-due-amount').innerText(), '$215');

  const chips = await page.locator('#staff-cashier-chips .staff-cashier-chip').allInnerTexts();
  assert.deepEqual(chips, ['Vừa đủ $215', '$250', '$500', '$1000']);

  // Insufficient manual input via keypad: 1 + 0 + 0 = $100 -> missing $115; Enter does not double-click focused key
  await page.locator('[data-cashier-key="1"]').click();
  await page.locator('[data-cashier-key="00"]').click();
  await page.locator('[data-cashier-key="1"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#staff-cashier-tender-display').innerText(), '$100');
  assert.equal(await page.locator('#staff-cashier-change-label').innerText(), 'Còn thiếu');
  assert.equal(await page.locator('#staff-cashier-change-value').innerText(), '$115');
  assert.equal(await page.locator('#staff-cashier-confirm-btn').isDisabled(), true);

  // Backspace + Escape close + keyboard digits + Enter confirm
  await page.locator('[data-cashier-key="backspace"]').click();
  assert.equal(await page.locator('#staff-cashier-tender-display').innerText(), '$10');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#staff-cashier-modal').isVisible(), false);
  await page.locator('#staff-cashier-btn').click();
  await page.locator('[data-cashier-chip="500"]').click();
  assert.equal(await page.locator('#staff-cashier-tender-display').innerText(), '$500');
  assert.equal(await page.locator('#staff-cashier-change-label').innerText(), 'Thối lại');
  assert.equal(await page.locator('#staff-cashier-change-value').innerText(), '$285');
  assert.equal(await page.locator('#staff-cashier-confirm-btn').isDisabled(), false);
  assert.match(await page.locator('#staff-cashier-confirm-btn').innerText(), /Xác nhận · thối \$285/);

  // A cart refresh can change the total while the cashier panel stays open.
  await page.evaluate(() => {
    updateQty('food', 'Meal', 1);
    updateQty('food', 'Meal', 1);
  });
  assert.equal(await page.locator('#staff-cashier-due-amount').innerText(), '$645');
  assert.equal(await page.locator('#staff-cashier-tender-display').innerText(), '$500');
  assert.equal(await page.locator('#staff-cashier-confirm-btn').isDisabled(), true);
  await page.evaluate(() => {
    updateQty('food', 'Meal', -1);
    updateQty('food', 'Meal', -1);
  });
  assert.equal(await page.locator('#staff-cashier-due-amount').innerText(), '$215');
  assert.equal(await page.locator('#staff-cashier-confirm-btn').isEnabled(), true);

  // Confirm -> immediately closes modal, submits order, and renders nothing outside popup
  assert.equal(await page.locator('#staff-cashier-summary').count(), 0);
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/staff/orders') && r.request().method() === 'POST'),
    page.locator('#staff-cashier-confirm-btn').click()
  ]);
  await page.waitForFunction(() => window.StaffOrder?.ready());
  assert.equal(await page.locator('#staff-cashier-modal').isVisible(), false);
  assert.equal(await page.locator('#staff-cashier-summary').count(), 0);
  assert.match(await page.locator('#staff-cashier-btn').innerText(), /^Tính tiền thối$/);
  assert.equal(await page.locator('#staff-cashier-btn').isDisabled(), true);
  assert.match(await page.locator('#staff-order-status').innerText(), /Đã gửi/);

  let orders = await f.DB.prepare("SELECT * FROM orders WHERE tenant_id='a'").all();
  assert.equal(orders.results.length, 1);
  assert.equal(orders.results[0].total_amount, 215);

  // Switch to zh-TW, open calculator for new item, and confirm to submit immediately
  await page.evaluate(() => { localStorage.setItem('staff_order_lang', 'zh-TW'); });
  await page.reload();
  await page.waitForFunction(() => window.StaffOrder?.ready());
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-TW');
  assert.match(await page.locator('#staff-cashier-btn').innerText(), /計算找零/);
  await page.locator('#item-food-Meal').click();
  await page.locator('[data-staff-table="table-a"]').click();
  await page.locator('#staff-cashier-btn').click();
  assert.equal(await page.locator('#staff-cashier-due-label').innerText(), '應收金額');
  assert.equal(await page.locator('#staff-cashier-tender-label').innerText(), '實收金額');
  assert.equal(await page.locator('#staff-cashier-close-btn').innerText(), '關閉');
  await page.locator('[data-cashier-chip="500"]').click();
  assert.match(await page.locator('#staff-cashier-confirm-btn').innerText(), /確認 · 找零 \$285/);

  await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/staff/orders') && r.request().method() === 'POST'),
    page.locator('#staff-cashier-confirm-btn').click()
  ]);
  await page.waitForFunction(() => window.StaffOrder?.ready());
  assert.equal(await page.locator('#staff-cashier-modal').isVisible(), false);
  assert.equal(await page.locator('#staff-cashier-summary').count(), 0);
  assert.match(await page.locator('#staff-cashier-btn').innerText(), /計算找零/);
  assert.equal(await page.locator('#staff-cashier-btn').isDisabled(), true);

  const appended = await f.DB.prepare('SELECT * FROM orders WHERE key=?').bind(orders.results[0].key).first();
  assert.equal(appended.round_count, 2);
  assert.equal(appended.total_amount, 430);
  assert.deepEqual(errors, []);
});
