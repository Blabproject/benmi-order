const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("../../benmi-worker-official/node_modules/typescript");
const { DatabaseSync } = require("node:sqlite");
function moduleFor(db) {
  const deleted = [];
  const api = {
    prepare(sql) {
      let args = [];
      const statement = {
        sql,
        get args() {
          return args;
        },
        bind(...values) {
          args = values;
          return statement;
        },
        async all() {
          return { success: true, results: db.prepare(sql).all(...args) };
        },
        async first() {
          return db.prepare(sql).get(...args) || null;
        },
        async run() {
          db.prepare(sql).run(...args);
          return { success: true };
        },
      };
      return statement;
    },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = statements.map((s) => {
          const st = db.prepare(s.sql);
          if (/^\s*SELECT/i.test(s.sql))
            return { success: true, results: st.all(...s.args) };
          st.run(...s.args);
          return { success: true, results: [] };
        });
        db.exec("COMMIT");
        return results;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const env = {
    DB: api,
    UNIFIED_MENU_ENABLED: "true",
    ORDER_STATE: { delete: async (key) => deleted.push(key) },
  };
  const exports = {};
  const context = vm.createContext({
    exports,
    console,
    Date,
    JSON,
    Map,
    Set,
    crypto: require("node:crypto").webcrypto,
    Response,
    Request,
    URL,
    require: (name) =>
      name.includes("http")
        ? {
            json: (body, status = 200) =>
              new Response(JSON.stringify(body), { status }),
          }
        : name.includes("pricing-engine-client")
          ? {
              pricingRustEnabled: () => false,
              callRustValidateUnifiedItems: async () => ({ valid: true }),
            }
        : name.includes("bootstrap")
          ? {
              invalidateBootstrapCache: async (tenant) =>
                deleted.push(`bootstrap:${tenant}`),
            }
          : {
              getTenantId: (request) =>
                new URL(request.url).searchParams.get("tenant_id"),
            },
  });
  const source = fs.readFileSync(
    "benmi-worker-official/src/modules/option-groups.ts",
    "utf8",
  );
  vm.runInContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    context,
  );
  return {
    api: exports,
    env,
    deleted,
    save: async (kind, payload, tenant = "a") =>
      exports.saveOptionEntity(
        new Request(`https://example.test/api/menu?tenant_id=${tenant}`, {
          method: "POST",
          body: JSON.stringify(payload),
        }),
        env,
        kind,
      ),
  };
}
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE menu_categories(id TEXT PRIMARY KEY,tenant_id TEXT,slug TEXT,name TEXT,sort_order INTEGER DEFAULT 0,category_type TEXT,allow_customization INTEGER,applied_modifiers TEXT);
 CREATE TABLE menu_items(id TEXT PRIMARY KEY,tenant_id TEXT,category_id TEXT REFERENCES menu_categories(id),name TEXT,price REAL,sort_order INTEGER DEFAULT 0,out_of_stock_until TEXT,badge_text TEXT,is_recommended INTEGER DEFAULT 0,updated_at TEXT);
 CREATE TABLE menu_customizations(id TEXT PRIMARY KEY,tenant_id TEXT,key TEXT,title TEXT,type TEXT,sort_order INTEGER,options_json TEXT);
 CREATE TABLE menu_bundle_rules(id TEXT PRIMARY KEY,tenant_id TEXT,parent_item_id TEXT,schema_version INTEGER,config_json TEXT,is_active INTEGER DEFAULT 1,UNIQUE(tenant_id,parent_item_id));`);
  for (const file of [
    "0061_unified_bundle_and_customization_schema.sql",
    "0063_clean_customizations_and_category_links.sql",
    "0064_add_modifier_migration_metadata.sql",
    "0065_unified_option_groups.sql",
    "0066_optional_migrated_option_groups.sql",
    "0070_add_modifier_group_auto_popup.sql",
  ])
    db.exec(
      fs.readFileSync("benmi-worker-official/migrations/" + file, "utf8"),
    );
  for (const tenant of ["a", "b"]) {
    db.prepare(
      "INSERT INTO menu_categories(id,tenant_id,name,category_type) VALUES (?,?,?,?)",
    ).run(tenant + "_food", tenant, "Food", "catalog");
    for (const [id, name, price] of [
      ["main", "Meal", 100],
      ["coffee", "Coffee", 70],
      ["tea", "Tea", 50],
    ])
      db.prepare(
        "INSERT INTO menu_items(id,tenant_id,category_id,name,price) VALUES (?,?,?,?,?)",
      ).run(tenant + "_" + id, tenant, tenant + "_food", name, price);
  }
  return { db, ...moduleFor(db) };
}
function schemaTrueFixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON;");
  const files = fs
    .readdirSync("benmi-worker-official/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    db.exec(
      fs.readFileSync("benmi-worker-official/migrations/" + file, "utf8"),
    );
  }
  return { db, ...moduleFor(db) };
}

module.exports = { fixture, schemaTrueFixture, moduleFor, DatabaseSync };
