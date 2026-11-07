const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const qrcode = require('../js/qrcode.min.js');

function createTestDb() {
  const db = new DatabaseSync(':memory:');
  const migration0057 = fs.readFileSync('benmi-worker-official/migrations/0057_create_staff_ordering_and_tables.sql', 'utf8');
  
  // Basic mock schema
  db.exec(`
    CREATE TABLE tenant_config (
      tenant_id TEXT PRIMARY KEY,
      brand_name TEXT DEFAULT 'Demo Store',
      features TEXT DEFAULT '[]',
      staff_ordering_enabled INTEGER DEFAULT 0,
      staff_ordering_capabilities TEXT DEFAULT '{}',
      allow_dine_in INTEGER DEFAULT 1,
      store_status TEXT DEFAULT 'open',
      is_active INTEGER DEFAULT 1
    );
    CREATE TABLE orders (
      key TEXT PRIMARY KEY,
      order_id TEXT,
      display_key TEXT,
      business_date TEXT,
      uuid TEXT,
      tenant_id TEXT NOT NULL,
      user_id TEXT,
      customer_name TEXT,
      pickup_time TEXT,
      status TEXT NOT NULL,
      total_amount REAL NOT NULL,
      order_content TEXT,
      reason TEXT,
      note TEXT,
      dining_option TEXT,
      table_number TEXT,
      table_id TEXT,
      source TEXT DEFAULT 'liff',
      revision INTEGER DEFAULT 0,
      round_count INTEGER DEFAULT 1,
      detail_revision INTEGER DEFAULT 0,
      last_appended_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE restaurant_tables (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, label)
    );
  `);

  return db;
}

test('QR Code generator produces valid SVG and DataURL from js/qrcode.min.js', () => {
  const qr = qrcode(0, 'M');
  qr.addData('https://liff.line.me/2009560906-c5taZfiY?table=01%E8%99%9F%E6%A1%8C');
  qr.make();
  assert(qr.getModuleCount() > 20, 'QR module count should be > 20');
  const svg = qr.createSvgTag(6, 2);
  assert(svg.startsWith('<svg') && svg.endsWith('</svg>'), 'createSvgTag should return valid SVG XML');
  const dataUrl = qr.createDataURL(6, 2);
  assert(dataUrl.startsWith('data:image/gif;base64,') || dataUrl.startsWith('data:image/png;base64,'), 'createDataURL should return valid base64 image');
});

test('generateTableQrUrl prefers LIFF ID when available and falls back to order domain', () => {
  const context = {
    getTenantIdFromUrl: () => 'blab_demo',
    currentTenantLiffId: '2009560906-c5taZfiY',
    encodeURIComponent: encodeURIComponent,
    storeConfig: null
  };
  context.window = context;
  const settingsCode = fs.readFileSync('js/orders-settings.js', 'utf8');
  const fnMatch = settingsCode.match(/function generateTableQrUrl[\s\S]*?^}/m);
  assert(fnMatch, 'generateTableQrUrl should be defined in orders-settings.js');
  
  vm.createContext(context);
  vm.runInContext(fnMatch[0], context);

  const liffUrl = context.generateTableQrUrl('01號桌');
  assert.equal(liffUrl, 'https://liff.line.me/2009560906-c5taZfiY?table=01%E8%99%9F%E6%A1%8C');

  // Fallback test
  context.currentTenantLiffId = '';
  const fallbackUrl = context.generateTableQrUrl('Bàn 02');
  assert.equal(fallbackUrl, 'https://order.blabfood.app/blab_demo?table=B%C3%A0n%2002');
});

test('Table QR ordering migration 0082 enables feature and seeds demo tables', () => {
  const db = createTestDb();
  db.exec(`INSERT INTO tenant_config (tenant_id, features, staff_ordering_capabilities) VALUES ('blab_demo', '["reports","dine_in"]', '{}');`);
  
  const migration0082 = fs.readFileSync('benmi-worker-official/migrations/0082_enable_table_qr_ordering_demo.sql', 'utf8');
  db.exec(migration0082);

  const tenant = db.prepare("SELECT features, staff_ordering_capabilities FROM tenant_config WHERE tenant_id = 'blab_demo'").get();
  assert(tenant.features.includes('table_qr_ordering'), 'features must contain table_qr_ordering');
  
  const caps = JSON.parse(tenant.staff_ordering_capabilities);
  assert.equal(caps.tables_read, true);
  assert.equal(caps.tables_write, true);

  const tables = db.prepare("SELECT label FROM restaurant_tables WHERE tenant_id = 'blab_demo' ORDER BY sort_order ASC").all();
  assert.equal(tables.length, 5);
  assert.equal(tables[0].label, '01號桌');
});

test('Public table status resolution distinguishes active open order vs empty table', () => {
  const db = createTestDb();
  db.exec(`
    INSERT INTO tenant_config (tenant_id, features) VALUES ('blab_demo', '["table_qr_ordering"]');
    INSERT INTO restaurant_tables (id, tenant_id, label, sort_order, is_active) VALUES ('tbl_1', 'blab_demo', '01號桌', 1, 1);
    INSERT INTO restaurant_tables (id, tenant_id, label, sort_order, is_active) VALUES ('tbl_2', 'blab_demo', '02號桌', 2, 1);
  `);

  // Insert active order for table 01
  db.exec(`
    INSERT INTO orders (key, order_id, display_key, status, total_amount, tenant_id, table_id, table_number)
    VALUES ('DFBW-T001', 'uuid-1', 'T001', 'COOKING', 150, 'blab_demo', 'tbl_1', '01號桌');
  `);

  // Query table 01 (Occupied)
  const query = `
    SELECT key, order_id, display_key, status, total_amount, round_count, detail_revision, customer_name, created_at
    FROM orders
    WHERE tenant_id = ?
      AND (table_id = ? OR table_number = ?)
      AND status NOT IN ('PAID', 'REJECTED', 'PICKED_UP', 'EXPIRED', 'FORCE_REJECT')
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const activeOrder1 = db.prepare(query).get('blab_demo', 'tbl_1', '01號桌');
  assert.ok(activeOrder1);
  assert.equal(activeOrder1.display_key, 'T001');
  assert.equal(activeOrder1.status, 'COOKING');

  // Query table 02 (Empty)
  const activeOrder2 = db.prepare(query).get('blab_demo', 'tbl_2', '02號桌');
  assert.equal(activeOrder2, undefined);

  // When order is marked PAID, table becomes empty again
  db.exec(`UPDATE orders SET status = 'PAID' WHERE key = 'DFBW-T001'`);
  const activeOrderAfterPaid = db.prepare(query).get('blab_demo', 'tbl_1', '01號桌');
  assert.equal(activeOrderAfterPaid, undefined);
});
