// Real local D1; all rows are synthetic. Never calls a remote API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../../benmi-worker-official/node_modules/typescript');
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, file);
const { Miniflare, convertV4MiniflareOptions } = require('../../benmi-worker-official/node_modules/miniflare');
const { schemaTrueFixture } = require('./option-groups.cjs');
const { handleStaffRoute } = require('../../benmi-worker-official/src/modules/staff.ts');
const { STAFF_CAPABILITIES } = require('../../benmi-worker-official/src/modules/staff-access.ts');

/**
 * Pure-JS SQLite statement splitter handling strings, comments, and BEGIN/CASE...END blocks
 * without spawning a Python subprocess.
 */
function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let blockDepth = 0;
  const len = sql.length;

  for (let i = 0; i < len; i += 1) {
    const ch = sql[i];
    // Single-quoted string literal ('...' with '' escape)
    if (ch === "'") {
      i += 1;
      while (i < len) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          break;
        }
        i += 1;
      }
      continue;
    }
    // Double-quoted identifier ("..." with "" escape)
    if (ch === '"') {
      i += 1;
      while (i < len) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            i += 2;
            continue;
          }
          break;
        }
        i += 1;
      }
      continue;
    }
    // Line comment (-- ...)
    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i + 2);
      i = nl === -1 ? len - 1 : nl;
      continue;
    }
    // Block comment (/* ... */)
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? len - 1 : end + 1;
      continue;
    }
    // Track BEGIN / CASE ... END nesting so triggers & CASE blocks do not split on inner ';'
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let end = i + 1;
      while (end < len && /[\w]/.test(sql[end])) end += 1;
      const word = sql.slice(i, end).toUpperCase();
      if (word === 'BEGIN' || word === 'CASE') blockDepth += 1;
      else if (word === 'END' && blockDepth > 0) blockDepth -= 1;
      i = end - 1;
      continue;
    }
    if (ch === ';' && blockDepth === 0) {
      const stmt = sql.slice(start, i + 1).trim();
      if (stmt) statements.push(stmt);
      start = i + 1;
    }
  }
  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

const CAPABILITIES = Object.fromEntries(STAFF_CAPABILITIES.map(k => [k, true]));
const SEED_STATEMENTS = [
  "INSERT INTO tenants(id,name) VALUES('a','Fixture A'),('b','Fixture B');",
  `INSERT INTO tenant_config(tenant_id,brand_name,default_password,staff_ordering_enabled,staff_ordering_capabilities) VALUES('a','Fixture A','1234',1,'${JSON.stringify(CAPABILITIES)}'),('b','Fixture B','1234',0,'{}');`,
  "INSERT INTO menu_categories(id,tenant_id,slug,name) VALUES('food-a','a','food','Meals'),('food-b','b','food','Meals');",
  "INSERT INTO menu_items(id,tenant_id,category_id,name,price) VALUES('meal-a','a','food-a','Meal',100),('meal-b','b','food-b','Meal',100);",
  "INSERT INTO restaurant_tables(id,tenant_id,label) VALUES('table-a','a','A1'),('table-b','b','B1');",
];

let cachedSchemaSqls = null;
function getCachedSchemaSqls() {
  if (!cachedSchemaSqls) {
    const source = schemaTrueFixture().db;
    const objects = source.prepare(
      "SELECT type,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END"
    ).all();
    cachedSchemaSqls = objects.map(o => o.sql);
    source.close();
  }
  return cachedSchemaSqls;
}

async function fixture(t) {
  const schemaSqls = getCachedSchemaSqls();
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("local")}}', d1Databases: ['DB'] }));
  t.after(() => mf.dispose());
  const DB = await mf.getD1Database('DB');
  // Load schema DDLs + default seed rows into this test's isolated Miniflare D1.
  await DB.batch([...schemaSqls, ...SEED_STATEMENTS].map(s => DB.prepare(s)));
  const apply = async sql => DB.batch(splitSqlStatements(sql).map(s => DB.prepare(s)));
  const kv = new Map([['tenant:a:password', '1234'], ['tenant:b:password', '1234']]);
  const env = {
    DB,
    UNIFIED_MENU_ENABLED: 'true',
    ORDER_DETAIL_READS: 'true',
    ORDER_DETAIL_WRITES: 'true',
    ORDER_STATE: {
      get: async (k, type) => (type === 'json' && kv.has(k) ? JSON.parse(kv.get(k)) : kv.get(k) || null),
      put: async (k, v) => kv.set(k, v),
      delete: async k => kv.delete(k)
    }
  };
  const context = tenant => ({ tenantId: tenant, brandName: 'Fixture', defaultPassword: '1234', allowDineIn: true, storeStatus: 'open', features: ['dine_in'] });
  async function call(path, body, token, method = body ? 'POST' : 'GET', tenant = 'a') {
    const response = await handleStaffRoute(new Request(`https://local.test${path}?tenant_id=${tenant}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    }), env, path, context(tenant));
    return { http: response.status, ...await response.json() };
  }
  const login = await call('/api/staff/session', { pin: '1234' });
  assert.equal(login.http, 200, JSON.stringify(login));
  const token = login.token;
  const input = (change = {}) => ({ requestId: crypto.randomUUID(), tableId: 'table-a', total: 100, orderSelections: [], items: [{ itemId: 'meal-a', quantity: 1 }], ...change });
  return { DB, env, apply, call, context, token, input, capabilities: { ...CAPABILITIES } };
}

module.exports = { fixture };
