const test = require("node:test");
const assert = require("node:assert/strict");
const { schemaTrueFixture } = require("./helpers/option-groups.cjs");

test("New Menu: Optimistic Concurrency Control (MENU_CONFLICT / 409)", async () => {
  const f = schemaTrueFixture();
  const tenantId = "jiangjiejie";
  const catalog = await f.api.loadOptionCatalog(f.env, tenantId);
  const group = catalog.groups[0];
  assert.ok(group, "Must have at least one group for jiangjiejie");

  const originalRevision = group.revision;

  // Tab A saves changes with current revision
  const payloadA = {
    ...group,
    name: group.name + " (Tab A Edit)",
    itemIds: catalog.links.filter((l) => l.groupId === group.id && !l.disabled).map((l) => l.itemId),
    categoryIds: catalog.categoryLinks.filter((l) => l.groupId === group.id).map((l) => l.categoryId),
    delete: false,
  };
  const resA = await f.save("group", payloadA, tenantId);
  assert.equal(resA.status, 200);
  const bodyA = await resA.json();
  assert.equal(bodyA.success, true);
  const newRevision = bodyA.catalog.groups.find((g) => g.id === group.id).revision;
  assert.ok(newRevision > originalRevision, "Revision must increment on successful save");

  // Tab B attempts to save with stale revision (originalRevision)
  const payloadB = {
    ...group,
    revision: originalRevision,
    name: group.name + " (Tab B Stale Edit)",
    itemIds: payloadA.itemIds,
    categoryIds: payloadA.categoryIds,
    delete: false,
  };
  const resB = await f.save("group", payloadB, tenantId);
  assert.equal(resB.status, 409, "Stale revision must be rejected with 409 Conflict");
  const bodyB = await resB.json();
  assert.equal(bodyB.error, "MENU_CONFLICT");

  // Product concurrency check
  const product = catalog.products[0];
  const prodRevision = product.menu_revision;

  // Save product update
  const prodPayloadA = {
    ...product,
    categoryId: product.category_id,
    revision: prodRevision,
    name: product.name + " (Updated)",
    links: catalog.links.filter((l) => l.itemId === product.id),
    delete: false,
  };
  const prodResA = await f.save("product", prodPayloadA, tenantId);
  assert.equal(prodResA.status, 200);

  // Stale product update
  const prodPayloadB = {
    ...prodPayloadA,
    revision: prodRevision, // stale
    name: product.name + " (Stale)",
  };
  const prodResB = await f.save("product", prodPayloadB, tenantId);
  assert.equal(prodResB.status, 409, "Stale product update must be rejected with 409 Conflict");

  f.db.close();
});

test("New Menu: Scope Switching between 'item' and 'order' preserves shadow sync", async () => {
  const f = schemaTrueFixture();
  const tenantId = "jiangjiejie";
  const catalog = await f.api.loadOptionCatalog(f.env, tenantId);
  const group = catalog.groups.find((g) => g.scope === "item");
  assert.ok(group, "Must have an item-scoped group");

  const linkedItemIds = catalog.links.filter((l) => l.groupId === group.id && !l.disabled).map((l) => l.itemId);
  assert.ok(linkedItemIds.length > 0, "Item-scoped group must be linked to at least one item");

  // Step 1: Switch group from 'item' scope to 'order' scope
  const orderScopePayload = {
    ...group,
    scope: "order",
    minSelection: 0,
    maxSelection: 1,
    itemIds: [],
    categoryIds: [],
    sources: [],
    options: [
      { id: "opt_scope_1", name: "Tùy chọn A", price: 0, quantity: 1, isDefault: true, subOptions: [], eligibilityRules: [] },
      { id: "opt_scope_2", name: "Tùy chọn B", price: 5, quantity: 1, isDefault: false, subOptions: [], eligibilityRules: [] },
    ],
    delete: false,
  };

  const toOrderRes = await f.save("group", orderScopePayload, tenantId);
  assert.equal(toOrderRes.status, 200, "Switching to order scope must succeed");
  const toOrderBody = await toOrderRes.json();
  assert.equal(toOrderBody.success, true);

  // Verify in D1: written to menu_customizations, links cleared
  const customRow = f.db.prepare("SELECT * FROM menu_customizations WHERE tenant_id=? AND (id=? OR key=?)").get(tenantId, group.id, group.id);
  assert.ok(customRow, "Group must be persisted in menu_customizations when scope is order");
  const remainingLinks = f.db.prepare("SELECT count(*) n FROM item_modifier_links WHERE tenant_id=? AND group_id=?").get(tenantId, group.id);
  assert.equal(remainingLinks.n, 0, "Item modifier links must be cleared for order scope");

  // Step 2: Switch group back from 'order' scope to 'item' scope and re-link
  const itemScopePayload = {
    ...toOrderBody.catalog.groups.find((g) => g.id === group.id),
    scope: "item",
    itemIds: linkedItemIds,
    categoryIds: [],
    delete: false,
  };

  const toItemRes = await f.save("group", itemScopePayload, tenantId);
  assert.equal(toItemRes.status, 200, "Switching back to item scope must succeed");
  const toItemBody = await toItemRes.json();
  assert.equal(toItemBody.success, true);

  // Verify in D1: deleted from menu_customizations, recreated in item_modifier_links & menu_bundle_rules
  const cleanedCustomRow = f.db.prepare("SELECT * FROM menu_customizations WHERE tenant_id=? AND (id=? OR key=?)").get(tenantId, group.id, group.id);
  assert.equal(cleanedCustomRow, undefined, "Group must be removed from menu_customizations when switched to item scope");

  for (const itemId of linkedItemIds) {
    const bundleRule = f.api.projectOptionRule(toItemBody.catalog, itemId);
    assert.ok(bundleRule, `Bundle rule for item ${itemId} must be restored`);
    assert.ok(bundleRule.groups.some((bg) => bg.id === group.id), `Restored rule must contain group ${group.id}`);
  }

  f.db.close();
});

test("New Menu: Jiangjiejie category-sourced products can be deleted from live combo choices", async () => {
  const f = schemaTrueFixture();
  const tenantId = "jiangjiejie";
  const catalog = await f.api.loadOptionCatalog(f.env, tenantId);

  // Category sources resolve the current catalog rather than store fixed product references.
  let linkedProductId = null;
  let linkedGroupId = null;
  for (const g of catalog.groups) {
    const optWithProduct = f.api.groupOptions(catalog, g).find((o) => o.productId && o.fromSource);
    if (optWithProduct) {
      linkedProductId = optWithProduct.productId;
      linkedGroupId = g.id;
      break;
    }
  }

  assert.ok(linkedProductId, "Must find a product supplied by a live category source");

  // Attempt to delete this product
  const targetProduct = catalog.products.find((p) => p.id === linkedProductId);
  const deleteRes = await f.save("product", {
    id: linkedProductId,
    revision: targetProduct.menu_revision,
    delete: true,
  }, tenantId);

  assert.equal(deleteRes.status, 200, await deleteRes.clone().text());
  const after = await f.api.loadOptionCatalog(f.env, tenantId);
  const remainingGroup = after.groups.find(g => g.id === linkedGroupId);
  assert.ok(remainingGroup, "Deleting a source product preserves the combo group");
  assert.equal(f.api.groupOptions(after, remainingGroup).some(o => o.productId === linkedProductId), false);

  // The write and the live option projection both reflect the deletion.
  const prodInDb = f.db.prepare("SELECT count(*) n FROM menu_items WHERE tenant_id=? AND id=?").get(tenantId, linkedProductId);
  assert.equal(prodInDb.n, 0, "Deleted product must be removed from the database");

  f.db.close();
});

test("New Menu: Dynamic Out-of-Stock Propagation and Order Blocking", async () => {
  const f = schemaTrueFixture();
  const tenantId = "jiangjiejie";
  const catalog = await f.api.loadOptionCatalog(f.env, tenantId);

  // Find a group linked to combo A1
  const comboProduct = catalog.products.find((p) => p.id === "jj_combo_a1");
  assert.ok(comboProduct, "Combo A1 must exist");
  const groups = f.api.effectiveGroups(catalog, comboProduct.id);
  const targetGroup = groups[0];
  const targetOption = targetGroup.options[0];
  assert.ok(targetOption.productId, "Target option must reference a product SKU");

  // 1. Mark the target underlying product as out of stock via out_of_stock_until
  f.db.prepare("UPDATE menu_items SET out_of_stock_until=datetime('now', '+1 day') WHERE id=?").run(targetOption.productId);

  // 2. Reload catalog and verify option reports out of stock
  const updatedCatalog = await f.api.loadOptionCatalog(f.env, tenantId);
  const updatedGroups = f.api.effectiveGroups(updatedCatalog, comboProduct.id);
  const updatedOpt = updatedGroups[0].options.find((o) => o.id === targetOption.id);
  assert.equal(updatedOpt.isOutOfStock, true, "Option must reflect product's out of stock state");

  // 3. Attempt customer order with this out-of-stock option -> MUST throw OPTION_UNAVAILABLE
  const orderSelection = [
    {
      groupId: targetGroup.id,
      items: [{ itemId: targetOption.id, quantity: targetGroup.minSelection || 1 }],
    },
    ...groups.slice(1).map((g) => ({
      groupId: g.id,
      items: [{ itemId: g.options.find((o) => !o.isOutOfStock).id, quantity: g.minSelection || 1 }],
    })),
  ];

  assert.throws(
    () => f.api.validateOptionSelection(updatedCatalog, comboProduct.id, orderSelection, [], 1000),
    /OPTION_UNAVAILABLE/,
    "Ordering an out-of-stock option must be blocked"
  );

  // 4. Restore product in stock
  f.db.prepare("UPDATE menu_items SET out_of_stock_until=NULL WHERE id=?").run(targetOption.productId);
  const restoredCatalog = await f.api.loadOptionCatalog(f.env, tenantId);
  const restoredGroups = f.api.effectiveGroups(restoredCatalog, comboProduct.id);
  const restoredOpt = restoredGroups[0].options.find((o) => o.id === targetOption.id);
  assert.equal(restoredOpt.isOutOfStock, false, "Option must reflect restored in-stock state");

  // Order should now succeed
  const validResult = f.api.validateOptionSelection(restoredCatalog, comboProduct.id, orderSelection, [], 1000);
  assert.ok(validResult, "Order with in-stock option must succeed");

  f.db.close();
});

test("New Menu: Strict Repeat Rules and Quantity Bounds on Customer Checkout", async () => {
  const f = schemaTrueFixture();
  const tenantId = "jiangjiejie";
  const catalog = await f.api.loadOptionCatalog(f.env, tenantId);

  // Group: 請選擇 6 樣配菜 (minSelection: 6, maxSelection: 6, allowRepeats: true)
  const combo = catalog.products.find((p) => p.id === "jj_combo_a1");
  const groups = f.api.effectiveGroups(catalog, combo.id);
  const repeatGroup = groups.find((g) => g.allowRepeats && g.minSelection === 6);
  assert.ok(repeatGroup, "Combo A1 must have the choose-6 repeat group");

  const option = repeatGroup.options[0];

  // Case 1: Exactly 6 portions of the same item -> SUCCEEDS because allowRepeats is true
  const validRepeatSelection = [
    {
      groupId: repeatGroup.id,
      items: [{ itemId: option.id, quantity: 6 }],
    },
    ...groups.filter((g) => g.id !== repeatGroup.id).map((g) => ({
      groupId: g.id,
      items: [{ itemId: g.options[0].id, quantity: g.minSelection || 1 }],
    })),
  ];

  const res1 = f.api.validateOptionSelection(catalog, combo.id, validRepeatSelection, [], 1000);
  assert.ok(res1, "Selecting 6 portions of the same item must succeed with allowRepeats: true");

  // Case 2: Only 5 portions -> MUST FAIL with OPTION_QUANTITY
  const underCountSelection = [
    {
      groupId: repeatGroup.id,
      items: [{ itemId: option.id, quantity: 5 }],
    },
    ...groups.filter((g) => g.id !== repeatGroup.id).map((g) => ({
      groupId: g.id,
      items: [{ itemId: g.options[0].id, quantity: g.minSelection || 1 }],
    })),
  ];
  assert.throws(
    () => f.api.validateOptionSelection(catalog, combo.id, underCountSelection, [], 1000),
    /OPTION_QUANTITY/,
    "Selecting fewer than minSelection must throw OPTION_QUANTITY"
  );

  // Case 3: 7 portions -> MUST FAIL with OPTION_QUANTITY
  const overCountSelection = [
    {
      groupId: repeatGroup.id,
      items: [{ itemId: option.id, quantity: 7 }],
    },
    ...groups.filter((g) => g.id !== repeatGroup.id).map((g) => ({
      groupId: g.id,
      items: [{ itemId: g.options[0].id, quantity: g.minSelection || 1 }],
    })),
  ];
  assert.throws(
    () => f.api.validateOptionSelection(catalog, combo.id, overCountSelection, [], 1000),
    /OPTION_QUANTITY/,
    "Selecting more than maxSelection must throw OPTION_QUANTITY"
  );

  f.db.close();
});

test("New Menu: Eligibility Threshold Rules (min_order_subtotal)", async () => {
  const f = schemaTrueFixture();
  const tenantId = "jiangjiejie";
  const catalog = await f.api.loadOptionCatalog(f.env, tenantId);

  // Create an option group with an eligibility rule
  const group = catalog.groups[0];
  const eligibleGroup = {
    ...group,
    id: "test_threshold_group",
    isNew: true,
    name: "Quà tặng đơn hàng lớn",
    minSelection: 0,
    maxSelection: 1,
    itemIds: ["jj_combo_a1"],
    options: [
      {
        id: "opt_vip_gift",
        name: "Đồ uống miễn phí",
        price: 0,
        productId: null,
        quantity: 1,
        isDefault: false,
        subOptions: [],
        eligibilityRules: [
          {
            rule_type: "min_order_subtotal",
            min_order_subtotal: 500,
            threshold_basis: "merchandise_subtotal",
            error_message: "Đơn hàng phải từ $500 trở lên",
          },
        ],
      },
    ],
    delete: false,
  };

  const saveRes = await f.save("group", eligibleGroup, tenantId);
  assert.equal(saveRes.status, 200);
  const updatedCatalog = (await saveRes.json()).catalog;

  const effective = f.api.effectiveGroups(updatedCatalog, "jj_combo_a1");
  const buildSelections = () => [
    { groupId: "test_threshold_group", items: [{ itemId: "opt_vip_gift", quantity: 1 }] },
    ...effective
      .filter((g) => g.id !== "test_threshold_group")
      .map((g) => ({
        groupId: g.id,
        items: [{ itemId: g.options[0].id, quantity: g.minSelection || 1 }],
      })),
  ];

  // Case 1: Merchandise subtotal = $300 (< $500 threshold) -> MUST THROW MIN_ORDER_SUBTOTAL_NOT_MET
  assert.throws(
    () => f.api.validateOptionSelection(updatedCatalog, "jj_combo_a1", buildSelections(), [], 300),
    /MIN_ORDER_SUBTOTAL_NOT_MET/,
    "Option selection below minimum threshold must fail"
  );

  // Case 2: Merchandise subtotal = $600 (>= $500 threshold) -> SUCCEEDS
  const validRes = f.api.validateOptionSelection(updatedCatalog, "jj_combo_a1", buildSelections(), [], 600);
  assert.ok(validRes, "Option selection meeting threshold must succeed");

  // Cleanup
  await f.save("group", { ...eligibleGroup, delete: true }, tenantId);
  f.db.close();
});
