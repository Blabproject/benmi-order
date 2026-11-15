import { describe, expect, it } from 'vitest';
import {
  cleanI18n,
  computeAffectedProductIds,
  computeSelectionErrors,
  computeSelectionRules,
  extractPureLocalStockChanges,
  formatI18nSummary,
  formatRuleSummary,
  hasDrawerChanges,
  isInsufficientLink,
  prepareDrawerRoute,
  rebaseMenuSnapshots,
  resolveEffectiveOptions,
  resolveProductGroups,
  resolveSaveErrorKey,
  type OptionCatalogDto,
  type OptionDrawerState,
  type OptionGroupDraft,
} from './option-groups-model';

const SAMPLE_CATALOG: OptionCatalogDto = {
  categories: [
    { id: 'cat_tea', name: 'Trà', slug: 'tea' },
    { id: 'cat_topping', name: 'Topping', slug: 'topping' },
  ],
  products: [
    { id: 'p1', category_id: 'cat_tea', name: 'Trà Sữa', price: 50, menu_revision: 3 },
    { id: 'p2', category_id: 'cat_topping', name: 'Trân Châu', price: 15, is_out_of_stock: 1 },
  ],
  groups: [
    {
      id: 'g_sugar',
      name: 'Độ ngọt',
      scope: 'item',
      sortOrder: 2,
      minSelection: 1,
      maxSelection: 1,
      options: [
        { id: 'o1', name: 'Ít đường', price: 0, isDefault: true },
        { id: 'o2', name: 'Ít đá', price: 0, isLocallyOutOfStock: false },
      ],
    },
    {
      id: 'g_order',
      name: 'Dụng cụ',
      scope: 'order',
      sortOrder: 1,
      minSelection: 0,
      maxSelection: 1,
      options: [{ id: 'o_bag', name: 'Túi', price: 2 }],
    },
    {
      id: 'g_src',
      name: 'Chọn thêm',
      scope: 'item',
      sortOrder: 3,
      minSelection: 0,
      maxSelection: 2,
      options: [],
      sources: [{ type: 'category', refId: 'cat_topping' }],
      metadata: { legacySurcharges: { p2: 10 } },
    },
  ],
  links: [
    { groupId: 'g_sugar', itemId: 'p1', optionIds: null, sortOrder: 1 },
    { groupId: 'g_order', itemId: 'p1', optionIds: null, sortOrder: 0 },
  ],
};

describe('option-groups-model', () => {
  it('resolves effective options including category sources and product stock', () => {
    const srcGroup = SAMPLE_CATALOG.groups[2]!;
    const resolved = resolveEffectiveOptions(srcGroup, SAMPLE_CATALOG);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.productId).toBe('p2');
    expect(resolved[0]?.price).toBe(10);
    expect(resolved[0]?.isOutOfStock).toBe(true);
  });

  it('filters out order-scoped groups in resolveProductGroups and sorts by sortOrder', () => {
    const entries = resolveProductGroups({ links: SAMPLE_CATALOG.links }, SAMPLE_CATALOG);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.group.id).toBe('g_sugar');
  });

  it('computes selection rules and detects rule errors across vi and zh-TW', () => {
    const includedGroup: OptionGroupDraft = {
      id: 'g_inc',
      name: 'Combo',
      scope: 'item',
      included: true,
      minSelection: 0,
      maxSelection: 1,
      options: [
        { id: 'a', name: 'A', price: 0, quantity: 2 },
        { id: 'b', name: 'B', price: 0, quantity: 1 },
      ],
      sources: [],
      itemIds: [],
      categoryIds: [],
    };
    expect(computeSelectionRules(includedGroup, SAMPLE_CATALOG)).toEqual([3, 3]);

    const invalidGroup: OptionGroupDraft = {
      ...includedGroup,
      included: false,
      minSelection: 3,
      maxSelection: 2,
      allowRepeats: false,
    };
    const viErrs = computeSelectionErrors(invalidGroup, true, SAMPLE_CATALOG, 'vi');
    expect(viErrs.minSelection).toBeTruthy();
    expect(viErrs.maxSelection).toBeTruthy();
  });

  it('detects insufficient option subsets when fewer than minSelection remain', () => {
    const g = SAMPLE_CATALOG.groups[0]!;
    expect(isInsufficientLink(g, { optionIds: [] }, SAMPLE_CATALOG)).toBe(true);
    expect(isInsufficientLink(g, { optionIds: ['o1'] }, SAMPLE_CATALOG)).toBe(false);
    expect(computeAffectedProductIds(g, SAMPLE_CATALOG)).toEqual(['p1']);
  });

  it('extracts pure local stock changes only when nothing else changed', () => {
    const draft: OptionGroupDraft = {
      ...SAMPLE_CATALOG.groups[0]!,
      scope: 'item',
      itemIds: ['p1'],
      categoryIds: [],
      sources: [],
      options: [
        { ...SAMPLE_CATALOG.groups[0]!.options[0]! },
        { ...SAMPLE_CATALOG.groups[0]!.options[1]!, isLocallyOutOfStock: true },
      ],
    };
    const stockOnly = extractPureLocalStockChanges(draft, SAMPLE_CATALOG);
    expect(stockOnly).toHaveLength(1);
    expect(stockOnly?.[0]?.id).toBe('o2');

    const renamed = { ...draft, name: 'Khác' };
    expect(extractPureLocalStockChanges(renamed, SAMPLE_CATALOG)).toBeNull();
  });

  it('cleans i18n, formats summaries, maps error keys, and tracks drawer dirty state', () => {
    expect(cleanI18n({ vi: { name: '  Đường  ', empty: '   ' }, en: {} })).toEqual({
      vi: { name: 'Đường' },
    });
    expect(formatRuleSummary(SAMPLE_CATALOG.groups[0]!, SAMPLE_CATALOG, 'vi')).toContain('1');
    expect(formatI18nSummary(['vi', 'en'], 'zh-TW')).toContain('越南文');
    expect(resolveSaveErrorKey('PRODUCT_IS_LINKED')).toBe('ugInUse');
    expect(resolveSaveErrorKey('MENU_CONFLICT')).toBe('ugConflict');
    expect(resolveSaveErrorKey('GRAPH_CYCLE')).toBe('ugCycle');

    const route = prepareDrawerRoute({ page: 'subset', id: 'g_sugar', optionIds: null });
    const state: OptionDrawerState = {
      kind: 'group',
      draft: {
        ...SAMPLE_CATALOG.groups[0]!,
        scope: 'item',
        itemIds: ['p1'],
        categoryIds: [],
        sources: [],
      },
      original: '',
      required: true,
      ruleErrors: {},
      optionsOnly: false,
      stack: [],
      route,
      busy: false,
      error: '',
      scroll: 0,
    };
    expect(hasDrawerChanges(state)).toBe(true);
  });

  it('rebases currentMenuData and savedMenuSnapshot cleanly after product edit', () => {
    const menu = [
      {
        id: 'cat_tea',
        catId: 'cat_tea',
        databaseId: 'cat_tea',
        name: 'Trà',
        items: [{ id: 'p1', name: 'Old', price: 40 }],
      },
    ];
    const res = rebaseMenuSnapshots({
      kind: 'product',
      id: 'p1',
      remove: false,
      optionsOnly: false,
      catalog: SAMPLE_CATALOG,
      currentMenuData: menu as never,
      savedMenuSnapshot: JSON.stringify(menu),
    });
    expect(res.currentMenuData[0]?.items[0]?.name).toBe('Trà Sữa');
    expect(res.currentMenuData[0]?.items[0]?.price).toBe(50);
    expect(JSON.parse(res.savedMenuSnapshot)).toHaveLength(1);
  });
});
