const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MenuEditorModel = require('../js/orders-menu-model.js');

test('CommonJS require exports API and leaves host global unchanged', () => {
  assert.equal(typeof MenuEditorModel.canonicalMenuSnapshot, 'function');
  assert.equal(typeof MenuEditorModel.serializeMenuData, 'function');
  assert.equal(typeof MenuEditorModel.getMenuDeletions, 'function');

  // Verify CommonJS does not write to globalThis
  assert.equal(globalThis.MenuEditorModel, undefined, 'globalThis.MenuEditorModel must remain undefined under CommonJS');
});

test('Browser/VM environment attaches MenuEditorModel to root and separate window object', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../js/orders-menu-model.js'), 'utf8');

  // Sandbox with separate window object
  const mockWindow = {};
  const sandbox = {
    window: mockWindow
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  assert.ok(sandbox.MenuEditorModel, 'MenuEditorModel attached to root sandbox');
  assert.equal(sandbox.window.MenuEditorModel, sandbox.MenuEditorModel, 'MenuEditorModel attached to sandbox.window');
  assert.equal(typeof sandbox.MenuEditorModel.canonicalMenuSnapshot, 'function');
  assert.equal(typeof sandbox.MenuEditorModel.serializeMenuData, 'function');
  assert.equal(typeof sandbox.MenuEditorModel.getMenuDeletions, 'function');
});

test('canonicalMenuSnapshot normalizes defaults and does not mutate input', () => {
  assert.equal(MenuEditorModel.canonicalMenuSnapshot(null), '');
  assert.equal(MenuEditorModel.canonicalMenuSnapshot(undefined), '');

  const raw = {
    _temp: 'ignore_me',
    title: '  Bánh mì  ',
    num: NaN,
    items: [
      {
        name: 'Thịt nướng',
        badgeText: '  Hot  ',
        modifierGroups: null,
        appliedItems: undefined,
        appliedCategories: [],
        sub_options: null,
        bundleRule: { groups: [] }
      }
    ]
  };

  const rawClone = structuredClone(raw);
  const snap = MenuEditorModel.canonicalMenuSnapshot(raw);

  // Input must not be mutated
  assert.deepEqual(raw, rawClone);

  const parsed = JSON.parse(snap);
  assert.equal(parsed._temp, undefined, 'Underscore keys omitted');
  assert.equal(parsed.title, 'Bánh mì', 'Strings trimmed');
  assert.equal(parsed.num, 0, 'NaN normalized to 0');
  assert.equal(parsed.items[0].badgeText, 'Hot', 'badgeText trimmed');
  assert.deepEqual(parsed.items[0].modifierGroups, [], 'null modifierGroups -> []');
  assert.deepEqual(parsed.items[0].appliedItems, [], 'undefined appliedItems -> []');
  assert.deepEqual(parsed.items[0].appliedCategories, [], 'empty appliedCategories -> []');
  assert.deepEqual(parsed.items[0].sub_options, [], 'null sub_options -> []');
  assert.equal(parsed.items[0].bundleRule, null, 'empty bundleRule -> null');

  // Object key ordering deterministic
  const a = { z: 1, a: 2, m: { y: 'ok', b: 'yes' } };
  const b = { a: 2, z: 1, m: { b: 'yes', y: 'ok' } };
  assert.equal(MenuEditorModel.canonicalMenuSnapshot(a), MenuEditorModel.canonicalMenuSnapshot(b));
});

test('serializeMenuData does not read ambient global tenant, UUID, or currentMenuData', () => {
  globalThis.getTenantIdFromUrl = () => 'unexpected-global';
  globalThis.currentMenuData = [{ id: 'ambient_flavor', type: 'order_customization', groups: [] }];

  try {
    // 1. Reproduction case: missing getTenantId when new item needs ID must fail, NOT read getTenantIdFromUrl
    assert.throws(() => {
      MenuEditorModel.serializeMenuData(
        [{ id: 'food', title: 'Food', items: [{ name: 'Rice', price: 10 }] }],
        { createUuid: () => 'fixed-uuid' }
      );
    }, TypeError, 'Must fail when getTenantId is needed but missing');

    // 2. Missing createUuid when new item needs ID must fail, NOT read ambient crypto/random
    assert.throws(() => {
      MenuEditorModel.serializeMenuData(
        [{ id: 'food', title: 'Food', items: [{ name: 'Rice', price: 10 }] }],
        { getTenantId: () => 'valid-tenant' }
      );
    }, TypeError, 'Must fail when createUuid is needed but missing');

    // 3. Explicit getTenantId and createUuid are strictly used without touching getTenantIdFromUrl
    const categories = [
      { id: 'food', title: 'Food', items: [{ name: 'Rice', price: 10 }] }
    ];
    const serialized = MenuEditorModel.serializeMenuData(categories, {
      getTenantId: () => 'explicit-tenant',
      createUuid: () => 'explicit-uuid'
    });
    assert.equal(categories[0].items[0].id, 'explicit-tenant_item_explicit-uuid');
    assert.equal(serialized.food['Rice'].id, 'explicit-tenant_item_explicit-uuid');

    // 4. Ambient currentMenuData is not read: when sharedCategories is omitted, default is categories
    assert.equal(serialized.food['Rice'].modifier_groups, undefined);
  } finally {
    delete globalThis.getTenantIdFromUrl;
    delete globalThis.currentMenuData;
  }
});

test('serializeMenuData callbacks are strictly lazy', () => {
  let tenantCalls = 0;
  let uuidCalls = 0;
  let duplicateCalls = 0;

  const categories = [
    {
      id: 'cat_existing',
      title: 'Catalog',
      items: [
        { id: 'existing_item_1', name: 'Item 1', price: 50 },
        { id: 'existing_item_2', name: 'Item 2', price: 60 }
      ]
    }
  ];

  const serialized = MenuEditorModel.serializeMenuData(categories, {
    getTenantId: () => { tenantCalls++; return 't1'; },
    createUuid: () => { uuidCalls++; return 'u1'; },
    getDuplicateItemMessage: () => { duplicateCalls++; return 'dup'; }
  });

  assert.equal(tenantCalls, 0, 'getTenantId must not be called when items already have IDs');
  assert.equal(uuidCalls, 0, 'createUuid must not be called when items already have IDs');
  assert.equal(duplicateCalls, 0, 'getDuplicateItemMessage must not be called when items have distinct names');
  assert.equal(serialized.cat_existing['Item 1'].id, 'existing_item_1');
  assert.equal(serialized.cat_existing['Item 2'].id, 'existing_item_2');
});

test('serializeMenuData duplicate item error calls getDuplicateItemMessage lazily and throws it', () => {
  let duplicateCalls = 0;
  const categories = [
    {
      id: 'cat_dup',
      title: 'Trùng tên',
      items: [
        { id: 'item_1', name: 'Cà phê', price: 30 },
        { id: 'item_2', name: '  Cà phê  ', price: 35 }
      ]
    }
  ];

  assert.throws(() => {
    MenuEditorModel.serializeMenuData(categories, {
      getDuplicateItemMessage: () => {
        duplicateCalls++;
        return 'Tên món đã tồn tại trong danh mục!';
      }
    });
  }, /Tên món đã tồn tại trong danh mục!/);

  assert.equal(duplicateCalls, 1, 'getDuplicateItemMessage called exactly once on duplicate detection');
});

test('serializeMenuData preserves stable IDs across repeat saves and renames; new item reusing name gets new ID', () => {
  let uuidCounter = 100;
  const mockUuidFactory = () => `uuid_${uuidCounter++}`;
  const deps = {
    getTenantId: () => 't1',
    createUuid: mockUuidFactory,
    isCustomizationCategory: c => c.type === 'order_customization'
  };

  const categories = [
    {
      id: 'cat_food',
      title: 'Đồ ăn',
      type: 'catalog',
      items: [
        { name: 'Phở bò', price: 100 }
      ]
    }
  ];

  // First save: allocates ID uuid_100
  MenuEditorModel.serializeMenuData(categories, deps);
  const firstId = categories[0].items[0].id;
  assert.equal(firstId, 't1_item_uuid_100');

  // Repeat save: UUID factory MUST NOT be called, ID stays the same (idempotent)
  MenuEditorModel.serializeMenuData(categories, deps);
  assert.equal(categories[0].items[0].id, firstId);
  assert.equal(uuidCounter, 101, 'UUID factory was not invoked for already assigned item');

  // Renaming item retains stable ID
  categories[0].items[0].name = 'Phở bò tái nạm';
  const serializedRenamed = MenuEditorModel.serializeMenuData(categories, deps);
  assert.equal(categories[0].items[0].id, firstId, 'Renaming item retains its stable ID');
  assert.ok(serializedRenamed.cat_food['Phở bò tái nạm'], 'Renamed key in serialized output');

  // Adding a new item that reuses the previous name 'Phở bò' gets a brand new ID
  categories[0].items.push({ name: 'Phở bò', price: 90 });
  const serializedReused = MenuEditorModel.serializeMenuData(categories, deps);
  const secondId = categories[0].items[1].id;
  assert.equal(secondId, 't1_item_uuid_101', 'New item reusing old name gets distinct ID');
  assert.notEqual(firstId, secondId);
});

test('serializeMenuData isolates same-name options across different groups with scoped IDs and prices', () => {
  const categories = [
    {
      id: 'sec-flavor',
      title: 'Tùy chọn',
      type: 'order_customization',
      groups: [
        {
          id: 'grp_sugar',
          title: 'Độ ngọt',
          options: [
            { name: 'Ít', price: 0 }
          ]
        },
        {
          id: 'grp_ice',
          title: 'Độ đá',
          options: [
            { name: 'Ít', price: 5 }
          ]
        }
      ],
      items: []
    }
  ];

  const serialized = MenuEditorModel.serializeMenuData(categories, {
    getTenantId: () => 't1',
    isCustomizationCategory: c => c.type === 'order_customization'
  });

  const customGroups = serialized.__customizations.groups;
  const sugarOpt = customGroups[0].options[0];
  const iceOpt = customGroups[1].options[0];

  assert.equal(sugarOpt.name, 'Ít');
  assert.equal(sugarOpt.id, 'Ít');
  assert.equal(sugarOpt.price, 0);

  // Second group with colliding name gets scoped ID
  assert.equal(iceOpt.name, 'Ít');
  assert.equal(iceOpt.id, 'mo_grp_ice_Ít');
  assert.equal(iceOpt.price, 5);

  // In-place mutation check
  assert.equal(categories[0].groups[1].options[0].id, 'mo_grp_ice_Ít');

  // Repeat save does not double prefix
  MenuEditorModel.serializeMenuData(categories, {
    getTenantId: () => 't1',
    isCustomizationCategory: c => c.type === 'order_customization'
  });
  assert.equal(categories[0].groups[1].options[0].id, 'mo_grp_ice_Ít');
});

test('serializeMenuData preserves undefined vs empty array modifier_groups semantics', () => {
  const categories = [
    {
      id: 'cat_test',
      title: 'Test',
      items: [
        { name: 'Item Without ModifierGroups', price: 10 },
        { name: 'Item With Empty ModifierGroups', price: 20, modifierGroups: [] },
        { name: 'Item With Populated ModifierGroups', price: 30, modifierGroups: [{ id: 'mg1', name: 'G1', options: [] }] }
      ]
    }
  ];

  let idCounter = 1;
  const serialized = MenuEditorModel.serializeMenuData(categories, {
    getTenantId: () => 't1',
    createUuid: () => `id_${idCounter++}`,
    sharedCategories: null // explicitly no shared groups
  });

  const catOut = serialized.cat_test;
  assert.equal(catOut['Item Without ModifierGroups'].modifier_groups, undefined, 'undefined modifierGroups not included');
  assert.deepEqual(catOut['Item With Empty ModifierGroups'].modifier_groups, [], 'empty modifierGroups preserved as []');
  assert.equal(catOut['Item With Populated ModifierGroups'].modifier_groups.length, 1, 'populated modifierGroups included');
});

test('serializeMenuData handles option flags: min/max, isDefault, isOutOfStock, and sub_options', () => {
  const categories = [
    {
      id: 'sec-flavor',
      title: 'Tùy chọn',
      type: 'order_customization',
      groups: [
        {
          id: 'grp_multi',
          title: 'Topping',
          type: 'checkbox',
          minSelection: 1,
          maxSelection: 3,
          isRequired: true,
          options: [
            { name: 'Trân châu', surcharge: 10, is_default: true, isOutOfStock: false, sub_options: ['Đen', 'Trắng'] },
            { name: 'Thạch dừa', price: 15, isDefault: false, isOos: true, subOptions: [] }
          ]
        }
      ],
      items: []
    }
  ];

  const serialized = MenuEditorModel.serializeMenuData(categories, {
    getTenantId: () => 't1',
    isCustomizationCategory: c => c.type === 'order_customization'
  });

  const grp = serialized.__customizations.groups[0];
  assert.equal(grp.minSelection, 1);
  assert.equal(grp.maxSelection, 3);
  assert.equal(grp.isRequired, true);
  assert.equal(grp.type, 'checkbox');

  const opt1 = grp.options[0];
  assert.equal(opt1.price, 10);
  assert.equal(opt1.surcharge, 10);
  assert.equal(opt1.isDefault, true);
  assert.equal(opt1.is_default, true);
  assert.equal(opt1.isOutOfStock, false);
  assert.equal(opt1.is_out_of_stock, false);
  assert.deepEqual(opt1.sub_options, ['Đen', 'Trắng']);

  const opt2 = grp.options[1];
  assert.equal(opt2.price, 15);
  assert.equal(opt2.isDefault, false);
  assert.equal(opt2.isOutOfStock, true);
  assert.equal(opt2.is_out_of_stock, true);
  assert.equal(opt2.isOos, true);
  assert.deepEqual(opt2.sub_options, []);
});

test('serializeMenuData respects sharedCategories: null vs omitted vs array distinction', () => {
  const categories = [
    {
      id: 'cat_drinks',
      title: 'Đồ uống',
      items: [
        { id: 'item_tea', name: 'Trà sen', price: 40 }
      ]
    },
    {
      id: 'sec-flavor',
      title: 'Custom',
      type: 'order_customization',
      groups: [
        {
          id: 'grp_sugar',
          title: 'Đường',
          type: 'radio',
          appliedItems: ['item_tea'],
          options: [{ name: '50%', price: 0 }]
        }
      ],
      items: []
    }
  ];

  // Case 1: sharedCategories is null -> NO shared groups are linked into item
  const serializedNull = MenuEditorModel.serializeMenuData(categories, {
    getTenantId: () => 't1',
    sharedCategories: null,
    isCustomizationCategory: c => c.type === 'order_customization'
  });
  assert.equal(serializedNull.cat_drinks['Trà sen'].modifier_groups, undefined);

  // Case 2: sharedCategories omitted -> defaults to categories
  const serializedOmitted = MenuEditorModel.serializeMenuData(categories, {
    getTenantId: () => 't1',
    isCustomizationCategory: c => c.type === 'order_customization'
  });
  assert.ok(serializedOmitted.cat_drinks['Trà sen'].modifier_groups);
  assert.equal(serializedOmitted.cat_drinks['Trà sen'].modifier_groups.length, 1);
  assert.equal(serializedOmitted.cat_drinks['Trà sen'].modifier_groups[0].name, 'Đường');

  // Case 3: sharedCategories provided explicitly as array -> groups linked
  const serializedLinked = MenuEditorModel.serializeMenuData(categories, {
    getTenantId: () => 't1',
    sharedCategories: categories,
    isCustomizationCategory: c => c.type === 'order_customization'
  });
  assert.ok(serializedLinked.cat_drinks['Trà sen'].modifier_groups);
  assert.equal(serializedLinked.cat_drinks['Trà sen'].modifier_groups.length, 1);
});

test('getMenuDeletions fails fast on null or invalid before/after snapshot', () => {
  const validSnapshot = [
    { id: 'food', databaseId: 'db_food', items: [{ id: 'item-1' }] }
  ];

  // Reproduction case: invalid after must throw, NEVER return { categories: ['db_food'] }
  assert.throws(() => {
    MenuEditorModel.getMenuDeletions(validSnapshot, null);
  }, TypeError);

  assert.throws(() => {
    MenuEditorModel.getMenuDeletions(validSnapshot, undefined);
  }, TypeError);

  // Invalid before must also throw
  assert.throws(() => {
    MenuEditorModel.getMenuDeletions(null, validSnapshot);
  }, TypeError);

  // Normal valid empty arrays return empty deletion structure without throwing
  const emptyDeletions = MenuEditorModel.getMenuDeletions([], []);
  assert.deepEqual(emptyDeletions, { categories: [], items: [], customizations: [] });
});

test('getMenuDeletions computes explicit deletions accurately and does not mutate inputs', () => {
  const before = [
    {
      id: 'cat_delete',
      databaseId: 't1_cat_delete',
      title: 'Xóa danh mục',
      items: [{ id: 'item_del_1', name: 'Món 1' }]
    },
    {
      id: 'cat_keep',
      databaseId: 't1_cat_keep',
      title: 'Giữ lại',
      items: [
        { id: 'item_keep', name: 'Món giữ' },
        { id: 'item_del_2', name: 'Món xóa' }
      ]
    },
    {
      id: 'sec-flavor',
      type: 'order_customization',
      groups: [
        { id: 'grp_del', title: 'Nhóm xóa' },
        { id: 'grp_keep', title: 'Nhóm giữ' }
      ],
      items: []
    }
  ];

  const after = [
    {
      id: 'cat_keep',
      databaseId: 't1_cat_keep',
      title: 'Giữ lại',
      items: [
        { id: 'item_keep', name: 'Món giữ' }
      ]
    },
    {
      id: 'sec-flavor',
      type: 'order_customization',
      groups: [
        { id: 'grp_keep', title: 'Nhóm giữ' }
      ],
      items: []
    }
  ];

  const beforeClone = structuredClone(before);
  const afterClone = structuredClone(after);

  const deletions = MenuEditorModel.getMenuDeletions(before, after, {
    isCustomizationCategory: c => c.type === 'order_customization'
  });

  // Neither before nor after mutated
  assert.deepEqual(before, beforeClone);
  assert.deepEqual(after, afterClone);

  assert.deepEqual(deletions.categories, ['t1_cat_delete']);
  assert.deepEqual(deletions.items, ['item_del_2']);
  assert.deepEqual(deletions.customizations, ['grp_del']);
});
