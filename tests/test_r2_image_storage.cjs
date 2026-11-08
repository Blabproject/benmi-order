const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("../benmi-worker-official/node_modules/typescript");
const { DatabaseSync } = require("node:sqlite");

function createR2ImageFixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE menu_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      image_key TEXT DEFAULT NULL
    );
  `);
  db.exec(
    fs.readFileSync(
      "benmi-worker-official/migrations/0084_create_tenant_images.sql",
      "utf8"
    )
  );

  const d1 = {
    prepare(sql) {
      let args = [];
      const stmt = {
        sql,
        bind(...values) {
          args = values;
          return stmt;
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
        }
      };
      return stmt;
    }
  };

  const r2Store = new Map();
  let r2GetCount = 0;
  let r2PutCount = 0;
  const r2Bucket = {
    async put(key, value, options = {}) {
      r2PutCount++;
      const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(Buffer.from(value));
      const etag = `"etag-${key.length}-${bytes.byteLength}"`;
      r2Store.set(key, {
        bytes,
        httpMetadata: options.httpMetadata || {},
        httpEtag: etag
      });
      return { key, httpEtag: etag };
    },
    async get(key) {
      r2GetCount++;
      const entry = r2Store.get(key);
      if (!entry) return null;
      return {
        body: entry.bytes,
        httpMetadata: entry.httpMetadata,
        httpEtag: entry.httpEtag
      };
    },
    async delete(key) {
      r2Store.delete(key);
    }
  };

  const kvStore = new Map();
  let kvGetCount = 0;
  const kvNamespace = {
    async get(key) {
      kvGetCount++;
      return kvStore.has(key) ? kvStore.get(key) : null;
    },
    async put(key, val) {
      kvStore.set(key, String(val));
    },
    async delete(key) {
      kvStore.delete(key);
    },
    async list({ prefix = "" } = {}) {
      const keys = [];
      for (const k of kvStore.keys()) {
        if (k.startsWith(prefix)) keys.push({ name: k });
      }
      return { keys, list_complete: true };
    }
  };

  const invalidatedTenants = [];
  const exportsObj = {};
  const context = vm.createContext({
    exports: exportsObj,
    console,
    URL,
    Request,
    Response,
    Uint8Array,
    Set,
    Map,
    Promise,
    JSON,
    encodeURIComponent,
    atob: (b64) => Buffer.from(b64, "base64").toString("binary"),
    require: (mod) => {
      if (mod.includes("http")) {
        return {
          corsHeaders: () => ({ "Access-Control-Allow-Origin": "*" }),
          json: (data, status = 200) =>
            new Response(JSON.stringify(data), {
              status,
              headers: { "Content-Type": "application/json" }
            })
        };
      }
      if (mod.includes("menu")) {
        return {
          getTenantId: (req) => new URL(req.url).searchParams.get("tenant_id") || "benmi"
        };
      }
      if (mod.includes("bootstrap")) {
        return {
          invalidateBootstrapCache: async (tId) => {
            invalidatedTenants.push(tId);
          }
        };
      }
      return {};
    }
  });

  const src = fs.readFileSync("benmi-worker-official/src/modules/image.ts", "utf8");
  const transpiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  vm.runInContext(transpiled, context);

  const env = {
    DB: d1,
    IMAGES_BUCKET: r2Bucket,
    ORDER_STATE: kvNamespace
  };

  return {
    db,
    env,
    api: exportsObj,
    r2Store,
    kvStore,
    invalidatedTenants,
    stats: () => ({ r2GetCount, r2PutCount, kvGetCount })
  };
}

const SAMPLE_WEBP_BASE64 = Buffer.from("RIFF_FAKE_WEBP_BINARY_PAYLOAD").toString("base64");
const SAMPLE_DATA_URI = `data:image/webp;base64,${SAMPLE_WEBP_BASE64}`;

test("R2 Upload, O(1) bare_name resolution, ETag 304, and Delete lifecycle", async () => {
  const f = createR2ImageFixture();
  f.db
    .prepare("INSERT INTO menu_items (id, tenant_id, name, image_key) VALUES (?, ?, ?, ?)")
    .run("item_1", "zhadantongxue", "原味炸蛋蔥餅", "main_原味炸蛋蔥餅");

  // 1. Upload image with category prefix
  const upRes = await f.api.updateImage(
    new Request("https://worker.test/api/image?tenant_id=zhadantongxue", {
      method: "POST",
      body: JSON.stringify({ name: "main_原味炸蛋蔥餅", dataUri: SAMPLE_DATA_URI })
    }),
    f.env
  );
  assert.equal(upRes.status, 200);
  assert.equal(f.r2Store.size, 1);

  // Verify metadata in D1 tenant_images
  const row = f.db
    .prepare("SELECT * FROM tenant_images WHERE tenant_id = ? AND name = ?")
    .get("zhadantongxue", "main_原味炸蛋蔥餅");
  assert.ok(row);
  assert.equal(row.bare_name, "原味炸蛋蔥餅");
  assert.equal(row.content_type, "image/webp");
  assert.equal(row.byte_size, Buffer.from("RIFF_FAKE_WEBP_BINARY_PAYLOAD").byteLength);

  // 2. Fetch by bare name (O(1) via idx_tenant_images_bare, 0 KV reads)
  const kvReadsBefore = f.stats().kvGetCount;
  const getRes = await f.api.getImage(
    new Request("https://worker.test/api/image?tenant_id=zhadantongxue&name=" + encodeURIComponent("原味炸蛋蔥餅")),
    f.env
  );
  assert.equal(getRes.status, 200);
  assert.equal(getRes.headers.get("Content-Type"), "image/webp");
  const etag = getRes.headers.get("ETag");
  assert.ok(etag);
  assert.equal(f.stats().kvGetCount, kvReadsBefore, "Must not touch KV on R2 hit");
  const bodyBuf = Buffer.from(await getRes.arrayBuffer());
  assert.equal(bodyBuf.toString("utf8"), "RIFF_FAKE_WEBP_BINARY_PAYLOAD");

  // 3. Conditional GET with If-None-Match returns 304 Not Modified without reading R2 body
  const r2GetsBefore = f.stats().r2GetCount;
  const cachedRes = await f.api.getImage(
    new Request("https://worker.test/api/image?tenant_id=zhadantongxue&name=" + encodeURIComponent("原味炸蛋蔥餅"), {
      headers: { "If-None-Match": etag }
    }),
    f.env
  );
  assert.equal(cachedRes.status, 304);
  assert.equal(f.stats().r2GetCount, r2GetsBefore, "304 Not Modified must skip R2 object body fetch");

  // 4. Delete image clears R2 object, D1 tenant_images row, and menu_items.image_key
  const delRes = await f.api.deleteImage(
    new Request("https://worker.test/api/image?tenant_id=zhadantongxue", {
      method: "DELETE",
      body: JSON.stringify({ name: "原味炸蛋蔥餅" })
    }),
    f.env
  );
  assert.equal(delRes.status, 200);
  assert.equal(f.r2Store.size, 0);
  const afterRow = f.db
    .prepare("SELECT * FROM tenant_images WHERE tenant_id = ?")
    .get("zhadantongxue");
  assert.equal(afterRow, undefined);
  const itemRow = f.db
    .prepare("SELECT image_key FROM menu_items WHERE id = ?")
    .get("item_1");
  assert.equal(itemRow.image_key, null, "Deleting image must clear menu_items.image_key");
});

test("Dual-Read Lazy Migration & Admin Backfill from KV to R2", async () => {
  const f = createR2ImageFixture();

  // Seed legacy KV images
  await f.env.ORDER_STATE.put("tenant:benmi:image:main_招牌法國麵包", SAMPLE_DATA_URI);
  await f.env.ORDER_STATE.put("tenant:benmi:image_list", JSON.stringify(["main_招牌法國麵包"]));
  await f.env.ORDER_STATE.put("tenant:jiangjiejie:image:store_logo", SAMPLE_DATA_URI);
  await f.env.ORDER_STATE.put("tenant:jiangjiejie:image_list", JSON.stringify(["store_logo"]));

  // 1. First GET on un-backfilled image hits KV and lazy-migrates to R2 + D1
  const res1 = await f.api.getImage(
    new Request("https://worker.test/api/image?tenant_id=benmi&name=" + encodeURIComponent("招牌法國麵包")),
    f.env
  );
  assert.equal(res1.status, 200);
  assert.equal(f.r2Store.size, 1, "Lazy migration must populate R2 bucket");

  // 2. Run Admin Backfill with cleanupKv: true
  const backfillRes = await f.api.backfillImagesFromKvToR2(
    new Request("https://worker.test/api/admin/images/backfill-r2", {
      method: "POST",
      body: JSON.stringify({ cleanupKv: true })
    }),
    f.env
  );
  assert.equal(backfillRes.status, 200);
  const report = await backfillRes.json();
  assert.equal(report.success, true);
  assert.equal(report.migratedCount, 2);
  assert.equal(f.kvStore.size, 0, "cleanupKv: true must remove all legacy KV image keys and image_list");
  assert.equal(f.r2Store.size, 2, "Both tenants' images must now reside in R2");

  // 3. Verify getImageList reads cleanly from D1 tenant_images after KV is emptied
  const listRes = await f.api.getImageList(
    new Request("https://worker.test/api/image_list?tenant_id=jiangjiejie"),
    f.env
  );
  assert.deepEqual(await listRes.json(), ["store_logo"]);
});

test("Delete image by itemId, prefixed category key, or product:id deletes all variants", async () => {
  const f = createR2ImageFixture();

  // Create an item with image_key NULL (simulating direct card upload or legacy item)
  f.db
    .prepare("INSERT INTO menu_items (id, tenant_id, name, image_key) VALUES (?, ?, ?, ?)")
    .run("item_chicken", "benmi", "雞胸肉", null);

  // Upload image as category-prefixed name (main_雞胸肉)
  const upRes = await f.api.updateImage(
    new Request("https://worker.test/api/image?tenant_id=benmi", {
      method: "POST",
      body: JSON.stringify({ name: "main_雞胸肉", dataUri: SAMPLE_DATA_URI })
    }),
    f.env
  );
  assert.equal(upRes.status, 200);
  assert.equal(f.r2Store.size, 1);

  // Verify stored in D1 tenant_images
  const rowBefore = f.db
    .prepare("SELECT * FROM tenant_images WHERE tenant_id = ? AND bare_name = ?")
    .get("benmi", "雞胸肉");
  assert.ok(rowBefore);
  assert.equal(rowBefore.name, "main_雞胸肉");

  // Call deleteImage with itemId and categoryId + itemName
  const delRes = await f.api.deleteImage(
    new Request("https://worker.test/api/image?tenant_id=benmi", {
      method: "DELETE",
      body: JSON.stringify({
        itemId: "item_chicken",
        itemName: "雞胸肉",
        categoryId: "main"
      })
    }),
    f.env
  );
  assert.equal(delRes.status, 200);
  assert.equal(f.r2Store.size, 0, "R2 bucket must be empty after deleting image");

  const rowAfter = f.db
    .prepare("SELECT * FROM tenant_images WHERE tenant_id = ? AND bare_name = ?")
    .get("benmi", "雞胸肉");
  assert.equal(rowAfter, undefined, "D1 tenant_images must have no row for deleted item");

  const itemAfter = f.db
    .prepare("SELECT image_key FROM menu_items WHERE id = ?")
    .get("item_chicken");
  assert.equal(itemAfter.image_key, null, "menu_items.image_key must be NULL");
});
