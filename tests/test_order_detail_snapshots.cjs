const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../benmi-worker-official/node_modules/typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
}).outputText, file);
const { fixture: menuFixture } = require('./helpers/option-groups.cjs');
const { writeDetailedOrder } = require('../benmi-worker-official/src/modules/order-detail-write.ts');
const { readDetail, attachOrderDetails, DetailView } = require('../benmi-worker-official/src/modules/order-detail.ts');
const { buildOrderFlexMessage } = require('../benmi-worker-official/src/modules/line/templates/order-receipt.ts');
function fixture() {
  const f = menuFixture();
  f.db.exec(`ALTER TABLE menu_categories ADD COLUMN pricing_rules TEXT;
    ALTER TABLE menu_items ADD COLUMN max_per_order INTEGER;
    CREATE TABLE orders(key TEXT PRIMARY KEY,order_id TEXT,display_key TEXT,business_date TEXT,uuid TEXT,
    tenant_id TEXT,user_id TEXT,customer_name TEXT,pickup_time TEXT,status TEXT,total_amount REAL,order_content TEXT,
    reason TEXT,note TEXT,dining_option TEXT,table_number TEXT,table_id TEXT,round_count INTEGER DEFAULT 1,last_appended_at TEXT,
    created_at TEXT,updated_at TEXT,is_modified INTEGER DEFAULT 0);
    CREATE TABLE restaurant_tables(id TEXT PRIMARY KEY,tenant_id TEXT,label TEXT,is_active INTEGER DEFAULT 1);
    CREATE UNIQUE INDEX order_uuid ON orders(tenant_id,uuid);
    CREATE TABLE tenant_lifecycle(tenant_id TEXT PRIMARY KEY,state TEXT);
    INSERT INTO tenant_lifecycle VALUES('a','active'),('b','active');
    CREATE TABLE daily_order_counters(tenant_id TEXT,order_date TEXT,dining_option TEXT,last_seq INTEGER,PRIMARY KEY(tenant_id,order_date,dining_option));
    CREATE TABLE pending_actions(tenant_id TEXT,order_key TEXT);
  `);
  for (const name of ['0032_create_order_items.sql','0065_line_order_receipts.sql','0069_order_detail_snapshots.sql'])
    f.db.exec(fs.readFileSync('benmi-worker-official/migrations/' + name, 'utf8'));
  Object.assign(f.env, { ORDER_DETAIL_READS: 'true', ORDER_DETAIL_WRITES: 'true' });
  return f;
}
function input(change = {}) { return { detailVersion: 1, operationId: crypto.randomUUID(), total: 100,
  items: [{ itemId: 'a_main', quantity: 1, portionNotes: ['Test thôi'] }], orderSelections: [], ...change }; }
async function write(f, payload, kind='create', tenant='a') {
  const response = await writeDetailedOrder(f.env, tenant, payload, kind);
  const body = await response.json();
  return { status: response.status, ...body };
}
async function ok(f, payload, kind) { const r = await write(f, payload, kind); assert.equal(r.status, 200, JSON.stringify(r)); return r; }

test('create, load and display preserve typed notes exactly once', async () => {
  const f = fixture(), req = input(); const created = await ok(f, req);
  assert.equal(created.detailRevision, 1);
  const stored = await readDetail(f.env, 'a', created.key);
  assert.deepEqual(stored.snapshot, created.detailSnapshot);
  assert.equal(DetailView.text(stored.snapshot).split('Test thôi').length - 1, 1);
  const order = { key: created.key, content: 'untrusted Note: double', total:100, customer:'Guest', status:'NEW', time:'', createdAt:0 };
  await attachOrderDetails(f.env,'a',[order]);
  assert.equal(JSON.stringify(buildOrderFlexMessage(order)).split('Test thôi').length - 1,1);
  const repeat = await ok(f, req);
  assert.equal(repeat.idempotent,true);
  assert.equal(f.db.prepare('SELECT count(*) n FROM order_detail_snapshots').get().n,1);
  assert.equal((await write(f,{...req,note:'changed'})).status,409);
});
test('append round and modify preserve other round, conflict and explicit clearing',async()=>{
  const f=fixture(); const first=await ok(f,input({note:'Round 1'}));
  const second=await ok(f,input({parent_order_key:first.key, expectedDetailRevision:1, note:'Round 2'}),'append');
  assert.equal(second.total,200); assert.equal(second.detailSnapshot.rounds[0].note,'Round 1');
  const conflict=await write(f,input({parent_order_key:first.key,expectedDetailRevision:1}),'append');
  assert.equal(conflict.status,409);
  f.db.prepare("UPDATE orders SET status='WAITING_CUSTOMER_CHANGE' WHERE key=?").run(first.key);
  const line=second.detailSnapshot.rounds[1].items[0];
  const changed=await ok(f,input({order_key:first.key,expectedDetailRevision:2,targetRound:2,note:'',
    items:[{lineId:line.lineId,itemId:line.itemId,quantity:1,portionNotes:['']}]}),'modify');
  assert.equal(changed.detailSnapshot.rounds[0].note,'Round 1');
  assert.equal(changed.detailSnapshot.rounds[1].note,'');
  assert.equal(changed.detailSnapshot.rounds[1].items[0].portions[0].note,'');
  assert.equal(changed.detailSnapshot.rounds[1].items[0].lineId,line.lineId);
  assert.equal(f.db.prepare('SELECT count(*) n FROM order_detail_snapshots').get().n,3);
});
test('snapshot is immutable and transaction rolls back projections on error',async()=>{
  const f=fixture(); const first=await ok(f,input());
  assert.throws(()=>f.db.exec("UPDATE order_detail_snapshots SET snapshot_json='{}'"),/IMMUTABLE/);
  f.db.exec("CREATE TRIGGER fail_projection BEFORE INSERT ON order_items BEGIN SELECT RAISE(ABORT,'injected failure'); END;");
  const result=await write(f,input({parent_order_key:first.key,expectedDetailRevision:1}),'append');
  assert.equal(result.status,500);
  assert.equal(f.db.prepare('SELECT count(*) n FROM order_items').get().n,1);
  assert.equal(f.db.prepare('SELECT detail_revision n FROM orders').get().n,1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM order_detail_snapshots').get().n,1);
});
test('legacy append retains original text and does not invent notes',async()=>{
  const f=fixture();
  f.db.exec("INSERT INTO orders(key,tenant_id,status,round_count,total_amount,order_content) VALUES('old','a','NEW',2,99,'Note: ambiguous x1');");
  const r=await ok(f,input({parent_order_key:'old',expectedDetailRevision:0}),'append');
  assert.equal(r.detailSnapshot.rounds[0].legacyContent,'Note: ambiguous x1');
  assert.deepEqual(r.detailSnapshot.rounds[0].groups,[]);
  assert.equal(r.detailSnapshot.rounds[1].roundNumber,3);
  assert.equal(r.total,199);
});
test('cross-tenant products and retired tenants cannot write',async()=>{
  const f=fixture();
  assert.equal((await write(f,input({items:[{itemId:'b_main',quantity:1}]}))).status,400);
  f.db.exec("UPDATE tenant_lifecycle SET state='deleted' WHERE tenant_id='a'");
  assert.notEqual((await write(f,input())).status,200);
  assert.equal(f.db.prepare('SELECT count(*) n FROM orders').get().n,0);
});

test('create append and modify persist scoped portion receipt payloads with unchanged order totals', async () => {
  const f = fixture();
  const userId = 'U' + '7'.repeat(32);
  const first = await ok(f, input({ userId, total: 200, items: [{ itemId: 'a_main', quantity: 2, portionNotes: ['First portion', 'Second portion'] }] }));
  const receipt = result => JSON.parse(f.db.prepare('SELECT contents_json FROM line_order_receipts WHERE id = ?').get(result.notification.id).contents_json);
  const firstPayload = JSON.stringify(receipt(first));
  assert(firstPayload.includes('第 1 份'));
  assert(firstPayload.includes('第 2 份'));
  assert.equal(firstPayload.split('First portion').length - 1, 1);
  assert.equal(first.total, 200);
  const added = await ok(f, input({ parent_order_key: first.key, expectedDetailRevision: 1, userId, total: 200,
    items: [{ itemId: 'a_main', quantity: 2, portionNotes: ['Added first', 'Added second'] }] }), 'append');
  const addedPayload = JSON.stringify(receipt(added));
  assert(addedPayload.includes('Added first'));
  assert(!addedPayload.includes('First portion'));
  assert.equal(added.total, 400);
  f.db.prepare("UPDATE orders SET status = 'WAITING_CUSTOMER_CHANGE' WHERE key = ?").run(first.key);
  const line = added.detailSnapshot.rounds[1].items[0];
  const changed = await ok(f, input({ order_key: first.key, expectedDetailRevision: 2, targetRound: 2, userId, total: 200,
    items: [{ lineId: line.lineId, itemId: 'a_main', quantity: 2, portionNotes: ['Changed first', 'Added second'] }] }), 'modify');
  const changedPayload = JSON.stringify(receipt(changed));
  assert(changedPayload.includes('First portion'));
  assert(changedPayload.includes('Changed first'));
  assert(!changedPayload.includes('Added first'));
  assert.equal(changed.total, 400);
  assert.deepEqual(changed.detailSnapshot.rounds[0], first.detailSnapshot.rounds[0]);
  f.db.prepare("UPDATE menu_items SET name = 'New catalog name', price = 999 WHERE id = 'a_main'").run();
  const old = await readDetail(f.env, 'a', first.key);
  assert.equal(old.snapshot.rounds[0].items[0].name, 'Meal');
  assert.equal(old.snapshot.rounds[0].items[0].unitPrice, 100);
  assert.equal(JSON.stringify(receipt(first)), firstPayload);
});
