const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("../benmi-worker-official/node_modules/typescript");
const { schemaTrueFixture } = require("./helpers/option-groups.cjs");

function loadWorkersForFixture(f) {
  const cache = new Map();
  const baseDb = f.env.DB;
  const wrappedDb = {
    prepare(sql) {
      let bound = [];
      const stmt = baseDb.prepare(sql);
      const wrapper = {
        sql,
        get args() {
          return bound;
        },
        bind(...values) {
          bound = values;
          stmt.bind(...values);
          return wrapper;
        },
        all: () => stmt.all(),
        first: () => stmt.first(),
        async run() {
          const info = f.db.prepare(sql).run(...bound);
          return { success: true, meta: { changes: Number(info?.changes ?? 0) } };
        },
      };
      return wrapper;
    },
    batch: (stmts) => baseDb.batch(stmts),
  };
  const workerEnv = {
    ...f.env,
    DB: wrappedDb,
    ORDER_STATE: {
      get: async (key) => cache.get(key) || null,
      put: async (key, value) => {
        cache.set(key, value);
      },
      delete: async (key) => cache.delete(key),
    },
  };

  const bootExports = {};
  const bootCtx = vm.createContext({
    exports: bootExports,
    console,
    Date,
    URL,
    Map,
    Set,
    require(name) {
      if (name.includes("option-groups")) return f.api;
      if (name.includes("order-detail")) return { detailWrites: () => false };
      if (name.includes("tenant-lifecycle")) return { tenantIsDeleted: async () => false };
      if (name.endsWith("/tenant")) return { resolveTenantContext: async (id) => ({ tenantId: id, brandName: id }) };
      if (name.endsWith("/menu")) return { getTenantId: (req) => new URL(req.url).searchParams.get("tenant_id") };
      if (name.includes("http")) return { json: (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers }) };
      throw new Error("Unexpected import in bootstrap.ts: " + name);
    },
  });
  vm.runInContext(
    ts.transpileModule(fs.readFileSync("benmi-worker-official/src/modules/bootstrap.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    bootCtx,
  );

  const menuExports = {};
  const menuCtx = vm.createContext({
    exports: menuExports,
    console,
    Date,
    JSON,
    Map,
    Set,
    Response,
    Request,
    URL,
    crypto: require("node:crypto").webcrypto,
    require(name) {
      if (name.includes("option-groups")) return f.api;
      if (name.includes("bootstrap")) {
        return {
          invalidateBootstrapCache: async (tenant) => {
            cache.delete(`tenant:${tenant}:bootstrap`);
            cache.delete(`tenant:${tenant}:bootstrap:v2`);
          },
        };
      }
      if (name.includes("http")) return { json: (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers }) };
      if (name.includes("bundle-rules")) {
        return {
          loadBundleCatalog: async () => ({ bundles: [] }),
          normalizeBundleConfig: (v) => v,
        };
      }
      throw new Error("Unexpected import in menu.ts: " + name);
    },
  });
  vm.runInContext(
    ts.transpileModule(fs.readFileSync("benmi-worker-official/src/modules/menu.ts", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    menuCtx,
  );

  return {
    cache,
    getBootstrap: async (tenantId) => {
      const res = await bootExports.getTenantBootstrap(
        new Request(`https://example.test/api/tenant/bootstrap?tenant_id=${encodeURIComponent(tenantId)}`),
        workerEnv,
      );
      return { status: res.status, headers: res.headers, data: await res.json() };
    },
    updateStock: async (tenantId, body) => {
      const res = await menuExports.updateStockStatus(
        new Request(`https://example.test/api/menu/stock-status?tenant_id=${encodeURIComponent(tenantId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        workerEnv,
      );
      return { status: res.status, data: await res.json() };
    },
  };
}

function seedMultiGroupTenant(f, tenantId = "t_order_fix") {
  const p = (id) => `${tenantId}_${id}`;
  f.db.exec(`
    INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'Order Fix Store');
    INSERT INTO menu_categories (id, tenant_id, slug, name, category_type, sort_order)
    VALUES ('${p("cat_main")}', '${tenantId}', 'main', 'Main', 'catalog', 1),
           ('${p("cat_drinks")}', '${tenantId}', 'drinks', 'Drinks', 'catalog', 2);
    INSERT INTO menu_items (id, tenant_id, category_id, name, price, sort_order)
    VALUES ('${p("item_1")}', '${tenantId}', '${p("cat_main")}', 'Item 1', 50, 1),
           ('${p("item_2")}', '${tenantId}', '${p("cat_main")}', 'Item 2', 60, 2),
           ('${p("drink_1")}', '${tenantId}', '${p("cat_drinks")}', 'Tea', 30, 1);
  `);

  for (const [slug, name, sort] of [
    ["grp_1", "Rice", 1],
    ["grp_2", "Size", 2],
    ["grp_3", "Spice", 3],
    ["grp_4", "Remove", 4],
    ["grp_5", "Addon 10", 5],
  ]) {
    const id = p(slug);
    f.db.prepare(
      `INSERT INTO modifier_groups (id, tenant_id, name, selection_type, min_selection, max_selection, sort_order, scope, revision)
       VALUES (?, ?, ?, 'single', 0, 1, ?, 'item', 1)`,
    ).run(id, tenantId, name, sort);
    f.db.prepare(
      `INSERT INTO modifier_options (id, tenant_id, group_id, name, price, sort_order)
       VALUES (?, ?, ?, ?, 0, 0), (?, ?, ?, ?, 10, 1)`,
    ).run(`${id}_a`, tenantId, id, `${name} A`, `${id}_b`, tenantId, id, `${name} B`);
    f.db.prepare(
      `INSERT INTO item_modifier_links (tenant_id, item_id, group_id, is_disabled, sort_order)
       VALUES (?, ?, ?, 0, ?)`,
    ).run(tenantId, p("item_1"), id, sort);
  }
  return p;
}

test("toggling option local stock and item stock preserves option group, option, and item ordering across POS and LIFF", async () => {
  const f = schemaTrueFixture();
  try {
    const tenantId = "t_order_fix";
    const p = seedMultiGroupTenant(f, tenantId);
    const workers = loadWorkersForFixture(f);
    const expectedGroups = [p("grp_1"), p("grp_2"), p("grp_3"), p("grp_4"), p("grp_5")];

    const beforeBoot = await workers.getBootstrap(tenantId);
    assert.equal(beforeBoot.status, 200);
    const beforeItem = beforeBoot.data.catalog.find((c) => c.id === p("cat_main")).items.find((i) => i.id === p("item_1"));
    assert.deepEqual(beforeItem.bundleRule.groups.map((g) => g.id), expectedGroups);

    const beforeCatalog = await f.api.loadOptionCatalog(f.env, tenantId);
    assert.deepEqual(beforeCatalog.groups.map((g) => g.id), expectedGroups);

    // 1. Toggle ugLocalStock (isLocallyOutOfStock) on grp_3 (middle group) via POST /api/menu/option-group
    const targetGroup = beforeCatalog.groups.find((g) => g.id === p("grp_3"));
    targetGroup.options[1].isLocallyOutOfStock = true;
    const saveGroupRes = await f.save(
      "group",
      {
        ...targetGroup,
        itemIds: [p("item_1")],
        categoryIds: [],
      },
      tenantId,
    );
    assert.equal(saveGroupRes.status, 200);
    const saveGroupBody = await saveGroupRes.json();

    // Verify in-memory returned catalog.groups did NOT push grp_3 to the end
    assert.deepEqual(saveGroupBody.catalog.groups.map((g) => g.id), expectedGroups);
    // Verify D1 link sort_order stayed 3 (not reset to 0)
    const grp3Link = f.db
      .prepare("SELECT sort_order FROM item_modifier_links WHERE tenant_id=? AND item_id=? AND group_id=?")
      .get(tenantId, p("item_1"), p("grp_3"));
    assert.equal(grp3Link.sort_order, 3);

    // 2. Toggle item stock on/off (invalidates KV bootstrap cache and forces rebuild from D1)
    const oosRes = await workers.updateStock(tenantId, {
      category_slug: "main",
      name: "Item 2",
      status: "out_of_stock",
      duration: "indefinite",
    });
    assert.equal(oosRes.status, 200);

    // 3. Re-read LIFF/POS bootstrap from D1 and verify exact ordering is intact
    const afterBoot = await workers.getBootstrap(tenantId);
    assert.equal(afterBoot.status, 200);
    const afterCat = afterBoot.data.catalog.find((c) => c.id === p("cat_main"));
    assert.deepEqual(afterCat.items.map((i) => i.id), [p("item_1"), p("item_2")]);
    const afterItem = afterCat.items.find((i) => i.id === p("item_1"));
    assert.deepEqual(afterItem.bundleRule.groups.map((g) => g.id), expectedGroups);
    const afterSpiceOpts = afterItem.bundleRule.groups.find((g) => g.id === p("grp_3")).eligibleItems;
    assert.deepEqual(
      afterSpiceOpts.map((o) => [o.id, o.isOutOfStock]),
      [
        [`${p("grp_3")}_a`, false],
        [`${p("grp_3")}_b`, true],
      ],
    );
  } finally {
    f.db.close();
  }
});

test("creating new groups, linking new items, and creating new products preserve sort_order without jumping to front or global tail", async () => {
  const f = schemaTrueFixture();
  try {
    const tenantId = "t_order_new";
    const p = seedMultiGroupTenant(f, tenantId);

    // 1. Create a brand new group and attach it to existing item_1 (which has sort 1..5)
    const createGrpRes = await f.save(
      "group",
      {
        id: p("grp_6"),
        name: "Addon 20",
        revision: 0,
        scope: "item",
        minSelection: 0,
        maxSelection: 1,
        allowRepeats: false,
        included: false,
        itemIds: [p("item_1")],
        categoryIds: [],
        sources: [],
        options: [{ id: p("grp_6_a"), name: "Cheese", price: 20, quantity: 1 }],
      },
      tenantId,
    );
    assert.equal(createGrpRes.status, 200);
    const catAfterGrp = (await createGrpRes.json()).catalog;
    assert.deepEqual(
      catAfterGrp.groups.map((g) => g.id),
      [p("grp_1"), p("grp_2"), p("grp_3"), p("grp_4"), p("grp_5"), p("grp_6")],
    );
    assert.equal(catAfterGrp.groups.find((g) => g.id === p("grp_6")).sortOrder, 6);
    const grp6Link = f.db
      .prepare("SELECT sort_order FROM item_modifier_links WHERE tenant_id=? AND item_id=? AND group_id=?")
      .get(tenantId, p("item_1"), p("grp_6"));
    assert.equal(grp6Link.sort_order, 6);

    // 2. Create a new product inside cat_drinks (currently has 1 item sort_order=1)
    const createProdRes = await f.save(
      "product",
      {
        id: p("drink_2"),
        name: "Milk Tea",
        price: 45,
        categoryId: p("cat_drinks"),
        revision: 0,
        links: [],
      },
      tenantId,
    );
    assert.equal(createProdRes.status, 200);
    const drink2Row = f.db.prepare("SELECT sort_order FROM menu_items WHERE id=? AND tenant_id=?").get(p("drink_2"), tenantId);
    assert.equal(drink2Row.sort_order, 2, "New product sort_order must be max(category sort) + 1, not global product count");
  } finally {
    f.db.close();
  }
});

test("migration 0093 restores collapsed sort_order=0 item_modifier_links while preserving valid 0-based contiguous lists", () => {
  const f = schemaTrueFixture();
  try {
    const tenantId = "t_mig_repair";
    const p = seedMultiGroupTenant(f, tenantId);

    // Simulate broken dafobenwan state: grp_1, grp_3, grp_5 collapsed to 0, while grp_2=2, grp_4=4
    f.db.prepare(
      `UPDATE item_modifier_links SET sort_order = 0
       WHERE tenant_id = ? AND item_id = ? AND group_id IN (?, ?, ?)`,
    ).run(tenantId, p("item_1"), p("grp_1"), p("grp_3"), p("grp_5"));

    // Add item_2 with a legitimate contiguous 0-based list [0, 1, 2] even though groups are 1..5
    f.db.prepare(
      `INSERT INTO item_modifier_links (tenant_id, item_id, group_id, is_disabled, sort_order)
       VALUES (?, ?, ?, 0, 0),
              (?, ?, ?, 0, 1),
              (?, ?, ?, 0, 2)`,
    ).run(tenantId, p("item_2"), p("grp_5"), tenantId, p("item_2"), p("grp_2"), tenantId, p("item_2"), p("grp_1"));

    const migSql = fs.readFileSync("benmi-worker-official/migrations/0093_repair_item_modifier_links_sort_order.sql", "utf8");
    f.db.exec(migSql);

    const item1Links = f.db
      .prepare("SELECT group_id, sort_order FROM item_modifier_links WHERE tenant_id=? AND item_id=? ORDER BY sort_order ASC, group_id ASC")
      .all(tenantId, p("item_1"));
    assert.deepEqual(
      item1Links.map((r) => [r.group_id, r.sort_order]),
      [
        [p("grp_1"), 1],
        [p("grp_2"), 2],
        [p("grp_3"), 3],
        [p("grp_4"), 4],
        [p("grp_5"), 5],
      ],
    );

    const item2Links = f.db
      .prepare("SELECT group_id, sort_order FROM item_modifier_links WHERE tenant_id=? AND item_id=? ORDER BY sort_order ASC")
      .all(tenantId, p("item_2"));
    assert.deepEqual(
      item2Links.map((r) => [r.group_id, r.sort_order]),
      [
        [p("grp_5"), 0],
        [p("grp_2"), 1],
        [p("grp_1"), 2],
      ],
    );
  } finally {
    f.db.close();
  }
});

test("saveOptionEntity preserves rowid and created_at on surviving options/links via upsert + targeted delete", async () => {
  const f = schemaTrueFixture();
  try {
    const tenantId = "t_upsert";
    const p = seedMultiGroupTenant(f, tenantId);
    const workers = loadWorkersForFixture(f);

    // Add a 3rd option to grp_1 with an explicit historical created_at
    const grp1Id = p("grp_1");
    f.db.prepare(
      `INSERT INTO modifier_options (id, tenant_id, group_id, name, price, sort_order, created_at)
       VALUES (?, ?, ?, 'Rice C', 5, 2, '2025-01-01 00:00:00')`,
    ).run(`${grp1Id}_c`, tenantId, grp1Id);
    f.db.prepare(
      `UPDATE modifier_options SET created_at = '2025-01-01 00:00:00' WHERE tenant_id = ? AND group_id = ?`,
    ).run(tenantId, grp1Id);

    const snapRows = () => ({
      opts: f.db
        .prepare("SELECT rowid, id, created_at, price, sort_order FROM modifier_options WHERE tenant_id=? AND group_id=? ORDER BY sort_order ASC, rowid ASC")
        .all(tenantId, grp1Id),
      links: f.db
        .prepare("SELECT rowid, group_id, sort_order, option_ids_json, is_disabled FROM item_modifier_links WHERE tenant_id=? AND item_id=? ORDER BY sort_order ASC, rowid ASC")
        .all(tenantId, p("item_1")),
    });
    const before = snapRows();
    const beforeRowIdA = before.opts.find((o) => o.id === `${grp1Id}_a`).rowid;
    const beforeRowIdB = before.opts.find((o) => o.id === `${grp1Id}_b`).rowid;
    const beforeLinkRowIds = Object.fromEntries(before.links.map((l) => [l.group_id, l.rowid]));

    // 1. Group save: edit option A price, keep B unchanged, remove C, add D
    const cat1 = await f.api.loadOptionCatalog(f.env, tenantId);
    const grp1 = cat1.groups.find((g) => g.id === grp1Id);
    grp1.options = [
      { ...grp1.options[0], price: 8 },
      grp1.options[1],
      { id: `${grp1Id}_d`, name: "Rice D", price: 15, quantity: 1, subOptions: [], eligibilityRules: [] },
    ];
    const res1 = await f.save("group", { ...grp1, itemIds: [p("item_1")], categoryIds: [] }, tenantId);
    assert.equal(res1.status, 200);

    const after1 = snapRows();
    assert.deepEqual(
      after1.opts.map((o) => [o.id, o.rowid, o.created_at, o.price, o.sort_order]),
      [
        [`${grp1Id}_a`, beforeRowIdA, "2025-01-01 00:00:00", 8, 0],
        [`${grp1Id}_b`, beforeRowIdB, "2025-01-01 00:00:00", 10, 1],
        [`${grp1Id}_d`, after1.opts[2].rowid, after1.opts[2].created_at, 15, 2],
      ],
    );
    // Removed option C must be deleted; surviving item_modifier_links must keep identical rowids
    assert.equal(f.db.prepare("SELECT 1 FROM modifier_options WHERE id=?").get(`${grp1Id}_c`), undefined);
    assert.deepEqual(
      Object.fromEntries(after1.links.map((l) => [l.group_id, l.rowid])),
      beforeLinkRowIds,
    );

    // 2. Product save: change subset on grp_1 and remove grp_5; remaining links must preserve rowid
    const prod1 = cat1.products.find((it) => it.id === p("item_1"));
    const res2 = await f.save(
      "product",
      {
        id: prod1.id,
        name: prod1.name,
        price: prod1.price,
        categoryId: prod1.category_id,
        revision: prod1.menu_revision,
        links: [
          { groupId: p("grp_1"), optionIds: [`${grp1Id}_a`, `${grp1Id}_d`], disabled: false },
          { groupId: p("grp_2"), optionIds: null, disabled: false },
          { groupId: p("grp_3"), optionIds: null, disabled: false },
          { groupId: p("grp_4"), optionIds: null, disabled: false },
        ],
      },
      tenantId,
    );
    assert.equal(res2.status, 200);
    const after2 = snapRows();
    assert.equal(after2.links.some((l) => l.group_id === p("grp_5")), false);
    for (const gid of [p("grp_1"), p("grp_2"), p("grp_3"), p("grp_4")]) {
      assert.equal(after2.links.find((l) => l.group_id === gid).rowid, beforeLinkRowIds[gid], `rowid changed for ${gid}`);
    }

    // 3. Narrow stock-status endpoint toggles modifier option stock without mutating group revision or link rowids
    const revBeforeStock = f.db.prepare("SELECT revision FROM modifier_groups WHERE id=?").get(grp1Id).revision;
    const stockOff = await workers.updateStock(tenantId, {
      category_slug: "modifier_option",
      option_id: `${grp1Id}_a`,
      group_id: grp1Id,
      name: "Rice A",
      status: "out_of_stock",
      duration: "indefinite",
    });
    assert.equal(stockOff.status, 200);
    const revAfterStock = f.db.prepare("SELECT revision FROM modifier_groups WHERE id=?").get(grp1Id).revision;
    assert.equal(revAfterStock, revBeforeStock);

    const optARowOff = f.db.prepare("SELECT rowid, is_out_of_stock, out_of_stock_until FROM modifier_options WHERE id=?").get(`${grp1Id}_a`);
    assert.equal(optARowOff.rowid, beforeRowIdA);
    assert.equal(optARowOff.is_out_of_stock, 1);

    const bootOff = await workers.getBootstrap(tenantId);
    const grp1BootOff = bootOff.data.catalog.find((c) => c.id === p("cat_main")).items.find((i) => i.id === p("item_1")).bundleRule.groups[0];
    assert.equal(grp1BootOff.eligibleItems.find((o) => o.id === `${grp1Id}_a`).isOutOfStock, true);

    const stockOn = await workers.updateStock(tenantId, {
      category_slug: "modifier_option",
      option_id: `${grp1Id}_a`,
      group_id: grp1Id,
      name: "Rice A",
      status: "in_stock",
    });
    assert.equal(stockOn.status, 200);
    const bootOn = await workers.getBootstrap(tenantId);
    const grp1BootOn = bootOn.data.catalog.find((c) => c.id === p("cat_main")).items.find((i) => i.id === p("item_1")).bundleRule.groups[0];
    assert.equal(grp1BootOn.eligibleItems.find((o) => o.id === `${grp1Id}_a`).isOutOfStock, false);
  } finally {
    f.db.close();
  }
});
