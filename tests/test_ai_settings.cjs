const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, webhookModule, ai, repository } = require('./helpers/ai-settings.cjs');

test('AI settings preserve existing behavior and the legacy order redirect switch', () => {
  for (const raw of [null, undefined, '{}', 'broken', [], 1]) assert(Object.values(ai.parseAISettings(raw)).every(Boolean));
  assert.equal(ai.parseAISettings('{}', 0).orderRedirect, false);
  assert.equal(ai.parseAISettings('{"enabled":false,"address":true}').enabled, false);
});

test('config persists tenant-scoped switches, retains other data and invalidates caches', async t => {
  const f = fixture(); t.after(() => f.db.close());
  const initial = await (await f.get()).json();
  assert(Object.values(initial.aiSettings).every(Boolean));
  assert.equal((await f.save({ aiSettings: { address: false } })).status, 200);
  await f.save({ aiSettings: { hours: false } });
  const a = await (await f.get()).json(), b = await (await f.get('b')).json();
  assert.equal(a.aiSettings.address, false); assert.equal(a.aiSettings.hours, false);
  assert.equal(b.aiSettings.address, true); assert.equal(a.storeAddress, 'Address A');
  assert.equal(f.db.prepare("SELECT liff_id FROM tenant_config WHERE tenant_id='a'").get().liff_id, initial.liffId);
  for (const key of ['tenant:a:config_cache', 'tenant:a:bootstrap', 'tenant:a:bootstrap:v2']) assert(f.deleted.includes(key));
  const ctx = await repository.createTenantRepository(f.env.DB).getTenantContext('a');
  assert.equal(ctx.aiSettings.address, false);
  await f.save({ aiSettings: { enabled: false } });
  await f.save({ aiSettings: { enabled: true } });
  assert.equal((await (await f.get()).json()).aiSettings.address, false);
});

test('invalid patches never change settings; POS can update the existing redirect switch', async t => {
  const f = fixture(); t.after(() => f.db.close());
  for (const value of [null, [], {}, { address: 0 }, { address: 'false' }, { typo: true }]) {
    assert.equal((await f.save({ aiSettings: value })).status, 400);
  }
  await f.save({ aiSettings: { orderRedirect: false } });
  assert.equal(f.db.prepare("SELECT ai_order_redirect_enabled FROM tenant_config WHERE tenant_id='a'").get().ai_order_redirect_enabled, 0);
  await f.save({ aiSettings: { orderRedirect: true } });
  assert.equal((await (await f.get()).json()).aiSettings.orderRedirect, true);
  assert.equal(Object.hasOwn(JSON.parse(f.db.prepare("SELECT ai_settings FROM tenant_config WHERE tenant_id='a'").get().ai_settings), 'orderRedirect'), false);
  f.db.exec("UPDATE tenant_config SET ai_order_redirect_enabled=0 WHERE tenant_id='a'");
  assert.equal((await (await f.get()).json()).aiSettings.orderRedirect, false);
  f.db.exec("UPDATE tenant_config SET ai_order_redirect_enabled=1 WHERE tenant_id='a'");
  await f.save({ storeAddress: 'Updated A' });
  assert.equal((await (await f.get()).json()).aiSettings.orderRedirect, true);
});

test('concurrent disjoint switch patches preserve both changes', async t => {
  const f = fixture(); t.after(() => f.db.close());
  await Promise.all([f.save({ aiSettings: { address: false } }), f.save({ aiSettings: { delivery: false } })]);
  const result = await (await f.get()).json();
  assert.equal(result.aiSettings.address, false); assert.equal(result.aiSettings.delivery, false);
});

test('disabled FAQs consume matching messages before custom rules, stale drafts and AI fallback', async t => {
  const f = fixture(); t.after(() => f.db.close());
  const line = webhookModule(f);
  f.cache.set('draft:user', JSON.stringify({ text: 'old draft', lastUpdate: Date.now() }));
  for (const [key, text] of [['address', 'quán ở đâu?'], ['hours', 'giờ mở cửa'], ['delivery', 'có ship không']]) {
    await f.save({ aiSettings: { [key]: false } });
    assert.equal((await line.send(text)).status, 200);
  }
  assert.equal(line.calls.ai, 0); assert.equal(line.calls.line.length, 0); assert.equal(line.calls.pending, 0);
  const ctx = { ...f.context('a'), aiSettings: ai.parseAISettings({ address: false }), quickReplies: [{ triggers: ['ở đâu'], reply: 'custom address' }] };
  assert.equal(line.api.handleQuickReply('quán ở đâu?', ctx), null);
  assert.equal(line.api.handleQuickReply('địa chỉ', f.context('b')), 'Address B');
});

test('webhook reads current D1 policy despite stale context and isolates stores', async t => {
  const f = fixture(); t.after(() => f.db.close()); const line = webhookModule(f);
  await f.save({ aiSettings: { address: false } });
  await line.send('địa chỉ'); assert.equal(line.calls.line.length, 0);
  await line.send('địa chỉ', 'b'); assert.equal(line.calls.line.length, 1);
  assert.equal(line.calls.line[0].messages[0].text, 'Address B');
  await f.save({ aiSettings: { address: true } });
  await line.send('địa chỉ'); assert.equal(line.calls.line.length, 2);
});

test('master off suppresses conversations while receipts and explicit LINE buttons still work', async t => {
  const f = fixture(); t.after(() => f.db.close()); const line = webhookModule(f);
  await f.save({ aiSettings: { enabled: false } });
  for (const text of ['địa chỉ', 'check progress', 'muốn đặt món', 'ok']) await line.send(text);
  assert.equal(line.calls.ai, 0); assert.equal(line.calls.line.length, 0); assert.equal(line.calls.pending, 0);
  await line.send('receipt-fixture'); assert.equal(line.calls.receipt, 1);
  await line.send('', 'a', { type: 'postback', replyToken: 'reply', source: { userId: 'user' }, postback: { data: 'receipt_page' } });
  assert.equal(line.calls.button, 1);
});

test('pending and order-status switches stop text actions without calling AI', async t => {
  const f = fixture(); t.after(() => f.db.close()); const line = webhookModule(f);
  await f.save({ aiSettings: { pendingOrderReplies: false, orderStatus: false, orderRedirect: false } });
  line.pending.order = { type: 'CHANGE', createdAt: Date.now() };
  await line.send('ok'); await line.send('check progress');
  assert.equal(line.calls.ai, 0); assert.equal(line.calls.line.length, 0);
  delete line.pending.order;
  await line.send('muốn đặt món');
  assert.equal(line.calls.ai, 0);
});

test('enabled order redirect still classifies text and sends a LINE ordering link', async t => {
  const f = fixture(); t.after(() => f.db.close()); const line = webhookModule(f);
  await line.send('muốn đặt món');
  assert.equal(line.calls.ai, 1);
  assert.equal(line.calls.line.length, 1);
  assert.equal(line.calls.line[0].messages[0].type, 'flex');
});

test('custom keyword switch prevents fallback; missing D1 policy fails closed', async t => {
  const f = fixture(); t.after(() => f.db.close()); const line = webhookModule(f);
  const original = f.context;
  f.context = id => ({ ...original(id), quickReplies: [{ triggers: ['hello'], reply: 'Hi' }] });
  await f.save({ aiSettings: { customReplies: false } });
  await line.send('hello'); assert.equal(line.calls.ai, 0); assert.equal(line.calls.line.length, 0);
  f.db.exec("DELETE FROM tenant_config WHERE tenant_id='a'");
  assert.equal((await line.send('địa chỉ')).status, 503);
});
