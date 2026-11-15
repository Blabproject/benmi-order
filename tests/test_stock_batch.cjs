const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/staff-ordering.cjs');
const { updateStockBatch, stockExpiry } = require('../benmi-worker-official/src/modules/menu-stock-batch.ts');

test('stock expiry validates enum, calendar dates and the shared UTC+7 cutoff', () => {
  const now = Date.parse('2026-11-15T16:30:00Z');
  assert.equal(stockExpiry({ status: 'out_of_stock', duration: 'today' }, now), '2026-11-15T21:00:00.000Z');
  assert.equal(stockExpiry({ status: 'out_of_stock', duration: 'indefinite' }, now), '9999-12-31T23:59:59.000Z');
  assert.equal(stockExpiry({ status: 'in_stock' }, now), null);
  for (const body of [
    { status: 'wrong' }, { status: 'out_of_stock', duration: 'wrong' },
    { status: 'out_of_stock', duration: 'multiple_days', until_date: '2027-02-30T04:00:00+07:00' },
    { status: 'out_of_stock', duration: 'multiple_days', until_date: '2026-11-15T04:00:00+07:00' }
  ]) assert.throws(() => stockExpiry(body, now));
});

test('batch stock uses real local D1: authorization, isolation, atomicity, linked options and cache failure', async t => {
  const f = await fixture(t);
  const expiry = '9999-12-31T23:59:59.000Z';
  const input = (extra = {}) => ({ item_ids: ['meal-a'], status: 'out_of_stock', duration: 'indefinite', ...extra });
  async function call(body, token = f.token, tenant = 'a') {
    const response = await updateStockBatch(new Request('https://local.test/api/menu/stock-status/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body)
    }), f.env, tenant);
    return { status: response.status, ...await response.json() };
  }
  assert.equal((await call(input(), null)).status, 401);
  assert.equal((await call(input(), f.token, 'b')).status, 401);
  for (const item_ids of [[], [''], [1], Array.from({ length: 101 }, (_, i) => String(i))]) assert.equal((await call(input({ item_ids }))).status, 400);
  assert.equal((await call(input({ status: 'wrong' }))).status, 400);
  assert.equal((await call(input({ item_ids: ['meal-a', 'meal-b'] }))).status, 409);
  assert.equal((await f.DB.prepare("SELECT out_of_stock_until FROM menu_items WHERE id='meal-a'").first()).out_of_stock_until, null);

  await f.apply(`INSERT INTO modifier_groups(id,tenant_id,name) VALUES('stock-group','a','Stock');
    INSERT INTO modifier_options(id,tenant_id,group_id,name,product_id) VALUES('stock-option','a','stock-group','Meal','meal-a');`);
  const result = await call(input({ item_ids: ['meal-a', 'meal-a'] }));
  assert.equal(result.status, 200); assert.equal(result.changed, 1); assert.equal(result.items.length, 1);
  const option = await f.DB.prepare("SELECT * FROM modifier_options WHERE id='stock-option'").first();
  assert.equal(option.out_of_stock_until, expiry); assert.equal(option.is_out_of_stock, 1);
  assert.equal((await call(input())).unchanged, 1);
  assert.equal((await call(input({ status: 'in_stock' }))).changed, 1);
  assert.equal((await f.DB.prepare("SELECT out_of_stock_until FROM modifier_options WHERE id='stock-option'").first()).out_of_stock_until, null);

  await f.apply("CREATE TRIGGER stock_failure BEFORE UPDATE ON modifier_options BEGIN SELECT RAISE(ABORT,'test rollback'); END;");
  assert.equal((await call(input())).status, 500);
  assert.equal((await f.DB.prepare("SELECT out_of_stock_until FROM menu_items WHERE id='meal-a'").first()).out_of_stock_until, null);
  await f.apply('DROP TRIGGER stock_failure;');
  const deleted = [];
  f.env.ORDER_STATE.delete = async key => { deleted.push(key); throw new Error('offline cache'); };
  const saved = await call(input());
  assert.equal(saved.status, 200); assert.equal(saved.cache_refreshed, false);
  assert.equal((await f.DB.prepare("SELECT out_of_stock_until FROM menu_items WHERE id='meal-a'").first()).out_of_stock_until, expiry);
  assert.equal(deleted.length, 8); // initial invalidation plus one retry

  f.env.ORDER_STATE.delete = async () => {};
  const ids = Array.from({ length: 100 }, (_, i) => `stock-${i}`);
  await f.DB.batch(ids.map(id => f.DB.prepare("INSERT INTO menu_items(id,tenant_id,category_id,name,price) VALUES(?,'a','food-a','Same name',10)").bind(id)));
  const full = await call(input({ item_ids: ids }));
  assert.equal(full.status, 200); assert.equal(full.changed, 100);
  assert.equal((await f.DB.prepare("SELECT out_of_stock_until FROM menu_items WHERE id='meal-b'").first()).out_of_stock_until, null);
});
