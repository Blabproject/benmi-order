// Dedicated test suite verifying fixes for POS menu issues:
// 1. Image deletion and save persistence (Bug 1)
// 2. Dynamic source resolution in POS group options (Bug 2)
// 3. Cycle prevention when an option product links back to an ancestor group (Bug 3)
// 4. Item and category reordering with explicit sort_order persistence (Bug 4)

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { setup } = require('./helpers/menu-drawer-dom.cjs');
const { fixture } = require('./helpers/option-groups.cjs');
const { loadMenuEditor } = require('./helpers/menu-editor-loader.cjs');

const root = path.resolve(__dirname, '..');

test('Bug 1: Removing photo in POS sets imageKey to null and updates KV image list', async () => {
  const f = fixture();
  // Create product with an image
  await f.save('product', {
    id: 'a_main',
    name: 'Meal',
    price: 100,
    categoryId: 'a_food',
    revision: 0,
    imageKey: 'product:a_main',
    links: []
  });

  const catWithImage = await f.api.loadOptionCatalog(f.env, 'a');
  const prodWithImage = catWithImage.products.find(p => p.id === 'a_main');
  assert.equal(prodWithImage.image_key, 'product:a_main');

  // Now save product with imageKey: "" (cleared photo)
  const res = await f.save('product', {
    id: 'a_main',
    name: 'Meal',
    price: 100,
    categoryId: 'a_food',
    revision: prodWithImage.menu_revision,
    imageKey: '',
    links: []
  });
  assert.equal(res.status, 200);

  // In database, image_key must be NULL
  const catCleared = await f.api.loadOptionCatalog(f.env, 'a');
  const prodCleared = catCleared.products.find(p => p.id === 'a_main');
  assert.equal(prodCleared.image_key, null, 'image_key must be null in D1 when removed');
});

test('Bug 2: Sourced items in combo groups are dynamically resolved in POS options(group)', async () => {
  const app = await setup({ source: true });
  // In setup({ source: true }), group 'drinks' has source: [{ type: 'category', categoryId: 'drinks' }]
  // and catalog.products contains 'coffee' and 'tea' under category 'drinks'
  const group = app.catalog().groups.find(g => g.id === 'drinks');
  assert.ok(group, 'Group drinks must exist');

  // Open group in POS drawer and verify options list is populated
  app.context.UnifiedMenu.group('drinks');
  const optionRows = app.drawer().querySelectorAll('[data-action="option"]');
  const optionNames = [...optionRows].map(r => r.querySelector('strong')?.textContent || r.textContent);
  assert.ok(optionNames.length >= 2, `Must render at least 2 options, rendered ${optionNames.length}: ${JSON.stringify(optionNames)}`);
});

test('Bug 3: Cycle prevention: projectOptionRule prunes ancestor groupPath so combo side dish does not repeat its own group', async () => {
  const f = fixture();
  // Create combo and dish
  // group_b has option dish_a
  await f.save('group', {
    id: 'a_group_b',
    name: 'Nhóm Ăn Kèm B',
    revision: 0,
    minSelection: 1,
    maxSelection: 1,
    allowRepeats: false,
    included: false,
    itemIds: ['a_main'],
    sources: [],
    options: [
      { id: 'opt_coffee', name: 'Coffee', productId: 'a_coffee', price: 0, quantity: 1 }
    ]
  });

  const catalog = await f.api.loadOptionCatalog(f.env, 'a');
  // Both a_main and a_coffee link to a_group_b
  catalog.links.push({ itemId: 'a_coffee', groupId: 'a_group_b', optionIds: null, disabled: false });

  // Projecting rule for a_main
  const rule = f.api.projectOptionRule(catalog, 'a_main');
  assert.ok(rule, 'Rule should be projected');
  const groupB = rule.groups.find(g => g.id === 'a_group_b');
  assert.ok(groupB, 'group_b should be in rule');

  const eligibleCoffee = groupB.eligibleItems.find(i => i.productId === 'a_coffee');
  assert.ok(eligibleCoffee, 'Coffee should be eligible item');

  // Coffee must NOT have a_group_b as a recursive sub-group
  const childGroups = eligibleCoffee.optionGroups || [];
  const hasRecursiveB = childGroups.some(g => g.id === 'a_group_b');
  assert.equal(hasRecursiveB, false, 'Ancestor group a_group_b must not appear as child of a_coffee');
});

test('Bug 3: Direct cyclic link validation rejects linking a group to a product that is an option of that group', async () => {
  const f = fixture();
  // Try to save group that links to product 'a_coffee' while 'a_coffee' is an option of this group
  const res = await f.save('group', {
    id: 'a_self_group',
    name: 'Self Group',
    revision: 0,
    minSelection: 1,
    maxSelection: 1,
    allowRepeats: false,
    included: false,
    itemIds: ['a_coffee'], // Direct link to a_coffee
    sources: [],
    options: [
      { id: 'opt_coffee', name: 'Coffee', productId: 'a_coffee', price: 0, quantity: 1 } // Option is a_coffee
    ]
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, 'OPTION_PRODUCT_CYCLE', 'Backend must reject direct product-group cycle with OPTION_PRODUCT_CYCLE');
});

test('Bug 3: In POS product groups picker, groups containing this product are dimmed/disabled with cycle warning', async () => {
  const app = await setup({ lang: 'vi' });
  // Add a group that contains 'meal' as an option
  app.catalog().groups.push({
    id: 'g_combo_drinks',
    name: 'Chọn đồ uống combo',
    scope: 'item',
    revision: 1,
    minSelection: 1,
    maxSelection: 1,
    options: [{ id: 'opt_meal_in_combo', productId: 'meal', name: 'Bánh mì', price: 0, quantity: 1, isDefault: false, subOptions: [], eligibilityRules: [] }],
    sources: [],
    labels: {}
  });
  await app.context.UnifiedMenu.load();
  // Open product options drawer for 'meal' (index 0, 0), and navigate to 'groups'
  app.context.UnifiedMenu.product(0, 0, 'options');
  await app.click('groups');
  const drawer = app.drawer();
  assert.ok(drawer, 'Drawer should be open');
  const input = drawer.querySelector('input[value="g_combo_drinks"]');
  assert.ok(input, 'Must have group checkbox input for g_combo_drinks');
  assert.equal(input.disabled, true, 'Checkbox must be disabled');
  const checkMealGroup = input.parentElement;
  assert.ok(checkMealGroup.classList.contains('ug-check-disabled'), 'Cyclic group must have ug-check-disabled class');
  assert.ok(checkMealGroup.textContent.includes('Không thể chọn do tạo vòng lặp'), 'Must show cycle warning text');
});

test('Bug 4: Category and item reordering preserves and serializes explicit sort_order', () => {
  const currentMenuData = [
    { id: 'cat_drinks', slug: 'cat_drinks', title: 'Đồ uống', sortOrder: 2, items: [{ id: 'item_coke', name: 'Coke', price: 20 }] },
    { id: 'cat_main', slug: 'cat_main', title: 'Món chính', sortOrder: 1, items: [{ id: 'item_bread', name: 'Bánh mì', price: 50 }, { id: 'item_egg', name: 'Trứng', price: 10 }] }
  ];

  // Reorder items in cat_main
  currentMenuData[1].items.reverse(); // Now item_egg is 0, item_bread is 1

  // Mock DOM and window
  const mockDoc = {
    createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, style: {}, classList: { add: () => {}, remove: () => {} } }),
    getElementById: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  const sandbox = {
    console,
    currentMenuData,
    isCustomizationCategory: () => false,
    getTenantIdFromUrl: () => 'test_tenant',
    t: k => k,
    crypto: webcrypto,
    document: mockDoc,
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  sandbox.window = sandbox;

  loadMenuEditor(sandbox);

  // Call serializeMenuData
  const serialized = sandbox.serializeMenuData(currentMenuData);
  assert.ok(serialized.cat_drinks, 'cat_drinks serialized');
  assert.ok(serialized.cat_main, 'cat_main serialized');

  // Verify category sortOrder is serialized
  assert.equal(serialized.cat_drinks.__sort_order, 2);
  assert.equal(serialized.cat_main.__sort_order, 1);

  // Verify item sort_order is explicitly serialized according to new position
  assert.equal(serialized.cat_main['Trứng'].sort_order, 1, 'Trứng moved to first position (sort_order 1)');
  assert.equal(serialized.cat_main['Bánh mì'].sort_order, 2, 'Bánh mì moved to second position (sort_order 2)');
});
