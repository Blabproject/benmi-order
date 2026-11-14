const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const ts = require('../../benmi-worker-official/node_modules/typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
}).outputText, file);
const ai = require('../../benmi-worker-official/src/modules/ai-settings.ts');
const config = require('../../benmi-worker-official/src/modules/config.ts');
const repository = require('../../benmi-worker-official/src/repositories/tenant.repository.ts');

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE tenant_config(tenant_id TEXT PRIMARY KEY,brand_name TEXT,is_active INTEGER DEFAULT 1,
    liff_id TEXT,operating_hours TEXT,allow_scheduled_pickup INTEGER,allow_dine_in INTEGER,store_status TEXT,
    logo_url TEXT,store_address TEXT,announcement TEXT,store_notice TEXT,features TEXT,prep_time_minutes INTEGER,
    payment_methods TEXT,auto_open_before_minutes INTEGER,customer_order_domain TEXT DEFAULT 'legacy',
    legacy_liff_endpoint_url TEXT,ai_order_redirect_enabled INTEGER DEFAULT 1,quick_replies TEXT,updated_at TEXT);
    CREATE TABLE tenant_lifecycle(tenant_id TEXT PRIMARY KEY,state TEXT);
    CREATE TABLE pending_actions(tenant_id TEXT,user_id TEXT,order_key TEXT);
    INSERT INTO tenant_config(tenant_id,brand_name,liff_id,store_address) VALUES
    ('a','Fixture A','12345678-abcde','Address A'),('b','Fixture B','12345678-fghij','Address B');`);
  db.exec(fs.readFileSync(path.resolve(__dirname, '../../benmi-worker-official/migrations/0087_add_ai_settings.sql'), 'utf8'));
  const cache = new Map(), deleted = [];
  const DB = { prepare(sql) {
    const build = params => ({ bind(...values) { return build(values); },
      async first() { return db.prepare(sql).get(...params) || null; },
      async all() { return { results: db.prepare(sql).all(...params) }; },
      async run() { return { meta: { changes: db.prepare(sql).run(...params).changes } }; }
    });
    return build([]);
  } };
  const env = { DB, ORDER_STATE: {
    get: async key => cache.get(key) || null,
    put: async (key, value) => cache.set(key, value),
    delete: async key => { deleted.push(key); cache.delete(key); }
  } };
  const context = tenantId => ({ tenantId, brandName: 'Fixture', storeAddress: 'Address ' + tenantId.toUpperCase(), locale: 'vi', lineChannelToken: 'synthetic-token', liffUrl: 'https://liff.line.me/fixture', aiOrderRedirectEnabled: true, features: [], quickReplies: [] });
  const request = (body, tenantId = 'a') => new Request('https://local.test/api/config?tenant_id=' + tenantId,
    { method: body ? 'POST' : 'GET', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  return { db, env, cache, deleted, context,
    get: async (tenantId = 'a') => config.getConfig(request(null, tenantId), env, context(tenantId)),
    save: async (body, tenantId = 'a') => config.updateConfig(request(body, tenantId), env, context(tenantId))
  };
}

function webhookModule(f) {
  const calls = { ai: 0, line: [], pending: 0, receipt: 0, button: 0 };
  const pending = {};
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, '../../benmi-worker-official/src/modules/line.ts'), 'utf8');
  const context = vm.createContext({ exports, console, Response, Request, Date, URL, URLSearchParams,
    fetch: async (url, options) => { calls.line.push(JSON.parse(options.body)); return new Response('{}'); },
    require(name) {
      if (name.endsWith('/ai-settings')) return ai;
      if (name.includes('tenant.repository')) return repository;
      if (name === './line-runtime') return { readVerifiedLineWebhook: async request => request.json(), LineRuntimeError: class extends Error {} };
      if (name === './line-order-receipts') return {
        handleOrderReceiptWebhook: async (_env, _ctx, _user, text) => { if (text === 'receipt-fixture') { calls.receipt++; return true; } return false; },
        handleOrderReceiptPageWebhook: async () => { calls.button++; return true; }
      };
      if (name === '../integrations/groq') return { callAI: async () => { calls.ai++; return 'YES'; } };
      if (name === './orders') return { getPendingMap: async () => { calls.pending++; return pending; }, getUserLatestActiveOrder: async () => null };
      if (name === './menu') return { getTenantId: () => 'a', getMenuData: async () => ({}), formatMenuForPrompt: () => 'Fixture menu' };
      if (name === './bootstrap') return { formatOperatingHoursForDisplay: () => '09:00–18:00' };
      if (name === '../utils/http') return { corsHeaders: () => ({}) };
      return {};
    }
  });
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  async function send(text, tenantId = 'a', event) {
    const tasks = [];
    const response = await exports.handleLineWebhook(new Request('https://local.test/webhook?tenant_id=' + tenantId, {
      method: 'POST', body: JSON.stringify({ events: [event || { type: 'message', replyToken: 'test-reply', source: { userId: 'user' }, message: { type: 'text', text } }] })
    }), f.env, { waitUntil: promise => tasks.push(promise) }, f.context(tenantId));
    await Promise.all(tasks);
    return response;
  }
  return { send, calls, pending, api: exports };
}

module.exports = { fixture, webhookModule, ai, repository };
