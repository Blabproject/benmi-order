import { describe, expect, it } from 'vitest';
import {
  canonicalMenuSnapshot,
  getMenuDeletions,
  normalizeBootstrapMenuCategories,
  serializeMenuData,
  type MenuCategoryDraft
} from './menu-model';

describe('menu-model contracts', () => {
  it('canonicalMenuSnapshot normalizes defaults deterministically without mutating input', () => {
    expect(canonicalMenuSnapshot(null)).toBe('');
    expect(canonicalMenuSnapshot(undefined)).toBe('');

    const raw = {
      _temp: 'ignore_me',
      title: '  Bánh mì  ',
      num: Number.NaN,
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
    const original = structuredClone(raw);
    const snap = canonicalMenuSnapshot(raw);
    expect(raw).toEqual(original);

    const parsed = JSON.parse(snap);
    expect(parsed._temp).toBeUndefined();
    expect(parsed.title).toBe('Bánh mì');
    expect(parsed.num).toBe(0);
    expect(parsed.items[0].badgeText).toBe('Hot');
    expect(parsed.items[0].modifierGroups).toEqual([]);
    expect(parsed.items[0].appliedItems).toEqual([]);
    expect(parsed.items[0].appliedCategories).toEqual([]);
    expect(parsed.items[0].sub_options).toEqual([]);
    expect(parsed.items[0].bundleRule).toBeNull();

    const a = canonicalMenuSnapshot({ z: 1, a: 2, m: { y: 'ok', b: 'yes' } });
    const b = canonicalMenuSnapshot({ a: 2, z: 1, m: { b: 'yes', y: 'ok' } });
    expect(a).toBe(b);
  });

  it('serializeMenuData assigns lazy IDs, scopes colliding options, and preserves modifier_groups semantics', () => {
    let counter = 1;
    const draft: MenuCategoryDraft[] = [
      {
        id: 'cat_food',
        title: 'Món chính',
        type: 'catalog',
        items: [
          { name: 'Phở bò', price: 100, badgeText: 'Hot', isRecommended: true },
          { id: 'item_existing', name: 'Bún chả', price: 95, modifierGroups: [] }
        ]
      },
      {
        id: 'sec-flavor',
        title: 'Tùy chọn',
        type: 'order_customization',
        groups: [
          {
            id: 'grp_sugar',
            title: 'Độ ngọt',
            type: 'radio',
            appliedItems: ['cat_food:Phở bò'],
            options: [{ name: 'Ít', price: 0, is_default: true }]
          },
          {
            id: 'grp_ice',
            title: 'Độ đá',
            type: 'checkbox',
            options: [{ name: 'Ít', price: 5, isOos: true, subOptions: ['Đá bào'] }]
          }
        ],
        items: []
      }
    ];

    const out = serializeMenuData(draft, {
      getTenantId: () => 't1',
      createUuid: () => `uuid_${counter++}`,
      getDuplicateItemMessage: () => 'dup'
    });

    expect(draft[0]?.items[0]?.id).toBe('t1_item_uuid_1');
    expect(draft[1]?.groups?.[0]?.appliedItems).toEqual(['t1_item_uuid_1']);
    expect(out.__customizations?.groups[0]?.options[0]?.id).toBe('Ít');
    expect(out.__customizations?.groups[1]?.options[0]?.id).toBe('mo_grp_ice_Ít');
    expect(out.__customizations?.groups[1]?.options[0]?.isOutOfStock).toBe(true);
    expect(out.__customizations?.groups[1]?.options[0]?.sub_options).toEqual(['Đá bào']);

    const foodPayload = out.cat_food as Record<string, { modifier_groups?: unknown[] }>;
    expect(foodPayload['Phở bò']?.modifier_groups).toHaveLength(1);
    expect(foodPayload['Bún chả']?.modifier_groups).toEqual([]);
  });

  it('serializeMenuData respects sharedCategories null vs omitted and throws lazily on duplicates', () => {
    const base: MenuCategoryDraft[] = [
      { id: 'cat_1', title: 'Drinks', items: [{ id: 'i1', name: 'Tea', price: 35 }] },
      {
        id: 'sec-flavor',
        title: 'Custom',
        type: 'order_customization',
        groups: [{ id: 'g1', title: 'Ice', appliedItems: ['i1'], options: [{ name: 'Less', price: 0 }] }],
        items: []
      }
    ];

    const withoutShared = serializeMenuData(structuredClone(base), {
      getTenantId: () => 't1',
      sharedCategories: null
    });
    const teaNoShared = (withoutShared.cat_1 as Record<string, { modifier_groups?: unknown }>).Tea;
    expect(teaNoShared?.modifier_groups).toBeUndefined();

    const withShared = serializeMenuData(structuredClone(base), {
      getTenantId: () => 't1'
    });
    const teaWithShared = (withShared.cat_1 as Record<string, { modifier_groups?: unknown[] }>).Tea;
    expect(teaWithShared?.modifier_groups).toHaveLength(1);

    let dupCalls = 0;
    expect(() =>
      serializeMenuData(
        [
          {
            id: 'cat_dup',
            title: 'Dup',
            items: [
              { id: '1', name: 'Bánh', price: 20 },
              { id: '2', name: '  Bánh ', price: 25 }
            ]
          }
        ],
        {
          getDuplicateItemMessage: () => {
            dupCalls++;
            return 'Duplicate name!';
          }
        }
      )
    ).toThrow('Duplicate name!');
    expect(dupCalls).toBe(1);
  });

  it('getMenuDeletions fails fast on invalid inputs and computes explicit deletions without mutation', () => {
    expect(() => getMenuDeletions([], null as unknown as MenuCategoryDraft[])).toThrow(TypeError);
    expect(() => getMenuDeletions(null as unknown as MenuCategoryDraft[], [])).toThrow(TypeError);

    const before: MenuCategoryDraft[] = [
      { id: 'cat_del', databaseId: 'db_del', title: 'Old', items: [{ id: 'i_del', name: 'A', price: 10 }] },
      {
        id: 'cat_keep',
        databaseId: 'db_keep',
        title: 'Keep',
        items: [
          { id: 'i_keep', name: 'Keep', price: 20 },
          { id: 'i_remove', name: 'Remove', price: 30 }
        ]
      },
      {
        id: 'sec-flavor',
        title: 'Custom',
        type: 'order_customization',
        groups: [
          { id: 'g_del', title: 'Del', options: [] },
          { id: 'g_keep', title: 'Keep', options: [] }
        ],
        items: []
      }
    ];
    const after: MenuCategoryDraft[] = [
      { id: 'cat_keep', databaseId: 'db_keep', title: 'Keep', items: [{ id: 'i_keep', name: 'Keep', price: 20 }] },
      { id: 'sec-flavor', title: 'Custom', type: 'order_customization', groups: [{ id: 'g_keep', title: 'Keep', options: [] }], items: [] }
    ];

    const beforeSnap = structuredClone(before);
    const afterSnap = structuredClone(after);
    const deletions = getMenuDeletions(before, after);
    expect(before).toEqual(beforeSnap);
    expect(after).toEqual(afterSnap);
    expect(deletions).toEqual({
      categories: ['db_del'],
      items: ['i_remove'],
      customizations: ['g_del']
    });
  });

  it('normalizeBootstrapMenuCategories merges catalog, modifiers, customizations, canonical library groups, and sort order', () => {
    const categories = normalizeBootstrapMenuCategories({
      tenantId: 'benmi',
      locale: 'vi',
      bootstrap: {
        menuComplete: true,
        customizationCategoryId: 'db_sec_flavor',
        customizationSortOrder: 2,
        catalog: [
          {
            id: 'cat_db_1',
            slug: 'drinks',
            name: 'Đồ uống',
            allowCustomization: false,
            appliedModifiers: [],
            sortOrder: 3,
            items: [{ id: 'it_1', name: 'Trà đá', price: 15, isOutOfStock: false }]
          },
          {
            id: 'cat_db_2',
            slug: 'food',
            name: 'Đồ ăn',
            sortOrder: 1,
            items: [{ id: 'it_2', name: 'Bánh mì', price: 50, badge: 'Hot', isRecommended: true }]
          }
        ],
        modifiers: [
          {
            id: 'mod_db_1',
            slug: 'toppings',
            name: 'Topping',
            selectionType: 'multiple',
            sortOrder: 4,
            options: [{ id: 'opt_1', name: 'Trứng', price: 10, is_out_of_stock: true }]
          }
        ],
        customizations: [
          {
            id: 'cust_1',
            key: 'spicy',
            title: 'Độ cay',
            type: 'radio',
            isRequired: true,
            options: [{ name: 'Cay vừa', surcharge: 0 }]
          }
        ],
        categoryModifierLinks: [{ groupId: 'cust_1', categoryId: 'cat_db_2' }]
      },
      libraryGroups: [
        {
          id: 'canon_1',
          name: 'Cỡ phần',
          source: 'canonical',
          selectionType: 'single',
          isRequired: false,
          categoryIds: ['cat_db_2'],
          itemIds: ['it_2'],
          options: [{ id: 'c_opt_1', name: 'Lớn', price: 15 }]
        }
      ]
    });

    expect(categories.map(c => c.id)).toEqual(['food', 'sec-flavor', 'drinks', 'toppings']);
    const foodCat = categories[0];
    expect(foodCat?.allowCustomization).toBe(true);
    expect(foodCat?.items[0]?.badgeText).toBe('Hot');

    const customCat = categories[1];
    expect(customCat?.databaseId).toBe('db_sec_flavor');
    expect(customCat?.groups).toHaveLength(2);
    expect(customCat?.groups?.[0]?.appliedCategories).toEqual(['food']);
    expect(customCat?.groups?.[1]?.appliedItems).toEqual(['it_2']);
  });
});
