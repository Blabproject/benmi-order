const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers/option-groups.cjs");
const group = (id = "a_drinks") => ({
  id,
  name: "Drink",
  revision: 0,
  minSelection: 1,
  maxSelection: 1,
  allowRepeats: false,
  included: false,
  itemIds: ["a_main"],
  sources: [],
  options: [
    {
      id: id + "_coffee",
      name: "Coffee",
      productId: "a_coffee",
      price: 0,
      quantity: 1,
    },
    { id: id + "_tea", name: "Tea", productId: "a_tea", price: 5, quantity: 1 },
  ],
});
const product = (links) => ({
  id: "a_main",
  name: "Meal",
  price: 100,
  categoryId: "a_food",
  revision: 0,
  links,
});
async function ok(response) {
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
test("entity save isolates product fields, supports subsets, cache invalidation and stale rejection", async () => {
  const f = fixture();
  await ok(await f.save("group", group()));
  await ok(
    await f.save(
      "product",
      product([
        {
          groupId: "a_drinks",
          optionIds: ["a_drinks_coffee"],
          disabled: false,
        },
      ]),
    ),
  );
  const c = await f.api.loadOptionCatalog(f.env, "a");
  assert.equal(f.api.effectiveGroups(c, "a_main")[0].options.length, 1);
  assert.equal(c.groups[0].options.length, 2);
  assert.equal(c.products.find((p) => p.id === "a_tea").price, 50);
  assert.equal(
    (await f.save("product", { ...product([]), price: 999 })).status,
    409,
  );
  assert.ok(f.deleted.includes("bootstrap:a"));
});
test("nested product surcharge 0 never adds retail; validates names, nested prices and repeats", async () => {
  const f = fixture();
  await ok(await f.save("group", group()));
  await ok(
    await f.save("group", {
      id: "a_temp",
      name: "Temperature",
      revision: 0,
      minSelection: 1,
      maxSelection: 1,
      itemIds: ["a_coffee"],
      options: [{ id: "a_hot", name: "Hot", price: 3, quantity: 1 }],
      sources: [],
    }),
  );
  const c = await f.api.loadOptionCatalog(f.env, "a");
  const selected = [
    {
      groupId: "a_drinks",
      items: [
        {
          optionId: "a_drinks_coffee",
          name: "Forged",
          quantity: 1,
          groups: [
            { groupId: "a_temp", items: [{ optionId: "a_hot", quantity: 1 }] },
          ],
        },
      ],
    },
  ];
  const r = f.api.validateOptionSelection(c, "a_main", selected);
  assert.equal(r.extra, 3);
  assert.equal(r.groups[0].items[0].name, "Coffee");
  assert.equal(r.groups[0].items[0].modifiers[0].price, 3);
  assert.throws(
    () =>
      f.api.validateOptionSelection(c, "a_main", [
        {
          groupId: "a_drinks",
          items: [{ optionId: "a_drinks_coffee", quantity: 1 }],
        },
      ]),
    /REQUIRED/,
  );
  const order = [
    {
      itemId: "a_main",
      quantity: 1,
      subtotal: 103,
      bundleSelections: { portions: [{ groups: selected }] },
    },
  ];
  assert.equal(
    (await f.api.validateUnifiedOrderItems(f.env, "a", order)).valid,
    true,
  );
  assert.equal(order[0].bundleSelections.version, 3);
  order[0].subtotal = 100;
  assert.equal(
    (await f.api.validateUnifiedOrderItems(f.env, "a", order)).code,
    "OPTION_PRICE_CHANGED",
  );
});
test("rejects direct/indirect cycles, foreign options/products and impossible subset", async () => {
  const f = fixture();
  await ok(await f.save("group", group()));
  assert.equal(
    (
      await f.save("group", {
        ...group("a_back"),
        itemIds: ["a_coffee"],
        options: [
          { id: "a_cycle", productId: "a_main", name: "Meal", price: 0 },
        ],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.save("group", {
        ...group("a_foreign"),
        options: [{ id: "a_x", productId: "b_main", price: 0 }],
      })
    ).status,
    400,
  );
  assert.equal(
    (await f.save("product", product([{ groupId: "a_drinks", optionIds: [] }])))
      .status,
    400,
  );
  assert.equal(
    f.db
      .prepare("SELECT count(*) n FROM modifier_groups WHERE tenant_id=?")
      .get("a").n,
    1,
  );
});
test("inheritance override, disable, restore; group update validates linked subset", async () => {
  const f = fixture();
  await ok(await f.save("group", { ...group(), itemIds: ["a_main"] }));
  const c = await f.api.loadOptionCatalog(f.env, "a");
  c.links.push({ itemId: "a_tea", groupId: "a_drinks", optionIds: null, disabled: false });
  assert.throws(() => f.api.validateOptionGraph(c), /CYCLE/);
  await ok(
    await f.save(
      "product",
      product([{ groupId: "a_drinks", optionIds: ["a_drinks_tea"] }]),
    ),
  );
  assert.equal(
    (
      await f.save("group", {
        ...group(),
        revision: 1,
        minSelection: 2,
        maxSelection: 2,
      })
    ).status,
    400,
  );
});
test("included quantities and repeated portions use total portions, with stock propagation", async () => {
  const f = fixture();
  await ok(
    await f.save("group", {
      ...group(),
      included: true,
      options: [{ ...group().options[0], quantity: 2 }],
    }),
  );
  let c = await f.api.loadOptionCatalog(f.env, "a");
  const s = [
    {
      groupId: "a_drinks",
      items: [{ optionId: "a_drinks_coffee", quantity: 2 }],
    },
  ];
  assert.equal(f.api.validateOptionSelection(c, "a_main", s).extra, 0);
  assert.throws(
    () =>
      f.api.validateOptionSelection(c, "a_main", [
        {
          groupId: "a_drinks",
          items: [{ optionId: "a_drinks_coffee", quantity: 1 }],
        },
      ]),
    /QUANTITY/,
  );
  f.db
    .prepare("UPDATE menu_items SET out_of_stock_until=? WHERE id=?")
    .run("2099-01-01T00:00:00Z", "a_coffee");
  c = await f.api.loadOptionCatalog(f.env, "a");
  assert.throws(
    () => f.api.validateOptionSelection(c, "a_main", s),
    /UNAVAILABLE/,
  );
});
test("transaction rollback on write failure and group deletion does not alter product/other tenant", async () => {
  const f = fixture();
  await ok(await f.save("group", group()));
  f.db.exec(
    "CREATE TRIGGER reject_option BEFORE INSERT ON modifier_options WHEN NEW.price=999 BEGIN SELECT RAISE(ABORT,'write failure'); END;",
  );
  assert.equal(
    (
      await f.save("group", {
        ...group(),
        revision: 1,
        name: "Changed",
        options: [{ ...group().options[0], price: 999 }],
      })
    ).status,
    400,
  );
  assert.equal(
    f.db.prepare("SELECT name FROM modifier_groups WHERE id=?").get("a_drinks")
      .name,
    "Drink",
  );
  await ok(await f.save("group", { ...group(), revision: 1, delete: true }));
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM modifier_options").get().n,
    0,
  );
  assert.equal(f.db.prepare("SELECT count(*) n FROM menu_items").get().n, 6);
});
test("custom sub-options and eligibility are retained and server validated", async () => {
  const f = fixture();
  const g = {
    ...group(),
    options: [
      {
        id: "a_custom",
        name: "Extra",
        price: 2,
        subOptions: [{ name: "Large", price: 3 }],
        eligibilityRules: [{ min_order_subtotal: 200 }],
      },
    ],
  };
  await ok(await f.save("group", g));
  const c = await f.api.loadOptionCatalog(f.env, "a"),
    s = [
      {
        groupId: "a_drinks",
        items: [
          {
            optionId: "a_custom",
            quantity: 1,
            subOptions: [{ name: "Large" }],
          },
        ],
      },
    ];
  assert.equal(f.api.validateOptionSelection(c, "a_main", s, [], 200).extra, 5);
  assert.throws(
    () => f.api.validateOptionSelection(c, "a_main", s, [], 100),
    /MIN_ORDER/,
  );
});
test("3 of 7 choices, direct override and restore do not mutate the shared group", async () => {
  const f = fixture(),
    g = {
      ...group(),
      itemIds: ["a_main", "a_tea"],
      options: Array.from({ length: 7 }, (_, i) => ({
        id: "a_pick_" + i,
        name: "Choice " + i,
        price: i,
      })),
    };
  await ok(await f.save("group", g));
  let c = await f.api.loadOptionCatalog(f.env, "a");
  assert.equal(f.api.effectiveGroups(c, "a_main")[0].inherited, false);
  await ok(
    await f.save(
      "product",
      product([
        { groupId: g.id, optionIds: ["a_pick_0", "a_pick_1", "a_pick_2"] },
      ]),
    ),
  );
  c = await f.api.loadOptionCatalog(f.env, "a");
  assert.equal(f.api.effectiveGroups(c, "a_main")[0].options.length, 3);
  assert.equal(c.groups[0].options.length, 7);
  assert.equal(f.api.effectiveGroups(c, "a_tea")[0].options.length, 7);
  await ok(
    await f.save("product", {
      ...product([{ groupId: g.id, optionIds: null, disabled: true }]),
      revision: 1,
    }),
  );
  c = await f.api.loadOptionCatalog(f.env, "a");
  assert.equal(f.api.effectiveGroups(c, "a_main").length, 0);
  // Saving the group preserves a product's explicit suppression of group linking.
  await ok(
    await f.save("group", { ...g, revision: 1, itemIds: [] }),
  );
  c = await f.api.loadOptionCatalog(f.env, "a");
  assert.equal(f.api.effectiveGroups(c, "a_main").length, 0);
  await ok(await f.save("product", { ...product([{ groupId: g.id, optionIds: null, disabled: false }]), revision: 2 }));
  c = await f.api.loadOptionCatalog(f.env, "a");
  assert.equal(f.api.effectiveGroups(c, "a_main")[0].inherited, false);
  assert.equal(f.api.effectiveGroups(c, "a_main")[0].options.length, 7);
});
test("repeat rules count portions and price each portion without retail prices", async () => {
  const f = fixture();
  await ok(
    await f.save("group", {
      ...group(),
      minSelection: 2,
      maxSelection: 3,
      allowRepeats: true,
      options: [{ ...group().options[0], price: 5 }],
    }),
  );
  const c = await f.api.loadOptionCatalog(f.env, "a");
  const s = (q) => [
    {
      groupId: "a_drinks",
      items: [{ optionId: "a_drinks_coffee", quantity: q }],
    },
  ];
  assert.equal(f.api.validateOptionSelection(c, "a_main", s(3)).extra, 15);
  assert.throws(
    () => f.api.validateOptionSelection(c, "a_main", s(1)),
    /QUANTITY/,
  );
  assert.throws(
    () => f.api.validateOptionSelection(c, "a_main", s(4)),
    /QUANTITY/,
  );
});
test("stock restrictions and metadata survive editing; linked product changes remain live", async () => {
  const f = fixture();
  await ok(await f.save("group", group()));
  f.db
    .prepare(
      "UPDATE modifier_options SET is_out_of_stock=1,source_metadata_json='{" +
        '"source":"legacy"' +
        "}' WHERE id='a_drinks_coffee'",
    )
    .run();
  let c = await f.api.loadOptionCatalog(f.env, "a");
  await ok(
    await f.save("group", {
      ...c.groups[0],
      name: "New name",
      itemIds: ["a_main"],
    }),
  );
  const stored = f.db
    .prepare("SELECT * FROM modifier_options WHERE id=?")
    .get("a_drinks_coffee");
  assert.equal(stored.is_out_of_stock, 1);
  assert.equal(JSON.parse(stored.source_metadata_json).source, "legacy");
  assert.equal(
    f.db
      .prepare("SELECT out_of_stock_until FROM menu_items WHERE id=?")
      .get("a_coffee").out_of_stock_until,
    null,
  );
  f.db
    .prepare("UPDATE menu_items SET name=? WHERE id=?")
    .run("Renamed tea", "a_tea");
  c = await f.api.loadOptionCatalog(f.env, "a");
  assert.equal(f.api.groupOptions(c, c.groups[0])[1].name, "Renamed tea");
});
test("catalog guard rejects a concurrent write atomically and old writers advance entity revision", async () => {
  const f = fixture(),
    batch = f.env.DB.batch.bind(f.env.DB);
  let raced = false;
  f.env.DB.batch = async (statements) => {
    if (
      !raced &&
      statements[0].sql.startsWith("INSERT INTO menu_write_guards")
    ) {
      raced = true;
      f.db.prepare("UPDATE menu_items SET price=71 WHERE id=?").run("a_coffee");
    }
    return batch(statements);
  };
  assert.equal((await f.save("group", group())).status, 409);
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM modifier_groups").get().n,
    0,
  );
  assert.equal(
    f.db
      .prepare("SELECT menu_revision FROM menu_items WHERE id=?")
      .get("a_coffee").menu_revision,
    1,
  );
  assert.equal(
    (
      await f.save("product", {
        id: "a_coffee",
        name: "Coffee",
        price: 70,
        categoryId: "a_food",
        revision: 0,
        links: [],
      })
    ).status,
    409,
  );
});
test("invalid child prices and foreign inherited categories cannot be saved", async () => {
  const f = fixture();
  assert.equal(
    (await f.save("group", { ...group(), categoryIds: ["b_food"] })).status,
    400,
  );
  assert.equal(
    (
      await f.save("group", {
        ...group(),
        options: [
          {
            id: "a_bad",
            name: "Bad",
            price: 0,
            subOptions: [{ name: "x", price: -5 }],
          },
        ],
      })
    ).status,
    400,
  );
});
test("customer validation follows nested rules, live stock and canonical receipt prices", async () => {
  const f = fixture();
  await ok(await f.save("group", group()));
  await ok(
    await f.save("group", {
      id: "a_temp",
      name: "Temperature",
      revision: 0,
      minSelection: 1,
      maxSelection: 1,
      itemIds: ["a_coffee"],
      options: [{ id: "a_cold", name: "Cold", price: 3 }],
      sources: [],
    }),
  );
  const c = await f.api.loadOptionCatalog(f.env, "a"),
    rule = f.api.projectOptionRule(c, "a_main");
  const vm = require("node:vm"),
    fs = require("node:fs");
  const sandbox = {
    window: {},
    document: { documentElement: { lang: "vi" } },
    cart: { meal: 1 },
    resolveCatalogItem: () => ({ basePrice: 100 }),
    currentLocale: "vi",
  };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync("js/client-option-groups.js", "utf8"),
    sandbox,
  );
  vm.runInContext(fs.readFileSync("js/bundle-builder-v2.js", "utf8"), sandbox);
  const portion = {
    groups: [
      {
        groupId: "a_drinks",
        items: [
          {
            optionId: "a_drinks_coffee",
            itemId: "a_coffee",
            quantity: 1,
            surcharge: 0,
            groups: [
              {
                groupId: "a_temp",
                items: [
                  { optionId: "a_cold", quantity: 1, surcharge: 3, groups: [] },
                ],
              },
            ],
            modifiers: [{ name: "Cold", price: 3 }],
          },
        ],
      },
    ],
  };
  assert.equal(sandbox.window.UnifiedOptions.valid(rule, portion), true);
  assert.equal(sandbox.window.bundlePortionExtra(portion), 3);
  portion.groups[0].items[0].groups[0].items = [];
  assert.equal(sandbox.window.UnifiedOptions.valid(rule, portion), false);
});
test("included subsets honor shared fixed quantity rules", async () => {
  const f = fixture();
  await ok(await f.save("group", { ...group(), included: true }));
  assert.equal(
    (
      await f.save(
        "product",
        product([{ groupId: "a_drinks", optionIds: ["a_drinks_coffee"] }]),
      )
    ).status,
    400,
  );
});
test("legacy whole-menu writes cannot remove a referenced product or bypass the graph", async () => {
  const f = fixture();
  f.db.exec("ALTER TABLE menu_categories ADD COLUMN short_name TEXT;");
  await ok(await f.save("group", group()));
  const fs = require("node:fs"),
    vm = require("node:vm"),
    ts = require("../benmi-worker-official/node_modules/typescript");
  const exports = {};
  const context = vm.createContext({
    exports,
    console,
    Date,
    JSON,
    Map,
    Set,
    crypto: require("node:crypto").webcrypto,
    require: (name) => (name.includes("option-groups") ? f.api : {}),
  });
  const source =
    fs.readFileSync("benmi-worker-official/src/modules/menu.ts", "utf8") +
    "\nexport {syncMenuToD1};";
  vm.runInContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    context,
  );
  await assert.rejects(
    () =>
      exports.syncMenuToD1("a", { __delete: { items: ["a_coffee"] } }, f.env),
    /PRODUCT_IS_LINKED/,
  );
  assert.equal(f.db.prepare("SELECT count(*) n FROM menu_items").get().n, 6);
  await assert.rejects(
    () =>
      exports.syncMenuToD1(
        "a",
        { __delete: { categories: ["a_food"] } },
        f.env,
      ),
    /PRODUCT_IS_LINKED/,
  );
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM menu_categories").get().n,
    2,
  );
  await exports.syncMenuToD1('a',{a_food:{Meal:{id:'a_main',price:110}}},f.env);
  assert.equal(f.db.prepare('SELECT price FROM menu_items WHERE id=?').get('a_main').price,110);
  assert.equal(f.db.prepare('SELECT count(*) n FROM modifier_options').get().n,2);
  assert.equal(f.db.prepare('SELECT count(*) n FROM item_modifier_links').get().n,1);

  const current = (await f.api.loadOptionCatalog(f.env,'a')).groups[0];
  await ok(await f.save('group',{
    ...current, itemIds:['a_main'], sources:[],
    options:[{id:'child-only',name:'Custom parent',price:0,subOptions:[{id:'tea-child',productId:'a_tea',name:'Tea',price:15}]}],
  }));
  await assert.rejects(()=>exports.syncMenuToD1('a',{__delete:{items:['a_tea']}},f.env),/PRODUCT_IS_LINKED/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM menu_items WHERE id=?').get('a_tea').n,1);

});
test("optional legacy groups keep minimum zero after migration", async () => {
  const f = fixture();
  await ok(await f.save("group", { ...group(), itemIds: [], minSelection: 0 }));
  f.db
    .prepare(
      "UPDATE modifier_groups SET is_required=1,source_metadata_json=? WHERE id=?",
    )
    .run(JSON.stringify({ legacyBundleRuleId: "old_rule" }), "a_drinks");
  f.db.exec(
    require("node:fs").readFileSync(
      "benmi-worker-official/migrations/0066_optional_migrated_option_groups.sql",
      "utf8",
    ),
  );
  const c = await f.api.loadOptionCatalog(f.env, "a");
  assert.equal(c.groups[0].minSelection, 0);
});
test("customer editing restores legacy per-product choices alongside bundle selections", () => {
  const vm = require("node:vm"),
    fs = require("node:fs"),
    sandbox = {
      window: {},
      document: { documentElement: { lang: "vi" } },
      cart: {},
    };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync("js/client-option-groups.js", "utf8"),
    sandbox,
  );
  const rule = {
    groups: [
      {
        id: "new_drinks",
        metadata: { legacyGroupId: "old_drinks" },
        minSelection: 1,
        maxSelection: 1,
        eligibleItems: [
          {
            id: "new_coffee",
            productId: "coffee",
            name: "Coffee",
            price: 0,
            optionGroups: [],
          },
        ],
      },
      {
        id: "new_spicy",
        metadata: { slug: "spicy" },
        minSelection: 1,
        maxSelection: 1,
        eligibleItems: [{ id: "no_spicy", name: "No spice", price: 0 }],
      },
      {
        id: "new_topping",
        metadata: { slug: "topping" },
        minSelection: 0,
        maxSelection: 3,
        eligibleItems: [{ id: "cheese", name: "Cheese", price: 3 }],
      },
    ],
  };
  const restored = sandbox.window.UnifiedOptions.restore(
    rule,
    [{ groupId: "old_drinks", items: [{ itemId: "coffee", quantity: 1 }] }],
    {
      single: { spicy: "No spice" },
      multiple: { Cheese: true },
      note: "Keep note",
    },
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(restored.map((g) => g.items.map((i) => i.optionId))),
    ),
    [["new_coffee"], ["no_spicy"], ["cheese"]],
  );
  assert.equal(
    sandbox.window.UnifiedOptions.valid(rule, { groups: restored }),
    true,
  );
});

test("checkout refreshes canonical options in both languages and preserves a renamed product's cart", async () => {
  const fs = require("node:fs"), vm = require("node:vm");
  const source = fs.readFileSync("js/client-checkout.js", "utf8");
  const start = source.indexOf("        if (err.serverRejected) {");
  const end = source.indexOf('        console.warn("Primary API flow failed', start);
  assert.ok(start >= 0 && end > start);
  for (const locale of ["vi", "zh-TW"]) {
    const oldKey = "food_Old meal", newKey = "food_New meal";
    const selections = [{ groups: [{ groupId: "drinks", items: [{ optionId: "coffee", surcharge: 0 }] }] }];
    const notes = [{ note: "Less salt" }];
    const fresh = { tenant: { id: "tenant" }, menuComplete: true, catalog: [{ slug: "food", items: [{ id: "meal", name: "New meal", price: 110, bundleRule: { version: 3 } }] }] };
    let alert, callback, opened, refreshed = 0, totals = 0;
    const sandbox = {
      window: { customizeData: { [oldKey]: notes }, comboDrinkData: {}, bundleCartData: { [oldKey]: selections } },
      bootstrapData: { catalog: [{ slug: "food", items: [{ id: "meal", name: "Old meal" }] }] },
      cart: { [oldKey]: 1, "food_Other meal": 2 },
      currentLocale: locale,
      document: { documentElement: { lang: locale } },
      WORKER_BASE: "https://worker.example",
      AbortSignal,
      getTenantIdFromUrl: () => "tenant",
      fetch: async () => { refreshed++; return { ok: true, json: async () => fresh }; },
      buildStructuredCartItems: () => [{ itemId: "meal" }],
      resolveCatalogItem: key => ({ itemId: key === oldKey ? "meal" : "other" }),
      parseCartKey: () => ({ catSlug: "food", origName: "Old meal" }),
      updateTotal: () => { totals++; },
      customAlert: (message, onConfirm) => { alert = message; callback = onConfirm; },
      openBundleBuilderModal: (...args) => { opened = args; },
      console,
      err: { serverRejected: true, details: { code: "OPTION_PRICE_CHANGED", itemIndex: 0, expectedSubtotal: 110, error: "餐點價格已更新" } },
    };
    vm.createContext(sandbox);
    await vm.runInContext(`(async () => {${source.slice(start, end)}})()`, sandbox);
    assert.equal(refreshed, 1);
    assert.equal(totals, 1);
    assert.equal(sandbox.window.bootstrapData, fresh);
    assert.equal(sandbox.cart[newKey], 1);
    assert.equal(sandbox.cart[oldKey], undefined);
    assert.equal(sandbox.cart["food_Other meal"], 2);
    assert.equal(sandbox.window.bundleCartData[newKey], selections);
    assert.equal(sandbox.window.customizeData[newKey], notes);
    assert.match(alert, locale === "vi" ? /Giá món đã thay đổi.*Số tiền cập nhật.*110/ : /餐點價格已更新.*更新後金額.*110/);
    callback();
    assert.deepEqual(opened, ["food", "New meal", 0]);
    // Rejected options never send another order or discard unrelated cart data.
    sandbox.err.details = { code: "OPTION_UNAVAILABLE", itemIndex: 0 };
    sandbox.resolveCatalogItem = key => ({ itemId: key === newKey ? "meal" : "other" });
    await vm.runInContext(`(async () => {${source.slice(start, end)}})()`, sandbox);
    assert.match(alert, locale === "vi" ? /hết hàng/ : /已售完/);
    assert.equal(sandbox.window.bundleCartData[newKey], selections);
  }
});

test("configured legacy product choices become a shared live group with zero retail charge", async () => {
  const f = fixture();
  f.db.prepare("INSERT INTO menu_categories(id,tenant_id,name,category_type) VALUES ('a_source','a','Beverages','catalog')").run();
  f.db.prepare("UPDATE menu_items SET category_id='a_source' WHERE id IN ('a_coffee','a_tea')").run();
  const before = JSON.stringify(f.db.prepare("SELECT id,name,price,category_id,out_of_stock_until FROM menu_items ORDER BY id").all());
  const catalog = await f.api.loadOptionCatalog(f.env, 'a');
  const mapping = {parentCategoryId:'a_food',sourceCategoryId:'a_source',name:'Beverage choice',labels:{vi:'Chọn đồ uống','zh-TW':'飲料選擇'}};
  const payload = require('../scripts/prepare-option-source-backfill.cjs').prepare(catalog,mapping);
  await ok(await f.save('group',payload));
  const updated = await f.api.loadOptionCatalog(f.env,'a');
  const rule = f.api.projectOptionRule(updated,'a_main');
  assert.equal(rule.groups.length,1);
  assert.equal(rule.groups[0].minSelection,1);
  assert.equal(rule.groups[0].maxSelection,1);
  assert.equal(rule.groups[0].eligibleItems.length,2);
  assert.ok(rule.groups[0].eligibleItems.every(o=>o.price===0 && o.retailPrice>0));
  assert.equal(JSON.stringify(f.db.prepare("SELECT id,name,price,category_id,out_of_stock_until FROM menu_items ORDER BY id").all()),before);
  const sandbox={window:{},document:{documentElement:{lang:'vi'}},cart:{}};
  require('node:vm').createContext(sandbox);
  require('node:vm').runInContext(require('node:fs').readFileSync('js/client-option-groups.js','utf8'),sandbox);
  const restored=sandbox.window.UnifiedOptions.restore(rule,[],{},'Tea');
  assert.equal(restored[0].items[0].itemId,'a_tea');
  assert.equal(restored[0].items[0].surcharge,0);
  assert.equal(sandbox.window.UnifiedOptions.valid(rule,{groups:restored}),true);
  const order=[{itemId:'a_main',quantity:1,subtotal:100,bundleSelections:{version:3,portions:[{groups:restored}]}}];
  assert.equal((await f.api.validateUnifiedOrderItems(f.env,'a',order)).valid,true);
  assert.equal(order[0].subtotal,100);
  f.db.prepare("INSERT INTO menu_items(id,tenant_id,category_id,name,price) VALUES ('a_new','a','a_source','Water',55)").run();
  assert.equal(f.api.projectOptionRule(await f.api.loadOptionCatalog(f.env,'a'),'a_main').groups[0].eligibleItems.length,3);
  assert.throws(()=>require('../scripts/prepare-option-source-backfill.cjs').prepare(updated,mapping),/GROUP_ALREADY_MIGRATED/);
});

test('linked child choices preserve custom choices and independent surcharge while resolving live product data', async () => {
  const f=fixture();
  const draft={...group(), options:[{...group().options[0], subOptions:['Less',{id:'tea-child',productId:'a_tea',name:'Spoofed name',price:15}]}]};
  await ok(await f.save('group',draft));
  let catalog=await f.api.loadOptionCatalog(f.env,'a');
  const stored=JSON.parse(f.db.prepare('SELECT sub_options_json FROM modifier_options WHERE id=?').get('a_drinks_coffee').sub_options_json);
  assert.equal(stored[0],'Less'); assert.equal(stored[1].productId,'a_tea'); assert.equal(stored[1].name,'Tea'); assert.equal(stored[1].price,15);
  f.db.prepare('UPDATE menu_items SET name=?,price=? WHERE id=?').run('Renamed tea',900,'a_tea');
  catalog=await f.api.loadOptionCatalog(f.env,'a');
  const child=f.api.groupOptions(catalog,catalog.groups[0])[0].subOptions[1];
  assert.equal(child.name,'Renamed tea'); assert.equal(child.retailPrice,900); assert.equal(child.price,15);
  const select=[{groupId:'a_drinks',items:[{optionId:'a_drinks_coffee',quantity:1,groups:[],subOptions:[{id:'tea-child',name:'Untrusted',price:999}]}]}];
  const canonical=f.api.validateOptionSelection(catalog,'a_main',select);
  assert.equal(canonical.extra,15);
  assert.equal(canonical.groups[0].items[0].subOptions[0].name,'Renamed tea');
  assert.equal(canonical.groups[0].items[0].subOptions[0].itemId,'a_tea');
  assert.equal(canonical.groups[0].items[0].subOptions[0].id,'tea-child');
  assert.equal(f.api.projectOptionRule(catalog,'a_main').groups[0].eligibleItems[0].subOptions[1].retailPrice,900);
  f.db.close();
});

test('linked children reject foreign references and duplicate products without writing the group', async () => {
  for (const children of [
    [{id:'foreign',productId:'b_tea',name:'Tea',price:0}],
    [{id:'one',productId:'a_tea',name:'Tea',price:0},{id:'two',productId:'a_tea',name:'Tea',price:5}],
    [{id:'missing',productId:'does-not-exist',name:'Tea',price:0}],
  ]) {
    const f=fixture();
    const response=await f.save('group',{...group(),options:[{...group().options[0],subOptions:children}]});
    assert.equal(response.status,400);
    assert.equal(f.db.prepare('SELECT COUNT(*) count FROM modifier_groups').get().count,0);
    f.db.close();
  }
});

test('child product availability and deletion guards follow the reference, including duplicate submitted children', async () => {
  const f=fixture();
  await ok(await f.save('group',{...group(),options:[{...group().options[0],subOptions:[{id:'tea-child',productId:'a_tea',name:'Tea',price:15}]}]}));
  const select=(children)=>[{groupId:'a_drinks',items:[{optionId:'a_drinks_coffee',quantity:1,groups:[],subOptions:children}]}];
  let catalog=await f.api.loadOptionCatalog(f.env,'a');
  assert.throws(()=>f.api.validateOptionSelection(catalog,'a_main',select([{id:'tea-child'},{id:'tea-child'}])),/OPTION_SUB_DUPLICATE/);
  const deletion=await f.save('product',{id:'a_tea',revision:0,delete:true});
  assert.equal(deletion.status,400); assert.equal((await deletion.json()).error,'PRODUCT_IS_LINKED');
  f.db.prepare('UPDATE menu_items SET out_of_stock_until=? WHERE id=?').run('2999-01-01T00:00:00Z','a_tea');
  catalog=await f.api.loadOptionCatalog(f.env,'a');
  assert.equal(f.api.projectOptionRule(catalog,'a_main').groups[0].eligibleItems[0].subOptions[0].isOutOfStock,true);
  assert.throws(()=>f.api.validateOptionSelection(catalog,'a_main',select([{id:'tea-child'}])),/OPTION_SUB_INVALID/);
  assert.equal(f.api.validateOptionSelection(catalog,'a_main',select([])).extra,0);
  f.db.close();
});

test('rejects saving group with 0 options or with insufficient options for min/max selection', async () => {
  const f = fixture();
  // 1. Group with 0 options is rejected
  const emptyRes = await f.save('group', { ...group(), options: [] });
  assert.equal(emptyRes.status, 400);
  assert.equal((await emptyRes.json()).error, 'INSUFFICIENT_OPTIONS:a_drinks');

  // 2. Group with 1 option but minSelection = 2 is rejected
  const minRes = await f.save('group', { ...group(), options: [group().options[0]], minSelection: 2, maxSelection: 2 });
  assert.equal(minRes.status, 400);
  assert.equal((await minRes.json()).error, 'INSUFFICIENT_OPTIONS:a_drinks');

  // 3. Group with 1 option and allowRepeats = false but maxSelection = 2 is rejected
  const maxRes = await f.save('group', { ...group(), options: [group().options[0]], minSelection: 1, maxSelection: 2, allowRepeats: false });
  assert.equal(maxRes.status, 400);
  assert.equal((await maxRes.json()).error, 'INSUFFICIENT_OPTIONS:a_drinks');

  // 4. Group with 1 option and allowRepeats = true with maxSelection = 2 succeeds
  const repeatRes = await f.save('group', { ...group(), options: [group().options[0]], minSelection: 1, maxSelection: 2, allowRepeats: true });
  assert.equal(repeatRes.status, 200);

  f.db.close();
});

test('group scope persists as order or item, clears item links for order scope, and updates on conflict', async () => {
  const f = fixture();
  // 1. Create an order-level group with custom options
  const orderGroup = {
    id: 'a_order_note',
    name: 'Ghi chú toàn đơn',
    scope: 'order',
    revision: 0,
    minSelection: 0,
    maxSelection: 1,
    allowRepeats: false,
    included: false,
    options: [{ id: 'a_opt_note', name: 'Ít đá', price: 0, quantity: 1 }],
  };
  const res = await f.save('group', orderGroup);
  assert.equal(res.status, 200);

  let c = await f.api.loadOptionCatalog(f.env, 'a');
  const saved = c.groups.find((g) => g.id === 'a_order_note');
  assert.equal(saved.scope, 'order');
  // Order group is not linked to meal
  assert.equal(f.api.effectiveGroups(c, 'a_main').some((g) => g.id === 'a_order_note'), false);

  // 2. Updating scope on conflict works
  const updateRes = await f.save('group', {
    ...orderGroup,
    name: 'Ghi chú cập nhật',
    scope: 'item',
    itemIds: ['a_main'],
    revision: saved.revision,
  });
  assert.equal(updateRes.status, 200);
  c = await f.api.loadOptionCatalog(f.env, 'a');
  const updated = c.groups.find((g) => g.id === 'a_order_note');
  assert.equal(updated.scope, 'item');
  assert.equal(updated.name, 'Ghi chú cập nhật');
  assert.equal(f.api.effectiveGroups(c, 'a_main').some((g) => g.id === 'a_order_note'), true);

  f.db.close();
});

test('autoPopup is derived from required or included groups and ignores legacy independent flags', async () => {
  const f = fixture();

  // 1. Group with autoPopup: false and minSelection: 0 (e.g. spicy level / cilantro)
  const optionalGroup = {
    id: 'a_spice',
    name: 'Độ cay',
    scope: 'item',
    revision: 0,
    minSelection: 0,
    maxSelection: 1,
    allowRepeats: false,
    included: false,
    autoPopup: false,
    itemIds: ['a_main'],
    options: [
      { id: 'a_spice_mild', name: 'Ít cay', price: 0, quantity: 1 },
      { id: 'a_spice_hot', name: 'Cay nhiều', price: 5, quantity: 1 },
    ],
  };
  const res1 = await f.save('group', optionalGroup);
  assert.equal(res1.status, 200);

  let c = await f.api.loadOptionCatalog(f.env, 'a');
  let savedSpice = c.groups.find((g) => g.id === 'a_spice');
  assert.equal(savedSpice.autoPopup, false);

  // When only optional group exists on a_main, projected rule has autoPopup: false
  let rule = f.api.projectOptionRule(c, 'a_main');
  assert.equal(rule.autoPopup, false);
  assert.equal(rule.groups[0].autoPopup, false);
  const orderItems = [{ itemId: 'a_main', quantity: 2, subtotal: 205, bundleSelections: { portions: [
    { groups: [{ groupId: 'a_spice', items: [{ optionId: 'a_spice_hot', quantity: 1 }] }] },
    { groups: [{ groupId: 'a_spice', items: [] }] },
  ] } }];
  assert.equal((await f.api.validateUnifiedOrderItems(f.env, 'a', orderItems)).valid, true);
  assert.equal(orderItems[0].subtotal, 205);

  // 2. Required group (minSelection: 1) forces autoPopup: true even if autoPopup: false is submitted
  const requiredGroup = {
    id: 'a_drink_required',
    name: 'Chọn nước',
    scope: 'item',
    revision: 0,
    minSelection: 1,
    maxSelection: 1,
    allowRepeats: false,
    included: false,
    autoPopup: false, // Should be overridden to true
    itemIds: ['a_main'],
    options: [
      { id: 'a_opt_tea', name: 'Trà tắc', productId: 'a_tea', price: 0, quantity: 1 },
    ],
  };
  const res2 = await f.save('group', requiredGroup);
  assert.equal(res2.status, 200);

  c = await f.api.loadOptionCatalog(f.env, 'a');
  let savedDrink = c.groups.find((g) => g.id === 'a_drink_required');
  assert.equal(savedDrink.autoPopup, true);

  // Now a_main has one optional group (autoPopup: false) and one required group (autoPopup: true)
  // Overall rule autoPopup must be true
  rule = f.api.projectOptionRule(c, 'a_main');
  assert.equal(rule.autoPopup, true);

  // A stale client cannot turn popup on independently of the minimum quantity.
  const res3 = await f.save('group', {
    ...optionalGroup,
    revision: savedSpice.revision,
    autoPopup: true,
  });
  assert.equal(res3.status, 200);
  c = await f.api.loadOptionCatalog(f.env, 'a');
  savedSpice = c.groups.find((g) => g.id === 'a_spice');
  assert.equal(savedSpice.autoPopup, false);
  assert.equal(f.db.prepare('SELECT auto_popup FROM modifier_groups WHERE id=?').get('a_spice').auto_popup, 0);
  // Old rows are read with the same derived rule without needing a migration.
  f.db.prepare('UPDATE modifier_groups SET auto_popup=1 WHERE id=?').run('a_spice');
  c = await f.api.loadOptionCatalog(f.env, 'a');
  assert.equal(c.groups.find(g => g.id === 'a_spice').autoPopup, false);
  await ok(await f.save('group', { ...requiredGroup, revision: savedDrink.revision, minSelection: 0, autoPopup: true }));
  c = await f.api.loadOptionCatalog(f.env, 'a');
  assert.equal(f.api.projectOptionRule(c, 'a_main').autoPopup, false);
  await ok(await f.save('group', { ...optionalGroup, revision: savedSpice.revision, included: true, autoPopup: false }));
  c = await f.api.loadOptionCatalog(f.env, 'a');
  assert.equal(f.api.projectOptionRule(c, 'a_main').autoPopup, true);

  f.db.close();
});

test("saving option group linked to item with existing legacy bundle rule ID updates menu_bundle_rules without UNIQUE conflict", async () => {
  const f = fixture();
  // Insert an existing rule with legacy ID format into menu_bundle_rules
  f.db.prepare(
    "INSERT INTO menu_bundle_rules (id, tenant_id, parent_item_id, schema_version, config_json, is_active) VALUES (?, ?, ?, 1, ?, 1)"
  ).run("legacy_rule_combo_1", "a", "a_main", JSON.stringify({ version: 1, groups: [] }));

  // Save a group linked to a_main with a custom option
  const res = await f.save("group", {
    ...group(),
    id: "a_drinks",
    itemIds: ["a_main"],
    options: [
      { id: "a_opt_tea", name: "Trà tắc", productId: "a_tea", price: 0, quantity: 1 },
      { id: "a_opt_custom", name: "Custom Choice", productId: null, price: 10, quantity: 1 }
    ]
  });
  assert.equal(res.status, 200);

  // Check that menu_bundle_rules still has exactly 1 row for (tenant_id='a', parent_item_id='a_main')
  const rows = f.db.prepare("SELECT id, schema_version, config_json FROM menu_bundle_rules WHERE tenant_id='a' AND parent_item_id='a_main'").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "legacy_rule_combo_1");
  assert.equal(rows[0].schema_version, 3);
  const config = JSON.parse(rows[0].config_json);
  assert.equal(config.groups[0].eligibleItems.some(o => o.name === "Custom Choice"), true);

  f.db.close();
});

test("saving product links respects explicit sortOrder, tie-breaks by group sortOrder, and pushes disabled links after active links", async () => {
  const f = fixture();
  await ok(await f.save("group", { ...group(), id: "a_g1", name: "G1", sortOrder: 1, options: [{ id: "o1", name: "O1", price: 0, quantity: 1 }] }));
  await ok(await f.save("group", { ...group(), id: "a_g2", name: "G2", sortOrder: 2, options: [{ id: "o2", name: "O2", price: 0, quantity: 1 }] }));
  await ok(await f.save("group", { ...group(), id: "a_g3", name: "G3", sortOrder: 0, options: [{ id: "o3", name: "O3", price: 0, quantity: 1 }] }));

  const cat1 = await f.api.loadOptionCatalog(f.env, "a");
  const prod = cat1.products.find((p) => p.id === "a_main");
  // Deliberately send links out of explicit sortOrder order with a disabled link at index 0
  const saved1 = await ok(await f.save("product", {
    id: prod.id,
    name: prod.name,
    price: prod.price,
    categoryId: prod.category_id,
    revision: prod.menu_revision,
    links: [
      { groupId: "a_g2", optionIds: null, disabled: true, sortOrder: 0 },
      { groupId: "a_g1", optionIds: null, disabled: false, sortOrder: 2 },
      { groupId: "a_g3", optionIds: null, disabled: false, sortOrder: 1 },
    ],
  }));
  assert.deepEqual(f.api.effectiveGroups(saved1.catalog, "a_main").map((g) => g.id), ["a_g3", "a_g1"]);

  // Tied sortOrder=0 breaks cleanly by modifier_groups.sort_order (a_g3=0, a_g1=1, a_g2=2)
  const prod2 = saved1.catalog.products.find((p) => p.id === "a_main");
  const saved2 = await ok(await f.save("product", {
    id: prod2.id,
    name: prod2.name,
    price: prod2.price,
    categoryId: prod2.category_id,
    revision: prod2.menu_revision,
    links: [
      { groupId: "a_g2", optionIds: null, disabled: false, sortOrder: 0 },
      { groupId: "a_g1", optionIds: null, disabled: false, sortOrder: 0 },
      { groupId: "a_g3", optionIds: null, disabled: false, sortOrder: 0 },
    ],
  }));
  assert.deepEqual(f.api.effectiveGroups(saved2.catalog, "a_main").map((g) => g.id), ["a_g3", "a_g1", "a_g2"]);

  f.db.close();
});

