import test from 'node:test';
import assert from 'node:assert/strict';
import { startRuntime, startPages, tenant } from './runtime.mjs';
import { browserSession, drawer, field, action, saveDrawer, newGroup, editGroup, newProduct } from './browser.mjs';

for (const language of ['zh-TW', 'vi']) {
  test(`Tablet POS stock save (${language}): persists once, retains drafts and survives reload`, { timeout: 90000 }, async () => {
    const app = await startRuntime(), pages = await startPages();
    let session;
    try {
      session = await browserSession(app, pages, { language, name: 'stock-save' });
      const { page } = session;
      await session.pos();
      const row = page.locator('#menu-editor-body .menu-item-row-card').first();
      await row.waitFor();
      const itemId = await row.evaluate(el => {
        const [, cIdx, iIdx] = el.id.match(/menu-item-card-(\d+)-(\d+)/);
        return currentMenuData[Number(cIdx)].items[Number(iIdx)].id;
      });
      const readStock = () => app.db.prepare('SELECT out_of_stock_until FROM menu_items WHERE tenant_id=? AND id=?').bind(tenant, itemId).first();
      // Warm customer cache before writing through the real stock API.
      await app.request('/api/tenant/bootstrap');
      const originalPrice = await row.locator('.menu-item-price-input').inputValue();
      await row.locator('.menu-item-price-input').fill(String(Number(originalPrice) + 7));
      await row.locator('.menu-item-stock-toggle').click();
      assert.equal(await page.locator('#btn-stock-save').isVisible(), false);
      await page.screenshot({ path: session.directory + '/stock-dialog.png', fullPage: true });
      await page.locator('label:has(#stock-choice-indefinite)').click();
      await page.locator('#stockModal').waitFor({ state: 'hidden' });
      assert.equal((await readStock()).out_of_stock_until, '9999-12-31T23:59:59.000Z');
      assert.equal(await row.locator('.menu-item-price-input').inputValue(), String(Number(originalPrice) + 7));
      assert.equal(await page.evaluate(() => isMenuDirty), true);
      assert.equal(await page.evaluate(() => confirmLeaveMenu()), true);
      assert.equal(await page.evaluate(() => isMenuDirty), false);
      assert.equal(await row.locator('.menu-item-price-input').inputValue(), originalPrice);
      assert.ok((await row.locator('.menu-item-stock-toggle').getAttribute('class')).includes('is-oos'));
      const customer = await (await app.request('/api/tenant/bootstrap')).json();
      assert.equal(customer.catalog.flatMap(c => c.items).find(item => item.id === itemId).isOutOfStock, true);
      await page.screenshot({ path: session.directory + '/stock-saved.png', fullPage: true });
      await page.reload();
      await page.waitForFunction(() => window.UnifiedMenu?.enabled && isMenuLoadedCompletely);
      await page.locator('#i18n-btn-start-shift').click();
      const reloadedRow = page.locator('#menu-editor-body .menu-item-row-card').first();
      assert.ok((await reloadedRow.locator('.menu-item-stock-toggle').getAttribute('class')).includes('is-oos'));
      await reloadedRow.locator('.menu-item-stock-toggle').click();
      await page.locator('#btn-stock-restore').click();
      await page.locator('#stockModal').waitFor({ state: 'hidden' });
      assert.equal((await readStock()).out_of_stock_until, null);
      assert.equal(await page.evaluate(() => isMenuDirty), false);
      assert.equal(await page.locator('#btn-menu-save').isDisabled(), true);
      assert.equal(session.requests.filter(r => r.path === '/api/menu/stock-status' && r.method === 'POST').length, 2);
      assert.equal(session.requests.filter(r => r.path === '/api/menu' && r.method === 'POST').length, 0);
      assert.deepEqual(session.errors, []);
    } finally { if (session) await session.close();await pages.close();await app.close(); }
  });
}

test('Full POS page: create group, persist in D1, independent GET, reload, edit and retry', { timeout: 120000 }, async () => {
  const app = await startRuntime(), pages = await startPages();
  let session;
  try {
    session = await browserSession(app, pages);
    const { page } = session;
    await session.pos();
    const group = await newGroup(page, 'QA persisted group');
    assert.equal((await app.db.prepare('SELECT name FROM modifier_groups WHERE tenant_id=? AND id=?').bind(tenant, group.id).first()).name, group.name);
    const read = async () => (await (await app.request('/api/menu/options')).json()).groups.find(g => g.id === group.id);
    assert.equal((await read()).options[0].price, 0);
    await page.reload();
    await page.waitForFunction(() => window.UnifiedMenu?.enabled);
    await page.locator('#i18n-btn-start-shift').click();
    await editGroup(page, group.id);
    assert.equal(await field(page, 'name').inputValue(), group.name);
    for (const fault of [{ status: 400 }, { status: 503 }, { type: 'offline' }]) {
      session.faults.push({ path: '/api/menu/option-group', ...fault });
      await field(page, 'name').fill('QA retained draft');
      await action(page, 'save').click();
      await page.waitForFunction(() => document.querySelector('#unified-menu-drawer .ug-error')?.textContent.trim());
      assert.equal(await field(page, 'name').inputValue(), 'QA retained draft');
      assert.equal((await read()).name, group.name);
    }
    await saveDrawer(page);
    assert.equal((await read()).name, 'QA retained draft');

    await editGroup(page, group.id);
    await field(page, 'required').check();
    await saveDrawer(page);
    // Warm the actual customer cache before adding a new product.
    await app.request('/api/tenant/bootstrap');
    const product = await newProduct(page, 'QA customer meal', group.id);
    assert.equal((await app.db.prepare('SELECT price FROM menu_items WHERE tenant_id=? AND id=?').bind(tenant, product.id).first()).price, 100);
    await page.reload();
    await page.locator('#i18n-btn-start-shift').click();
    await page.locator('.menu-item-name-input').filter({ visible: true }).first().waitFor();
    assert.ok((await page.locator('.menu-item-name-input').evaluateAll(nodes => nodes.map(n => n.value))).includes(product.name));
    const customer = await session.context.newPage();
    await customer.goto(`${pages.url}/?tenant_id=${tenant}`);
    await customer.getByText(product.name, { exact: true }).first().waitFor();
    await customer.getByText(product.name, { exact: true }).first().click();
    await customer.locator('#unified-option-modal').waitFor({ state: 'visible' });
    await customer.locator('#unified-option-modal').getByText('QA zero surcharge', { exact: true }).click();
    await customer.locator('[data-note]').fill('QA portion note');
    await customer.locator('[data-confirm]').click();
    assert.equal(await customer.locator('#total-price').textContent(), '100');
    await customer.locator('#note').fill('QA order note');
    if (await customer.locator('#pickup-date').isVisible()) {
      const tomorrow = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Taipei'}).format(new Date(Date.now() + 86400000));
      await customer.locator('#pickup-date').fill(tomorrow);
      await customer.locator('#pickup-time').fill('12:00');
    }
    const created = customer.waitForResponse(r => r.url().includes('/api/create?') && r.request().method() === 'POST');
    await customer.locator('#btn-desktop-submit').click();
    if (await customer.locator('#custom-confirm-ok').isVisible()) await customer.locator('#custom-confirm-ok').click();
    const orderResponse = await created;
    assert.equal(orderResponse.status(), 200, await orderResponse.text());
    const order = await orderResponse.json();
    assert.equal(order.detailSnapshot.total, 100);
    const stored = await app.db.prepare('SELECT total_amount,order_content FROM orders WHERE tenant_id=? AND key=?').bind(tenant, order.key).first();
    assert.equal(stored.total_amount, 100);
    assert.ok(stored.order_content.includes(product.name));
    assert.ok(stored.order_content.includes('QA portion note'));
    await page.locator('#tab-live').click();
    const orderCard = page.locator('.tile', { hasText: order.displayKey }).first();
    await orderCard.waitFor();
    await page.evaluate(() => { if (typeof dismissNewAlert === 'function') dismissNewAlert(); });
    await orderCard.click({ force: true });
    await page.locator('#reviewModal').waitFor({state:'visible'});
    assert.ok((await page.locator('#reviewModal').textContent()).includes(product.name));
    await customer.screenshot({ path: session.directory + '/customer-cart.png', fullPage: true });
    assert.deepEqual(session.errors, []);
  } finally { if (session) await session.close(); await pages.close(); await app.close(); }
});
