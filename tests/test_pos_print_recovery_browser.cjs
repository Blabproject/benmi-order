const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'orders.html'), 'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: ready remains usable during a stalled print; per-part reports recover and support targeted retry`, async t => {
    const browser = await engine.launch({ headless: true }); t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    page.setDefaultTimeout(8000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto('https://pos.test/orders.html?tenant=fixture&platform=app');
    await page.setContent(html);
    await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'css/orders.css'), 'utf8') });
    await page.evaluate(() => { window.setInterval = () => 0; });
    for (const file of ['order-code', 'orders-i18n', 'order-legacy-adapter', 'orders-core', 'printer-service', 'orders-live', 'orders-modals', 'orders-settings']) {
      await page.addScriptTag({ content: fs.readFileSync(path.join(root, `js/${file}.js`), 'utf8') });
    }
    await page.evaluate(() => {
      window.__writes = [];
      window.__order = { key: 'fixture-order', displayKey: 'F1112-T006', customer: 'Fixture', status: 'NEW', source: 'legacy', total: 142,
        content: '1 x Fixture meal', time: '20:30', createdAt: Date.now(), diningOption: 'takeaway' };
      window.fetch = async (url, options = {}) => {
        if (String(url).includes('/api/update')) {
          __writes.push(JSON.parse(options.body)); __order.status = JSON.parse(options.body).status;
          return new Response('{"success":true}', { status: 200 });
        }
        if (String(url).includes('/api/orders?')) return new Response(JSON.stringify([__order]), { status: 200 });
        return new Response('{}', { status: 200 });
      };
      PrinterService.saveSettings({ autoPrintNewOrders: true,
        cashier: { enabled: true, interface_type: 'bluetooth', mac_address: '00:11:22:33:44:55' },
        kitchen: { enabled: true, interface_type: 'bluetooth', mac_address: '11:22:33:44:55:66' } });
      PrinterService.printCashierReceipt = () => new Promise(resolve => { window.__releasePrinter = resolve; });
      PrinterService.printKitchenTicket = async () => { throw Object.assign(new Error('fixture busy'), { code: 'BLUETOOTH_CONNECT_FAILED' }); };
      latestOrders = [{ ...__order }]; activeTab = 'live'; currentDiningFilter = 'all';
      applyLanguageToDOM(); renderAll();
    });
    assert.equal(await page.evaluate(() => updateStatus('fixture-order', 'ACCEPTED')), true);
    await page.locator('.btn-action-ready').click();
    await page.waitForFunction(() => __order.status === 'DONE' && processingKeys.size === 0);
    assert.deepEqual(await page.evaluate(() => __writes.map(write => write.status)), ['ACCEPTED', 'DONE']);
    await page.evaluate(() => { __releasePrinter(); });
    await page.waitForFunction(() => !PrinterService.isPrinterBusy());
    await page.evaluate(() => { setLanguage('vi'); openReview('fixture-order'); });
    const report = page.locator('[data-printer-reports="current"]');
    await report.waitFor({ state: 'visible' });
    assert.match(await report.innerText(), /Hóa đơn thu ngân: Đã gửi tới máy in/);
    assert.match(await report.innerText(), /Tem món: Chưa gửi được/);
    const retry = report.getByRole('button', { name: 'In lại phần này' });
    assert.equal(await retry.count(), 1);
    assert.ok((await retry.boundingBox()).height >= 48);
    await page.evaluate(() => {
      window.__billRepeats = 0; window.__stickerRetries = 0;
      PrinterService.printCashierReceipt = async () => { __billRepeats++; };
      PrinterService.printKitchenTicket = async () => { __stickerRetries++; };
    });
    page.once('dialog', dialog => dialog.accept());
    await retry.click();
    await page.waitForFunction(() => __stickerRetries === 1 && !PrinterService.isPrinterBusy());
    assert.equal(await page.evaluate(() => __billRepeats), 0);
    assert.equal(await retry.count(), 0);
    await page.evaluate(() => PrinterService.savePrintReport(__order, { stations: { kitchen: { state: 'uncertain' } } }));
    page.once('dialog', dialog => dialog.accept());
    await report.getByRole('button', { name: 'Đã kiểm tra đủ giấy' }).click();
    assert.equal(await page.evaluate(() => __stickerRetries), 1, 'checking paper must not send another print');
    assert.match(await report.innerText(), /Nhân viên đã xác nhận in đủ/);
    await page.evaluate(() => setLanguage('zh-TW'));
    assert.match(await report.innerText(), /收銀明細：?|收銀明細:/);
    assert.doesNotMatch(await report.innerText(), /Hóa đơn|Tem món/);
    assert.deepEqual(errors, []);
  });
}
