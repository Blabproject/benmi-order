import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const WORKER_SRC = path.join(ROOT_DIR, 'benmi-worker-official', 'src');
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'benmi-worker-official', 'migrations');

const require = createRequire(import.meta.url);
const ts = require(path.join(ROOT_DIR, 'benmi-worker-official', 'node_modules', 'typescript'));

function installTsExtension() {
  if (require.extensions['.ts']?.__benmiMultilingual) return;
  const loader = (module, filename) => {
    const raw = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(raw, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
      fileName: filename,
    }).outputText;
    module._compile(compiled, filename);
  };
  loader.__benmiMultilingual = true;
  require.extensions['.ts'] = loader;
}

installTsExtension();

const menuI18n = require(path.join(WORKER_SRC, 'modules', 'menu-i18n.ts'));
const menuAiTranslate = require(path.join(WORKER_SRC, 'modules', 'menu-ai-translate.ts'));
const { getConfig, updateConfig } = require(path.join(WORKER_SRC, 'modules', 'config.ts'));
const { getTenantBootstrap } = require(path.join(WORKER_SRC, 'modules', 'bootstrap.ts'));
const { buildOrderFlexMessage, buildAppendConfirmationFlexMessage } = require(
  path.join(WORKER_SRC, 'modules', 'line', 'templates', 'order-receipt.ts')
);

function wrapD1(db) {
  return {
    prepare(sql) {
      const makeStmt = (params = []) => ({
        sql,
        params,
        bind(...bound) {
          return makeStmt(bound);
        },
        async first() {
          return db.prepare(sql).get(...params) ?? null;
        },
        async all() {
          return { success: true, results: db.prepare(sql).all(...params) };
        },
        async run() {
          const info = db.prepare(sql).run(...params);
          return { success: true, results: [], meta: { changes: info.changes } };
        },
      });
      return makeStmt([]);
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const stmt of statements) {
          if (/^\s*(SELECT|PRAGMA)/i.test(stmt.sql)) {
            results.push({ success: true, results: db.prepare(stmt.sql).all(...(stmt.params || [])) });
          } else {
            results.push(await stmt.run());
          }
        }
        db.exec('COMMIT');
        return results;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

function createFullMigratedDb(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());

  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    if (file === '0091_multilingual_menu_i18n.sql') {
      // Seed canonical blab_demo & legacy benmi records right before 0091 runs,
      // mirroring production state prior to applying migration 0091.
      db.exec(`
        INSERT OR IGNORE INTO tenants (id) VALUES ('blab_demo'), ('benmi');
        INSERT OR IGNORE INTO tenant_lifecycle (tenant_id, state) VALUES ('blab_demo', 'active'), ('benmi', 'active');
        INSERT OR IGNORE INTO tenant_config (tenant_id, brand_name, locale, is_active, features)
        VALUES
          ('blab_demo', '本米測試鹽水雞', 'zh-TW', 1, '["dine_in"]'),
          ('benmi', 'Benmi 越式法國麵包', 'zh-TW', 1, '[]');

        INSERT OR IGNORE INTO menu_categories (id, tenant_id, slug, name, short_name, sort_order, category_type)
        VALUES
          ('cat_demo_meat', 'blab_demo', 'meat', '肉類主食', '肉類', 1, 'catalog'),
          ('cat_demo_veggie', 'blab_demo', 'veggie', '蔬菜配料 (1份$35 / 3份$100)', '蔬菜', 2, 'catalog'),
          ('cat_benmi_main', 'benmi', 'main', '越式法國麵包', '法國麵包', 1, 'catalog');

        INSERT OR IGNORE INTO menu_items (id, tenant_id, category_id, name, price, badge_text, sort_order, item_type)
        VALUES
          ('item_demo_meat_01', 'blab_demo', 'cat_demo_meat', '雞胸肉', 65, '推薦', 1, 'standard'),
          ('item_benmi_01', 'benmi', 'cat_benmi_main', '招牌烤肉法國麵包', 95, '', 1, 'standard');

        INSERT OR IGNORE INTO modifier_groups (id, tenant_id, name, selection_type, is_required, min_selection, max_selection, sort_order, scope, auto_popup)
        VALUES
          ('demo_flavor', 'blab_demo', '口味選擇', 'single', 1, 1, 1, 1, 'order', 1);

        INSERT OR IGNORE INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json)
        VALUES
          ('demo_flavor_清爽檸檬', 'blab_demo', 'demo_flavor', '清爽檸檬', 0, 1, 1, '["不加香油","不加鹽巴"]');

        INSERT OR IGNORE INTO menu_catalog_revisions (tenant_id, revision)
        VALUES ('blab_demo', 1), ('benmi', 1);
      `);
    }
    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }

  const kvStore = new Map();
  const deletedKeys = [];
  const ORDER_STATE = {
    async get(key) {
      return kvStore.has(key) ? kvStore.get(key) : null;
    },
    async put(key, value) {
      kvStore.set(key, String(value));
    },
    async delete(key) {
      kvStore.delete(key);
      deletedKeys.push(key);
    },
  };

  const env = {
    DB: wrapD1(db),
    ORDER_STATE,
    UNIFIED_MENU_ENABLED: 'true',
    ORDER_DETAIL_WRITES: 'true',
    MULTILINGUAL_TENANTS: '["blab_demo"]',
  };

  return { db, env, kvStore, deletedKeys };
}

function collectTextNodes(node) {
  if (!node || typeof node !== 'object') return [];
  const out = [];
  if (typeof node.text === 'string') out.push(node.text);
  for (const val of Object.values(node)) {
    if (Array.isArray(val)) {
      for (const item of val) out.push(...collectTextNodes(item));
    } else if (val && typeof val === 'object') {
      out.push(...collectTextNodes(val));
    }
  }
  return out;
}

test('menu-i18n helpers parse, merge sub_options, check canary gating, and resolve localized fallback', () => {
  const parsed = menuI18n.parseI18nJson(
    '{"en":{"name":" Chicken Breast ","sub_options":{"不加香油":" No Sesame Oil ","drop":"   "}},"vi":{}}'
  );
  assert.deepEqual(parsed, {
    en: {
      name: 'Chicken Breast',
      sub_options: { '不加香油': 'No Sesame Oil' },
    },
  });

  const merged = menuI18n.mergeI18nMaps(parsed, {
    en: { sub_options: { '不加鹽巴': 'No Salt' } },
    vi: { name: 'Ức gà' },
  });
  assert.deepEqual(merged, {
    en: {
      name: 'Chicken Breast',
      sub_options: {
        '不加香油': 'No Sesame Oil',
        '不加鹽巴': 'No Salt',
      },
    },
    vi: { name: 'Ức gà' },
  });

  assert.equal(menuI18n.serializeI18nJson({}), '{}');
  assert.deepEqual(menuI18n.parseSupportedLocales('["zh-TW","en","vi","en"]'), ['zh-TW', 'en', 'vi']);

  const env = { MULTILINGUAL_TENANTS: '["blab_demo"]' };
  assert.equal(menuI18n.isMultilingualCanaryEnabled('blab_demo', env), true);
  assert.equal(menuI18n.isMultilingualCanaryEnabled('benmi', env), false);
  assert.equal(menuI18n.isMultilingualCanaryEnabled('benmi', env, { features: ['multilingual'] }), true);
  assert.equal(menuI18n.isMultilingualCanaryEnabled('benmi', env, { features: ['i18n'] }), true);
  assert.equal(menuI18n.isMultilingualCanaryEnabled('new_shop', env, { hasCatalogI18n: true }), false);

  const entity = { name: '雞胸肉', title: '雞胸肉', i18n: merged };
  assert.equal(menuI18n.resolveLocalizedField(entity, 'vi', 'title'), 'Ức gà');
  assert.equal(menuI18n.resolveLocalizedField(entity, 'ja', 'name'), '雞胸肉');
});

test('menu-ai-translate uses Cloudflare Workers AI directly with model fallback and D1 persistence', async (t) => {
  // 0. Non-entitled tenant -> 403 FEATURE_LOCKED before invoking Workers AI
  {
    const req = new Request('https://worker.test/api/menu/ai-translate?tenant_id=benmi', {
      method: 'POST',
      body: JSON.stringify({ entries: [{ type: 'item', id: 'i1', name: '雞胸肉' }] }),
    });
    const res = await menuAiTranslate.handleMenuAiTranslate(req, { MULTILINGUAL_TENANTS: '["blab_demo"]' });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, 'FEATURE_LOCKED');
    assert.equal(body.feature, 'multilingual');
  }

  // 1. Missing env.AI binding -> 503
  {
    const req = new Request('https://worker.test/api/menu/ai-translate?tenant_id=blab_demo', {
      method: 'POST',
      body: JSON.stringify({ entries: [{ type: 'item', id: 'i1', name: '雞胸肉' }] }),
    });
    const res = await menuAiTranslate.handleMenuAiTranslate(req, { MULTILINGUAL_TENANTS: '["blab_demo"]' });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, 'CLOUDFLARE_AI_UNAVAILABLE');
  }

  // 2. Preview mode (applyToDatabase: false) splits en (qwen) vs vi (gemma-4) concurrently and merges output
  {
    const aiCalls = [];
    const req = new Request('https://worker.test/api/menu/ai-translate?tenant_id=blab_demo', {
      method: 'POST',
      body: JSON.stringify({
        applyToDatabase: false,
        sourceLocale: 'zh-TW',
        targetLocales: ['en', 'vi'],
        entries: [
          { type: 'item', id: 'item_1', name: '雞胸肉', badge_text: '推薦' },
          { type: 'option', id: 'opt_1', name: '清爽檸檬', sub_options: ['不加香油'] },
        ],
      }),
    });
    const res = await menuAiTranslate.handleMenuAiTranslate(req, {
      MULTILINGUAL_TENANTS: '["blab_demo"]',
      AI: {
        async run(model, input) {
          aiCalls.push({ model, input });
          const reqTargets = JSON.parse(input.messages[1].content).targetLocales;
          const out = {
            'item:item_1': {},
            'option:opt_1': {},
          };
          if (reqTargets.includes('en')) {
            out['item:item_1'].en = { name: 'Chicken Breast', badge_text: 'Recommended' };
            out['option:opt_1'].en = { name: 'Refreshing Lemon', sub_options: { '不加香油': 'No Sesame Oil' } };
          }
          if (reqTargets.includes('vi')) {
            out['item:item_1'].vi = { name: 'Ức gà', badge_text: 'Gợi ý' };
            out['option:opt_1'].vi = { name: 'Chanh thanh mát', sub_options: { '不加香油': 'Không dầu mè' } };
          }
          return {
            response: JSON.stringify({ translations: out }),
          };
        },
      },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.deepEqual(data.modelByLocale, {
      en: '@cf/qwen/qwen3-30b-a3b-fp8',
      vi: '@cf/google/gemma-4-26b-a4b-it',
    });
    assert.equal(data.appliedToDatabase, false);
    assert.equal(data.persistedCount, 0);
    assert.equal(data.translations['option:opt_1'].en.sub_options['不加香油'], 'No Sesame Oil');
    assert.equal(data.translations['option:opt_1'].vi.sub_options['不加香油'], 'Không dầu mè');
    assert.equal(aiCalls.length, 2);
  }

  // 3. Language-profile fallback chains: CJK/EN (qwen -> gemma-4) & SEA (gemma-4 -> sea-lion)
  {
    const seaModelsTried = [];
    const seaReq = new Request('https://worker.test/api/menu/ai-translate?tenant_id=blab_demo', {
      method: 'POST',
      body: JSON.stringify({
        applyToDatabase: false,
        targetLocales: ['vi'],
        entries: [{ type: 'category', id: 'c1', name: '蔬菜' }],
      }),
    });
    const seaRes = await menuAiTranslate.handleMenuAiTranslate(seaReq, {
      MULTILINGUAL_TENANTS: '["blab_demo"]',
      AI: {
        async run(model) {
          seaModelsTried.push(model);
          if (model === '@cf/google/gemma-4-26b-a4b-it') {
            throw new Error('Model temporarily busy');
          }
          return {
            response: JSON.stringify({
              translations: {
                'category:c1': {
                  vi: { name: 'Rau củ' },
                },
              },
            }),
          };
        },
      },
    });
    assert.equal(seaRes.status, 200);
    const seaData = await seaRes.json();
    assert.deepEqual(seaModelsTried, [
      '@cf/google/gemma-4-26b-a4b-it',
      '@cf/aisingapore/gemma-sea-lion-v4-27b-it',
    ]);
    assert.equal(seaData.modelUsed, '@cf/aisingapore/gemma-sea-lion-v4-27b-it');
    assert.equal(seaData.byId.c1.vi.name, 'Rau củ');

    const enModelsTried = [];
    const enReq = new Request('https://worker.test/api/menu/ai-translate?tenant_id=blab_demo', {
      method: 'POST',
      body: JSON.stringify({
        applyToDatabase: false,
        targetLocales: ['en'],
        entries: [{ type: 'category', id: 'c2', name: '肉品' }],
      }),
    });
    const enRes = await menuAiTranslate.handleMenuAiTranslate(enReq, {
      MULTILINGUAL_TENANTS: '["blab_demo"]',
      AI: {
        async run(model) {
          enModelsTried.push(model);
          if (model === '@cf/qwen/qwen3-30b-a3b-fp8') {
            throw new Error('Qwen rate limited');
          }
          return {
            response: JSON.stringify({
              translations: {
                'category:c2': {
                  en: { name: 'Meats' },
                },
              },
            }),
          };
        },
      },
    });
    assert.equal(enRes.status, 200);
    const enData = await enRes.json();
    assert.deepEqual(enModelsTried, [
      '@cf/qwen/qwen3-30b-a3b-fp8',
      '@cf/google/gemma-4-26b-a4b-it',
    ]);
    assert.equal(enData.byId.c2.en.name, 'Meats');
  }

  // 4. applyToDatabase: true reads D1 (modifier_groups.name & modifier_options.sub_options_json) & writes merged i18n_json
  {
    const { db, env, deletedKeys } = createFullMigratedDb(t);
    db.exec(`
      INSERT INTO menu_categories (id, tenant_id, slug, name, sort_order, category_type, i18n_json)
      VALUES ('cat_new', 'blab_demo', 'drinks', '飲品', 9, 'catalog', '{}');
      INSERT INTO menu_items (id, tenant_id, category_id, name, price, sort_order, i18n_json)
      VALUES ('item_new', 'blab_demo', 'cat_new', '檸檬紅茶', 45, 1, '{"en":{"name":"Lemon Black Tea"}}');
      INSERT INTO modifier_groups (id, tenant_id, name, selection_type, sort_order, scope, i18n_json)
      VALUES ('grp_ice', 'blab_demo', '冰塊調整', 'single', 2, 'item', '{}');
      INSERT INTO modifier_options (id, tenant_id, group_id, name, price, sort_order, sub_options_json, i18n_json)
      VALUES ('opt_ice_less', 'blab_demo', 'grp_ice', '少冰', 0, 1, '[{"name":"加檸檬片"},"去檸檬"]', '{}');
    `);

    const aiEnv = {
      ...env,
      AI: {
        async run(_model, input) {
          const parsedInput = JSON.parse(input.messages[1].content);
          const out = {};
          for (const item of parsedInput.items) {
            if (item.key === 'category:cat_new') {
              out[item.key] = { en: { name: 'Drinks' }, vi: { name: 'Đồ uống' } };
            } else if (item.key === 'item:item_new') {
              out[item.key] = { en: { name: 'Lemon Iced Tea' }, vi: { name: 'Trà đen chanh' } };
            } else if (item.key === 'option_group:grp_ice') {
              out[item.key] = { en: { title: 'Ice Level' }, vi: { title: 'Mức đá' } };
            } else if (item.key === 'option:opt_ice_less') {
              out[item.key] = {
                en: {
                  name: 'Less Ice',
                  sub_options: { '加檸檬片': 'With Lemon Slice', '去檸檬': 'No Lemon' },
                },
                vi: {
                  name: 'Ít đá',
                  sub_options: { '加檸檬片': 'Thêm lát chanh', '去檸檬': 'Không chanh' },
                },
              };
            }
          }
          return { response: JSON.stringify({ translations: out }) };
        },
      },
    };

    const req = new Request('https://worker.test/api/menu/ai-translate?tenant_id=blab_demo', {
      method: 'POST',
      body: JSON.stringify({
        applyToDatabase: true,
        onlyMissing: true,
        targetLocales: ['en', 'vi'],
      }),
    });

    const res = await menuAiTranslate.handleMenuAiTranslate(req, aiEnv);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.appliedToDatabase, true);
    assert.equal(data.persistedCount, 4);

    const savedGroup = db.prepare('SELECT i18n_json FROM modifier_groups WHERE id = ?').get('grp_ice');
    assert.equal(JSON.parse(savedGroup.i18n_json).vi.title, 'Mức đá');

    const savedOpt = db.prepare('SELECT i18n_json FROM modifier_options WHERE id = ?').get('opt_ice_less');
    assert.equal(JSON.parse(savedOpt.i18n_json).en.sub_options['加檸檬片'], 'With Lemon Slice');

    assert.ok(deletedKeys.includes('tenant:blab_demo:bootstrap:v2'));
  }

  // 5. Thinking-off params, JSON object response parsing, param fallback, and concurrent chunking (>24 entries)
  {
    const capturedInputs = [];
    let activeCount = 0;
    let maxConcurrent = 0;
    const bulkEntries = Array.from({ length: 50 }, (_, idx) => ({
      type: 'item',
      id: `bulk_${idx}`,
      name: `菜品 ${idx}`,
    }));

    const req = new Request('https://worker.test/api/menu/ai-translate?tenant_id=blab_demo', {
      method: 'POST',
      body: JSON.stringify({
        applyToDatabase: false,
        targetLocales: ['en', 'vi'],
        entries: bulkEntries,
      }),
    });

    const res = await menuAiTranslate.handleMenuAiTranslate(req, {
      MULTILINGUAL_TENANTS: '["blab_demo"]',
      AI: {
        async run(model, input) {
          capturedInputs.push({ model, input });
          // Simulate first chunk rejecting optional reasoning/json_object params to test graceful standard-param retry
          if (input.reasoning_effort === 'none' && capturedInputs.length === 1) {
            throw new Error('Invalid input schema: unexpected property reasoning_effort');
          }
          activeCount++;
          maxConcurrent = Math.max(maxConcurrent, activeCount);
          await new Promise((r) => setTimeout(r, 10));
          activeCount--;
          const items = JSON.parse(input.messages[1].content).items;
          const translations = {};
          for (const item of items) {
            translations[item.key] = {
              en: { name: `Item ${item.key}` },
              vi: { name: `Món ${item.key}` },
            };
          }
          // Return pre-parsed object instead of JSON string on response_format models
          return { response: { translations } };
        },
      },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.translatedCount, 50);
    assert.equal(data.byId.bulk_0.en.name, 'Item item:bulk_0');
    assert.equal(data.byId.bulk_49.vi.name, 'Món item:bulk_49');
    assert.ok(maxConcurrent >= 2, `Expected concurrent chunk calls >= 2, got ${maxConcurrent}`);
    assert.equal(capturedInputs[0].input.response_format.type, 'json_object');
    assert.equal(capturedInputs[0].input.reasoning_effort, 'none');
    assert.equal(capturedInputs[0].input.chat_template_kwargs.enable_thinking, false);
    assert.ok(capturedInputs.some((c) => c.input.reasoning_effort === undefined));
  }
});

test('bootstrap enforces canary gating for blab_demo while leaving legacy benmi untouched', async (t) => {
  const { env } = createFullMigratedDb(t);

  const demoRes = await getTenantBootstrap(
    new Request('https://worker.test/api/tenant/bootstrap?tenant_id=blab_demo&nocache=1'),
    env
  );
  assert.equal(demoRes.status, 200);
  const demo = await demoRes.json();

  assert.equal(demo.tenant.i18nEnabled, true);
  assert.deepEqual(demo.tenant.supportedLocales, ['zh-TW', 'en', 'vi']);
  assert.equal(demo.tenant.i18n.en.brand_name, 'BLAB Demo - Gancheng Salted Chicken');

  const meatCat = demo.catalog.find((c) => c.id === 'cat_demo_meat');
  assert.equal(meatCat.i18n.en.name, 'Meats');
  assert.equal(meatCat.i18n.vi.name, 'Các loại thịt');
  assert.equal(meatCat.items[0].i18n.en.name, 'Chicken Breast');

  const flavorGroup = demo.customizations.find((c) => c.id === 'demo_flavor');
  assert.equal(flavorGroup.i18n.vi.title, 'Chọn hương vị');
  assert.equal(flavorGroup.options[0].i18n.en.sub_options['不加香油'], 'No Sesame Oil');

  // Legacy tenant benmi (no canary flag, no i18n_json) stays i18nEnabled: false
  const legacyRes = await getTenantBootstrap(
    new Request('https://worker.test/api/tenant/bootstrap?tenant_id=benmi&nocache=1'),
    env
  );
  assert.equal(legacyRes.status, 200);
  const legacy = await legacyRes.json();
  assert.equal(legacy.tenant.i18nEnabled, false);
});

test('order-receipt renders bilingual LINE Flex receipts for en/vi while preserving canonical item names', () => {
  const tenantCtx = {
    tenantId: 'blab_demo',
    brandName: 'BLAB Demo',
    brandColor: '#059669',
    locale: 'zh-TW',
    allowScheduledPickup: true,
    liffUrl: 'https://liff.line.me/demo-liff',
  };
  const order = {
    key: 'ORD-001',
    displayKey: 'ORD-001',
    customer: 'Alex',
    time: '12:30',
    total: 115,
    content: '雞胸肉 ×1\n鹽水蔬菜 ×1',
    diningOption: 'dine_in',
    tableNumber: '05',
  };
  const items = [
    { name: '雞胸肉', quantity: 1, price: 65, subtotal: 65 },
    { name: '鹽水高麗菜', quantity: 1, price: 50, subtotal: 50 },
  ];

  const enFlex = buildOrderFlexMessage(order, tenantCtx, items, [], 'en');
  const enText = collectTextNodes(enFlex).join('\n');
  assert.ok(enText.includes('Order Details / 訂單明細'));
  assert.ok(enText.includes('Dine-in (05) · 內用 (05 桌)'));
  assert.ok(enText.includes('Items / 訂單品項'));
  assert.ok(enText.includes('雞胸肉'));
  assert.equal(enFlex.footer.contents[0].action.label, 'Add Items / 加點');
  assert.ok(enFlex.footer.contents[0].action.uri.includes('&lang=en'));

  const viFlex = buildOrderFlexMessage({ ...order, diningOption: 'takeaway', tableNumber: null }, tenantCtx, items, [], 'vi');
  const viText = collectTextNodes(viFlex).join('\n');
  assert.ok(viText.includes('Chi tiết đơn / 訂單明細'));
  assert.ok(viText.includes('Mang về · 外帶自取'));
  assert.ok(viText.includes('Món đã đặt / 訂單品項'));

  const zhFlex = buildOrderFlexMessage({ ...order, diningOption: 'takeaway', tableNumber: null }, tenantCtx, items, [], 'zh-TW');
  const zhText = collectTextNodes(zhFlex).join('\n');
  assert.ok(zhText.includes('訂單明細'));
  assert.ok(!zhText.includes('Order Details'));
  assert.ok(!zhText.includes('Chi tiết đơn'));

  const appendViFlex = buildAppendConfirmationFlexMessage(order, '高麗菜 ×1', 35, 2, tenantCtx, [{ name: '高麗菜', quantity: 1, price: 35, subtotal: 35 }], 'vi');
  const appendViText = collectTextNodes(appendViFlex).join('\n');
  assert.ok(appendViText.includes('Gọi thêm (Lần 2) · 現場加點'));
  assert.ok(appendViFlex.footer.contents[0].action.uri.includes('&lang=vi'));
});

function createLiffVm({ search = '?tenant_id=blab_demo', navigatorLanguage = 'zh-TW' } = {}) {
  const elements = new Map();
  const makeEl = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        dataset: {},
        style: {},
        attributes: new Map(),
        setAttribute(k, v) { this.attributes.set(k, String(v)); },
        getAttribute(k) { return this.attributes.get(k) || null; },
        removeAttribute(k) { this.attributes.delete(k); },
        innerText: '',
        innerHTML: '',
        value: '',
        children: [],
        appendChild(child) { this.children.push(child); return child; },
        classList: {
          classes: new Set(),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          toggle(c, f) { f ? this.classes.add(c) : this.classes.delete(c); },
          contains(c) { return this.classes.has(c); },
        },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0 }; },
      });
    }
    return elements.get(id);
  };

  const storageData = new Map();
  const sandbox = {
    console,
    Intl,
    Date,
    Math,
    JSON,
    RegExp,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    URLSearchParams,
    AbortController,
    AbortSignal,
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    addEventListener() {},
    removeEventListener() {},
    location: { search, hostname: 'order.blabfood.app' },
    navigator: { userAgent: 'LINE/14.0', language: navigatorLanguage, languages: [navigatorLanguage] },
    localStorage: {
      getItem: (k) => (storageData.has(k) ? storageData.get(k) : null),
      setItem: (k, v) => storageData.set(k, String(v)),
      removeItem: (k) => storageData.delete(k),
    },
    sessionStorage: {
      getItem: () => null,
      setItem() {},
      removeItem() {},
    },
    document: {
      documentElement: { lang: 'zh-TW', style: { setProperty() {}, scrollBehavior: '' } },
      body: { style: {}, appendChild() {} },
      getElementById: makeEl,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      createElement: (tag) => makeEl(`__tmp_${tag}_${Math.random()}`),
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  for (const file of [
    'js/order-code.js',
    'js/client-i18n.js',
    'js/client-core.js',
    'js/client-menu.js',
    'js/client-customizations.js',
    'js/client-cart.js',
    'js/bundle-builder-v2.js',
    'js/client-checkout.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT_DIR, file), 'utf8'), sandbox, { filename: file });
  }

  return { sandbox, makeEl };
}

test('Customer LIFF VM live locale switching translates UI, menu, and sub_options while preserving canonical state', () => {
  const { sandbox, makeEl } = createLiffVm({ navigatorLanguage: 'vi-VN' });

  const bootstrap = {
    tenant: {
      id: 'blab_demo',
      brandName: '本米測試鹽水雞',
      locale: 'zh-TW',
      i18nEnabled: true,
      supportedLocales: ['zh-TW', 'en', 'vi'],
      i18n: {
        en: { brand_name: 'BLAB Demo - Salted Chicken' },
        vi: { brand_name: 'BLAB Demo - Gà Nước Muối' },
      },
      allowDineIn: true,
      allowScheduledPickup: true,
    },
    catalog: [
      {
        id: 'cat_demo_meat',
        slug: 'cat_demo_meat',
        name: '肉類主食',
        shortName: '肉類',
        i18n: {
          en: { name: 'Meats', short_name: 'Meats' },
          vi: { name: 'Các loại thịt', short_name: 'Thịt' },
        },
        items: [
          {
            id: 'item_demo_meat_01',
            name: '雞胸肉',
            price: 65,
            badgeText: '推薦',
            i18n: {
              en: { name: 'Chicken Breast', badge_text: 'Recommended' },
              vi: { name: 'Ức gà', badge_text: 'Gợi ý' },
            },
          },
        ],
      },
    ],
    customizations: [
      {
        id: 'demo_flavor',
        key: 'demo_flavor',
        title: '口味選擇',
        type: 'radio',
        scope: 'order',
        i18n: {
          en: { title: 'Flavor Selection' },
          vi: { title: 'Chọn hương vị' },
        },
        options: [
          {
            id: 'demo_flavor_清爽檸檬',
            name: '清爽檸檬',
            price: 0,
            isDefault: true,
            subOptions: ['不加香油', '不加鹽巴'],
            i18n: {
              en: {
                name: 'Refreshing Lemon',
                sub_options: { '不加香油': 'No Sesame Oil', '不加鹽巴': 'No Salt' },
              },
              vi: {
                name: 'Chanh thanh mát',
                sub_options: { '不加香油': 'Không dầu mè', '不加鹽巴': 'Không muối' },
              },
            },
          },
        ],
      },
    ],
  };

  sandbox.bootstrapData = bootstrap;
  const detected = sandbox.initClientLocale(bootstrap.tenant);
  assert.equal(detected, 'vi');

  // Switcher dropdown is visible for canary tenant
  sandbox.renderClientLanguageSwitcher(bootstrap.tenant);
  const switcher = makeEl('client-lang-switcher');
  const selectEl = makeEl('client-lang-select');
  assert.equal(switcher.style.display, 'flex');
  assert.ok(selectEl.innerHTML.includes('value="en"'));
  assert.ok(selectEl.innerHTML.includes('value="vi"'));
  assert.equal(selectEl.value, 'vi');

  // Populate cart & customization state using canonical keys & names
  const cartKey = 'cat_demo_meat_雞胸肉';
  sandbox.cart = { [cartKey]: 1 };
  sandbox.customizeData = {
    [cartKey]: [{
      single: { demo_flavor: '清爽檸檬' },
      multiple: {},
      selectedDetails: {
        'demo_flavor_清爽檸檬': {
          id: 'demo_flavor_清爽檸檬',
          name: '清爽檸檬',
          price: 0,
          subOption: { name: '不加香油', price: 0 },
        },
      },
    }],
  };

  // Switch live to English
  sandbox.setClientLocale('en');
  assert.equal(sandbox.currentClientLocale, 'en');
  assert.equal(sandbox.document.documentElement.lang, 'en');
  assert.equal(makeEl('client-lang-select').value, 'en');
  assert.equal(sandbox.locText(bootstrap.tenant, 'brandName'), 'BLAB Demo - Salted Chicken');
  assert.equal(sandbox.ct('checkout_cart_title'), 'Your Cart');
  assert.equal(sandbox.locText(bootstrap.catalog[0], 'name'), 'Meats');
  assert.equal(sandbox.locText(bootstrap.catalog[0].items[0], 'name'), 'Chicken Breast');
  assert.equal(
    sandbox.locSubOptionText(bootstrap.customizations[0].options[0], '不加香油'),
    'No Sesame Oil'
  );

  // Switch live to Vietnamese
  sandbox.setClientLocale('vi');
  assert.equal(sandbox.ct('checkout_cart_title'), 'Giỏ hàng của bạn');
  assert.equal(sandbox.locText(bootstrap.catalog[0].items[0], 'name'), 'Ức gà');
  assert.equal(
    sandbox.locSubOptionText(bootstrap.customizations[0].options[0], '不加香油'),
    'Không dầu mè'
  );

  // Canonical state & structured order payload must remain untranslated store language
  assert.equal(sandbox.cart[cartKey], 1);
  assert.equal(sandbox.customizeData[cartKey][0].single.demo_flavor, '清爽檸檬');
  const structured = sandbox.buildStructuredCartItems();
  assert.equal(structured.length, 1);
  assert.equal(structured[0].name, '雞胸肉');
  assert.equal(sandbox._coCustomerLocale(), 'vi');

  // Item card renders editable description, prioritizes merchant description over legacy translations, and localizes i18n description
  const cardItem = {
    id: 'item_desc_01',
    name: '燒肉',
    price: 80,
    description: '豬五花、特製醬汁',
    i18n: {
      en: { name: 'Roast Pork', description: 'Pork belly with house sauce' },
      vi: { name: 'Thịt quay', description: 'Thịt ba chỉ sốt đặc biệt' },
    },
  };
  sandbox.bootstrapData.translations = { '燒肉': 'Legacy hardcoded fallback' };
  sandbox.setClientLocale('zh-TW');
  const zhCard = sandbox.createDynamicItemCard('cat_demo_meat', cardItem, bootstrap.catalog[0]);
  assert.ok(zhCard.innerHTML.includes('豬五花、特製醬汁'));
  assert.ok(!zhCard.innerHTML.includes('Legacy hardcoded fallback'));

  sandbox.setClientLocale('en');
  const enCard = sandbox.createDynamicItemCard('cat_demo_meat', cardItem, bootstrap.catalog[0]);
  assert.ok(enCard.innerHTML.includes('Pork belly with house sauce'));

  sandbox.setClientLocale('vi');
  const viCard = sandbox.createDynamicItemCard('cat_demo_meat', cardItem, bootstrap.catalog[0]);
  assert.ok(viCard.innerHTML.includes('Thịt ba chỉ sốt đặc biệt'));

  // Legacy tenant stays locked to primary locale & switcher remains hidden (unless ?lang= overrides)
  const legacyVm = createLiffVm({ search: '?tenant_id=benmi', navigatorLanguage: 'en-US' });
  const legacyTenant = {
    id: 'benmi',
    brandName: 'Benmi 越式法國麵包',
    locale: 'zh-TW',
    i18nEnabled: false,
    supportedLocales: ['zh-TW', 'en'],
  };
  legacyVm.sandbox.bootstrapData = { tenant: legacyTenant, catalog: [] };
  assert.equal(legacyVm.sandbox.initClientLocale(legacyTenant), 'zh-TW');
  legacyVm.sandbox.renderClientLanguageSwitcher(legacyTenant);
  assert.equal(legacyVm.makeEl('client-lang-switcher').style.display, 'none');

  const forcedLangVm = createLiffVm({ search: '?tenant_id=benmi&lang=en', navigatorLanguage: 'zh-TW' });
  forcedLangVm.sandbox.bootstrapData = { tenant: legacyTenant, catalog: [] };
  assert.equal(forcedLangVm.sandbox.initClientLocale(legacyTenant), 'zh-TW');

  const entitledTenant = { id: 'blab_demo', locale: 'zh-TW', i18nEnabled: true, supportedLocales: ['zh-TW', 'en', 'vi'] };
  const entitledForcedLangVm = createLiffVm({ search: '?tenant_id=blab_demo&lang=en', navigatorLanguage: 'zh-TW' });
  entitledForcedLangVm.sandbox.bootstrapData = { tenant: entitledTenant, catalog: [] };
  assert.equal(entitledForcedLangVm.sandbox.initClientLocale(entitledTenant), 'en');
});

test('bootstrap preserves i18n on item/category modifier_groups, legacy modifiers, and detects bundleRule.groups i18n', async (t) => {
  const { db, env } = createFullMigratedDb(t);

  // Add item-level and category-level unified modifier links plus legacy modifier category (packaged via multilingual feature)
  db.exec(`
    INSERT INTO tenants (id, name) VALUES ('t_mod_i18n', 'Modifier Test Shop');
    INSERT OR REPLACE INTO tenant_lifecycle (tenant_id, state) VALUES ('t_mod_i18n', 'active');
    INSERT OR REPLACE INTO tenant_config (tenant_id, brand_name, locale, is_active, features)
    VALUES ('t_mod_i18n', 'Modifier Test Shop', 'zh-TW', 1, '["multilingual"]');

    INSERT INTO menu_categories (id, tenant_id, name, slug, category_type, selection_type, allow_customization, applied_modifiers, sort_order, i18n_json)
    VALUES
      ('c_main', 't_mod_i18n', '主食', 'mains', 'catalog', 'single', 1, '["mod_legacy"]', 1, '{}'),
      ('mod_legacy_id', 't_mod_i18n', '配料區', 'mod_legacy', 'modifier', 'multiple', 1, '', 2, '{"en":{"name":"Toppings"},"vi":{"name":"Topping"}}');

    INSERT INTO menu_items (id, tenant_id, category_id, name, price, sort_order, i18n_json)
    VALUES
      ('it_main', 't_mod_i18n', 'c_main', '雞腿飯', 100, 1, '{}'),
      ('opt_leg_egg', 't_mod_i18n', 'mod_legacy_id', '溏心蛋', 20, 1, '{"en":{"name":"Soft-boiled Egg"},"vi":{"name":"Trứng lòng đào"}}');

    INSERT INTO modifier_groups (id, tenant_id, name, selection_type, sort_order, scope, i18n_json)
    VALUES
      ('mg_item_spice', 't_mod_i18n', '辣度', 'single', 1, 'item', '{"en":{"title":"Spiciness"},"vi":{"title":"Độ cay"}}'),
      ('mg_cat_sauce', 't_mod_i18n', '醬料', 'single', 2, 'category', '{"en":{"title":"Sauce"},"vi":{"title":"Nước sốt"}}');

    INSERT INTO modifier_options (id, tenant_id, group_id, name, price, sort_order, i18n_json)
    VALUES
      ('mo_mild', 't_mod_i18n', 'mg_item_spice', '小辣', 0, 1, '{"en":{"name":"Mild"},"vi":{"name":"Ít cay"}}'),
      ('mo_garlic', 't_mod_i18n', 'mg_cat_sauce', '蒜蓉', 0, 1, '{"en":{"name":"Garlic"},"vi":{"name":"Tỏi"}}');

    INSERT INTO item_modifier_links (tenant_id, item_id, group_id, sort_order)
    VALUES ('t_mod_i18n', 'it_main', 'mg_item_spice', 1);

    INSERT INTO category_modifier_links (tenant_id, category_id, group_id, sort_order)
    VALUES ('t_mod_i18n', 'c_main', 'mg_cat_sauce', 1);
  `);

  const res = await getTenantBootstrap(
    new Request('https://worker.test/api/tenant/bootstrap?tenant_id=t_mod_i18n&nocache=1'),
    { ...env, UNIFIED_MENU_ENABLED: 'false' }
  );
  assert.equal(res.status, 200);
  const payload = await res.json();

  assert.equal(payload.tenant.i18nEnabled, true);
  const cat = payload.catalog.find((c) => c.id === 'c_main');
  assert.equal(cat.modifierGroups[0].i18n.en.title, 'Sauce');
  assert.equal(cat.modifierGroups[0].options[0].i18n.vi.name, 'Tỏi');

  const item = cat.items[0];
  assert.equal(item.modifierGroups[0].i18n.en.title, 'Spiciness');
  assert.equal(item.modifierGroups[0].options[0].i18n.vi.name, 'Ít cay');

  const legacyMod = payload.modifiers.find((m) => m.slug === 'mod_legacy');
  assert.equal(legacyMod.i18n.en.name, 'Toppings');
  assert.equal(legacyMod.options[0].i18n.vi.name, 'Trứng lòng đào');

  // Verify entitled tenant unlocks i18nEnabled for bundleRule.groups only, while unsubscribed tenant with stray i18n_json stays locked
  db.exec(`
    INSERT INTO tenants (id, name) VALUES ('t_bundle_only', 'Bundle I18n Shop');
    INSERT OR REPLACE INTO tenant_lifecycle (tenant_id, state) VALUES ('t_bundle_only', 'active');
    INSERT OR REPLACE INTO tenant_config (tenant_id, brand_name, locale, is_active, features)
    VALUES ('t_bundle_only', 'Bundle I18n Shop', 'zh-TW', 1, '["multilingual"]');
    INSERT INTO menu_categories (id, tenant_id, name, slug, category_type, sort_order, i18n_json)
    VALUES ('c_b_only', 't_bundle_only', '單點', 'single', 'catalog', 1, '{}');
    INSERT INTO menu_items (id, tenant_id, category_id, name, price, sort_order, i18n_json)
    VALUES ('it_b_only', 't_bundle_only', 'c_b_only', '鹽水雞胸', 80, 1, '{}');
    INSERT INTO modifier_groups (id, tenant_id, name, selection_type, sort_order, scope, i18n_json)
    VALUES ('mg_b_spice', 't_bundle_only', '加辣', 'single', 1, 'item', '{"en":{"title":"Spicy Level"}}');
    INSERT INTO modifier_options (id, tenant_id, group_id, name, price, sort_order, i18n_json)
    VALUES ('mo_b_hot', 't_bundle_only', 'mg_b_spice', '大辣', 0, 1, '{"en":{"name":"Extra Spicy"}}');
    INSERT INTO item_modifier_links (tenant_id, item_id, group_id, sort_order)
    VALUES ('t_bundle_only', 'it_b_only', 'mg_b_spice', 1);

    INSERT INTO tenants (id, name) VALUES ('t_unsub_i18n', 'Unsubscribed Shop');
    INSERT OR REPLACE INTO tenant_lifecycle (tenant_id, state) VALUES ('t_unsub_i18n', 'active');
    INSERT OR REPLACE INTO tenant_config (tenant_id, brand_name, locale, is_active, features, supported_locales)
    VALUES ('t_unsub_i18n', 'Unsubscribed Shop', 'zh-TW', 1, '[]', '["zh-TW","en"]');
    INSERT INTO menu_categories (id, tenant_id, name, slug, category_type, sort_order, i18n_json)
    VALUES ('c_unsub', 't_unsub_i18n', '單點', 'single', 'catalog', 1, '{"en":{"name":"Single"}}');
    INSERT INTO menu_items (id, tenant_id, category_id, name, price, sort_order, i18n_json)
    VALUES ('it_unsub', 't_unsub_i18n', 'c_unsub', '鹽水雞胸', 80, 1, '{"en":{"name":"Chicken"}}');
  `);

  const bundleOnlyRes = await getTenantBootstrap(
    new Request('https://worker.test/api/tenant/bootstrap?tenant_id=t_bundle_only&nocache=1'),
    env
  );
  assert.equal(bundleOnlyRes.status, 200);
  const bundleOnlyPayload = await bundleOnlyRes.json();
  assert.equal(bundleOnlyPayload.tenant.i18nEnabled, true);
  assert.equal(bundleOnlyPayload.catalog[0].items[0].bundleRule.groups[0].i18n.en.title, 'Spicy Level');

  const unsubBootRes = await getTenantBootstrap(
    new Request('https://worker.test/api/tenant/bootstrap?tenant_id=t_unsub_i18n&nocache=1'),
    env
  );
  assert.equal(unsubBootRes.status, 200);
  const unsubBootPayload = await unsubBootRes.json();
  assert.equal(unsubBootPayload.tenant.i18nEnabled, false);
  assert.deepEqual(unsubBootPayload.tenant.supportedLocales, ['zh-TW']);
  assert.deepEqual(unsubBootPayload.tenant.i18n, {});
});

test('client-core, client-customizations, and client-bundle preserve i18n and switch option/bundle labels cleanly', () => {
  const { sandbox, makeEl } = createLiffVm({ navigatorLanguage: 'en-US' });
  vm.runInContext(fs.readFileSync(path.join(ROOT_DIR, 'js/client-bundle.js'), 'utf8'), sandbox, {
    filename: 'js/client-bundle.js',
  });

  const bootstrap = {
    tenant: {
      id: 'blab_demo',
      brandName: 'BLAB Demo',
      locale: 'zh-TW',
      i18nEnabled: true,
      supportedLocales: ['zh-TW', 'en', 'vi'],
      i18n: {},
    },
    catalog: [
      {
        id: 'cat_meats',
        slug: 'cat_meats',
        name: '肉品類',
        i18n: { en: { name: 'Meats' }, vi: { name: 'Thịt' } },
        allowCustomization: true,
        appliedModifiers: ['mod_extra'],
        modifierGroups: [
          {
            id: 'mg_spice',
            name: '加辣',
            i18n: { en: { title: 'Spicy Level' }, vi: { title: 'Mức độ cay' } },
            selectionType: 'single',
            options: [
              { id: 'opt_hot', name: '大辣', price: 0, i18n: { en: { name: 'Extra Spicy' }, vi: { name: 'Cay nhiều' } } },
            ],
          },
        ],
        items: [
          {
            id: 'it_combo',
            name: '超值套餐',
            i18n: { en: { name: 'Value Combo' }, vi: { name: 'Combo Tiết Kiệm' } },
            price: 150,
            modifierGroups: [
              {
                id: 'mg_doneness',
                name: '熟度',
                i18n: { en: { title: 'Doneness' }, vi: { title: 'Độ chín' } },
                selectionType: 'single',
                options: [
                  {
                    id: 'opt_well',
                    name: '全熟',
                    price: 0,
                    subOptions: ['切塊'],
                    i18n: { en: { name: 'Well Done', sub_options: { '切塊': 'Diced' } }, vi: { name: 'Chín kỹ' } },
                  },
                ],
              },
            ],
            bundleRule: {
              version: 1,
              groups: [
                {
                  id: 'bg_sides',
                  name: '配菜',
                  i18n: { en: { title: 'Side Dishes' }, vi: { title: 'Món ăn kèm' } },
                  minQuantity: 1,
                  maxQuantity: 1,
                  eligibleItems: [
                    {
                      id: 'side_corn',
                      name: '玉米筍',
                      categoryId: 'cat_meats',
                      surcharge: 0,
                      i18n: { en: { name: 'Baby Corn' }, vi: { name: 'Bắp non' } },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
    modifiers: [],
    customizations: [],
  };

  sandbox.bootstrapData = bootstrap;
  sandbox.initClientLocale(bootstrap.tenant);
  sandbox.setClientLocale('en');

  const effective = sandbox.getEffectiveItemModifierGroups('cat_meats_超值套餐', 'cat_meats');
  assert.equal(effective[0].i18n.en.title, 'Doneness');
  assert.equal(effective[0].options[0].i18n.en.name, 'Well Done');
  assert.deepEqual(effective[0].options[0].subOptions, ['切塊']);
  assert.equal(effective[1].i18n.vi.title, 'Mức độ cay');
  assert.equal(effective[1].options[0].i18n.en.name, 'Extra Spicy');

  sandbox.openBundleBuilderModal('cat_meats', '超值套餐', 0);
  assert.equal(makeEl('bundle-modal-item-name').innerText, 'Value Combo');
  assert.ok(makeEl('bundle-items-list').innerHTML.includes('Baby Corn'));
  assert.ok(makeEl('bundle-addons-container').innerHTML.includes('Spicy Level'));
  assert.ok(makeEl('bundle-addons-container').innerHTML.includes('Extra Spicy'));
  assert.ok(makeEl('bundle-confirm-btn').innerHTML.includes('Side Dishes'));

  sandbox.setClientLocale('vi');
  sandbox.bundleRefreshLocale();
  assert.equal(makeEl('bundle-modal-item-name').innerText, 'Combo Tiết Kiệm');
  assert.ok(makeEl('bundle-items-list').innerHTML.includes('Bắp non'));
  assert.ok(makeEl('bundle-addons-container').innerHTML.includes('Mức độ cay'));
  assert.ok(makeEl('bundle-addons-container').innerHTML.includes('Cay nhiều'));
  assert.ok(makeEl('bundle-confirm-btn').innerHTML.includes('Món ăn kèm'));
});

test('per-tenant supportedLocales syncs config API, AI defaults, language-profile routing, and LIFF switcher', async (t) => {
  const { db, env, deletedKeys } = createFullMigratedDb(t);

  // 1. Initial GET /api/config returns supportedLocales & i18nEnabled from D1
  const initialCfgRes = await getConfig(
    new Request('https://worker.test/api/config?tenant_id=blab_demo'),
    env
  );
  assert.equal(initialCfgRes.status, 200);
  const initialCfg = await initialCfgRes.json();
  assert.equal(initialCfg.locale, 'zh-TW');
  assert.deepEqual(initialCfg.supportedLocales, ['zh-TW', 'en', 'vi']);
  assert.equal(initialCfg.i18nEnabled, true);

  // 2. POST /api/config rejects non-array supportedLocales and persists ["zh-TW", "en"] cleanly
  const badRes = await updateConfig(
    new Request('https://worker.test/api/config?tenant_id=blab_demo', {
      method: 'POST',
      body: JSON.stringify({ supportedLocales: 'en' }),
    }),
    env
  );
  assert.equal(badRes.status, 400);

  const saveRes = await updateConfig(
    new Request('https://worker.test/api/config?tenant_id=blab_demo', {
      method: 'POST',
      body: JSON.stringify({ supportedLocales: ['en'] }), // primary zh-TW is auto-retained at index 0
    }),
    env
  );
  assert.equal(saveRes.status, 200);
  const saveData = await saveRes.json();
  assert.deepEqual(saveData.supportedLocales, ['zh-TW', 'en']);
  assert.ok(deletedKeys.includes('tenant:blab_demo:bootstrap:v2'));

  const updatedCfgRes = await getConfig(
    new Request('https://worker.test/api/config?tenant_id=blab_demo'),
    env
  );
  const updatedCfg = await updatedCfgRes.json();
  assert.deepEqual(updatedCfg.supportedLocales, ['zh-TW', 'en']);

  // 3. Omitting targetLocales in AI translate automatically honors store supportedLocales (["en"] only -> Qwen only)
  const aiCalls = [];
  const aiRes = await menuAiTranslate.handleMenuAiTranslate(
    new Request('https://worker.test/api/menu/ai-translate?tenant_id=blab_demo', {
      method: 'POST',
      body: JSON.stringify({
        applyToDatabase: false,
        entries: [{ type: 'item', id: 'en_only_item', name: '無骨鳳爪' }],
      }),
    }),
    {
      ...env,
      AI: {
        async run(model, input) {
          aiCalls.push({ model, targetLocales: JSON.parse(input.messages[1].content).targetLocales });
          return {
            response: JSON.stringify({
              translations: {
                'item:en_only_item': {
                  en: { name: 'Boneless Chicken Feet' },
                },
              },
            }),
          };
        },
      },
    }
  );
  assert.equal(aiRes.status, 200);
  const aiData = await aiRes.json();
  assert.deepEqual(aiData.targetLocales, ['en']);
  assert.equal(aiCalls.length, 1);
  assert.equal(aiCalls[0].model, '@cf/qwen/qwen3-30b-a3b-fp8');
  assert.deepEqual(aiCalls[0].targetLocales, ['en']);
  assert.equal(aiData.byId.en_only_item.en.name, 'Boneless Chicken Feet');
  assert.equal(aiData.byId.en_only_item.vi, undefined);

  // 4. Customer LIFF switcher renders ONLY zh-TW + en when tenant disabled vi (even if navigator is vi-VN)
  const { sandbox, makeEl } = createLiffVm({ navigatorLanguage: 'vi-VN' });
  const bootRes = await getTenantBootstrap(
    new Request('https://worker.test/api/tenant/bootstrap?tenant_id=blab_demo&nocache=1'),
    env
  );
  const bootPayload = await bootRes.json();
  assert.deepEqual(bootPayload.tenant.supportedLocales, ['zh-TW', 'en']);

  sandbox.bootstrapData = bootPayload;
  sandbox.initClientLocale(bootPayload.tenant);
  sandbox.renderClientLanguageSwitcher(bootPayload.tenant);
  assert.equal(sandbox.currentClientLocale, 'en'); // vi disabled -> falls back cleanly to international en
  const switcherEl = makeEl('client-lang-switcher');
  const selectEl = makeEl('client-lang-select');
  assert.equal(switcherEl.style.display, 'flex');
  assert.ok(selectEl.innerHTML.includes('value="zh-TW"'));
  assert.ok(selectEl.innerHTML.includes('value="en"'));
  assert.ok(!selectEl.innerHTML.includes('value="vi"'));

  // 5. Verify row in D1 matches saved JSON array
  const row = db.prepare('SELECT supported_locales FROM tenant_config WHERE tenant_id = ?').get('blab_demo');
  assert.deepEqual(JSON.parse(row.supported_locales), ['zh-TW', 'en']);

  // 6. Verify unsubscribed tenant ('benmi') stays locked in config GET & rejects POST supportedLocales/i18n with 403
  db.exec(`
    INSERT OR IGNORE INTO tenants (id, name) VALUES ('benmi', 'Benmi Original');
    INSERT OR REPLACE INTO tenant_lifecycle (tenant_id, state) VALUES ('benmi', 'active');
    INSERT OR REPLACE INTO tenant_config (tenant_id, brand_name, locale, is_active, features, supported_locales)
    VALUES ('benmi', 'Benmi Original', 'zh-TW', 1, '[]', '["zh-TW","en"]');
  `);
  const benmiCfgRes = await getConfig(
    new Request('https://worker.test/api/config?tenant_id=benmi'),
    env
  );
  assert.equal(benmiCfgRes.status, 200);
  const benmiCfg = await benmiCfgRes.json();
  assert.equal(benmiCfg.i18nEnabled, false);
  assert.deepEqual(benmiCfg.supportedLocales, ['zh-TW']);

  const lockLocRes = await updateConfig(
    new Request('https://worker.test/api/config?tenant_id=benmi', {
      method: 'POST',
      body: JSON.stringify({ supportedLocales: ['zh-TW', 'en'] }),
    }),
    env
  );
  assert.equal(lockLocRes.status, 403);
  const lockLocBody = await lockLocRes.json();
  assert.equal(lockLocBody.error, 'FEATURE_LOCKED');
  assert.equal(lockLocBody.feature, 'multilingual');

  const lockI18nRes = await updateConfig(
    new Request('https://worker.test/api/config?tenant_id=benmi', {
      method: 'POST',
      body: JSON.stringify({ i18n: { en: { notice: 'No access' } } }),
    }),
    env
  );
  assert.equal(lockI18nRes.status, 403);
  assert.equal((await lockI18nRes.json()).error, 'FEATURE_LOCKED');
});
