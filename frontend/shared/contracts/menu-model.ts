import type { PosLocale } from '@shared/i18n/pos-dictionary';

export interface BundleGroupRuleDto {
  id?: string;
  name?: string;
  label?: string;
  min?: number;
  max?: number;
  allowRepeat?: boolean;
  categoryIds?: string[];
  itemIds?: string[];
  [key: string]: unknown;
}

export interface BundleRuleDto {
  groups?: BundleGroupRuleDto[];
  [key: string]: unknown;
}

export interface MenuSubOptionDto {
  id?: string;
  name?: string;
  price?: number;
  [key: string]: unknown;
}

export interface MenuOptionDraft {
  id?: string;
  name: string;
  title?: string;
  price?: number;
  surcharge?: number;
  isDefault?: boolean;
  is_default?: boolean;
  isOos?: boolean;
  isOutOfStock?: boolean;
  is_out_of_stock?: boolean;
  outOfStockUntil?: string | null;
  out_of_stock_until?: string | null;
  badgeText?: string;
  badge?: string;
  isRecommended?: boolean;
  sub_options?: Array<string | MenuSubOptionDto>;
  subOptions?: Array<string | MenuSubOptionDto>;
  originalName?: string;
  [key: string]: unknown;
}

export interface ItemModifierGroupDraft {
  id?: string;
  groupId?: string;
  group_id?: string;
  name?: string;
  selectionType?: string;
  isRequired?: boolean;
  minSelection?: number;
  maxSelection?: number;
  sortOrder?: number;
  options?: MenuOptionDraft[];
  [key: string]: unknown;
}

export interface MenuOptionGroupDraft {
  id: string;
  key?: string;
  title: string;
  type?: 'radio' | 'checkbox' | string;
  isRequired?: boolean;
  scope?: 'order' | 'category' | 'item' | string;
  appliedCategories?: string[];
  appliedItems?: string[];
  source?: string;
  sourceId?: string;
  canonicalId?: string | null;
  sortOrder?: number;
  minSelection?: number;
  maxSelection?: number;
  options: MenuOptionDraft[];
  [key: string]: unknown;
}

export interface MenuItemDraft {
  id?: string | null;
  name: string;
  price: number | null;
  isOos?: boolean;
  outOfStockUntil?: string | null;
  badgeText?: string;
  isRecommended?: boolean;
  bundleRule?: BundleRuleDto | null;
  itemType?: 'standard' | 'bundle' | string;
  modifierGroups?: ItemModifierGroupDraft[];
  sortOrder?: number;
  sort_order?: number;
  originalName?: string;
  [key: string]: unknown;
}

export interface MenuCategoryDraft {
  id: string;
  databaseId?: string | null;
  catId?: string;
  slug?: string;
  title: string;
  shortName?: string;
  type?: 'catalog' | 'modifier' | 'order_customization' | string;
  allowCustomization?: boolean;
  appliedModifiers?: string[];
  sortOrder?: number;
  groups?: MenuOptionGroupDraft[];
  items: MenuItemDraft[];
  [key: string]: unknown;
}

export interface BootstrapMenuItemDto {
  id?: string | null;
  name: string;
  price: number | null;
  isOutOfStock?: boolean;
  outOfStockUntil?: string | null;
  out_of_stock_until?: string | null;
  badgeText?: string;
  badge?: string;
  isRecommended?: boolean;
  bundleRule?: BundleRuleDto | null;
  itemType?: string;
  modifierGroups?: ItemModifierGroupDraft[];
}

export interface BootstrapMenuCategoryDto {
  id?: string | null;
  slug: string;
  name: string;
  shortName?: string;
  categoryType?: string;
  category_type?: string;
  allowCustomization?: boolean;
  allow_customization?: boolean | number;
  appliedModifiers?: string[];
  modifierGroups?: Array<{ id?: string }>;
  sortOrder?: number;
  sort_order?: number;
  items: BootstrapMenuItemDto[];
}

export interface BootstrapModifierDto {
  id?: string;
  slug: string;
  name: string;
  shortName?: string;
  selectionType?: string;
  isRequired?: boolean;
  scope?: string;
  sortOrder?: number;
  sort_order?: number;
  options?: MenuOptionDraft[];
}

export interface BootstrapCustomizationGroupDto {
  id?: string;
  key?: string;
  title?: string;
  name?: string;
  type?: string;
  isRequired?: boolean;
  scope?: string;
  sortOrder?: number;
  options?: MenuOptionDraft[];
}

export interface BootstrapCategoryModifierLinkDto {
  groupId?: string;
  categoryId?: string;
}

export interface MenuBootstrapResponseDto {
  menuComplete?: boolean;
  catalog?: BootstrapMenuCategoryDto[];
  modifiers?: BootstrapModifierDto[];
  customizations?: BootstrapCustomizationGroupDto[];
  categoryModifierLinks?: BootstrapCategoryModifierLinkDto[];
  customizationCategoryId?: string | null;
  customizationSortOrder?: number;
  unifiedMenu?: unknown;
}

export interface ModifierLibraryGroupDto {
  id: string;
  name?: string;
  canonicalId?: string | null;
  source?: string;
  sourceId?: string;
  scope?: string;
  selectionType?: string;
  isRequired?: boolean;
  minSelection?: number;
  maxSelection?: number;
  sortOrder?: number;
  categoryIds?: string[];
  itemIds?: string[];
  options?: MenuOptionDraft[];
  [key: string]: unknown;
}

export interface ModifierLibraryResponseDto {
  complete?: boolean;
  groups?: ModifierLibraryGroupDto[];
}

export interface NormalizeBootstrapMenuParams {
  bootstrap: MenuBootstrapResponseDto;
  libraryGroups: ModifierLibraryGroupDto[];
  tenantId: string;
  locale: PosLocale;
}

export interface SerializedMenuOptionPayload extends Record<string, unknown> {
  id: string;
  name: string;
  price: number;
  surcharge: number;
  isDefault: boolean;
  is_default: boolean;
  isOutOfStock: boolean;
  is_out_of_stock: boolean;
  isOos: boolean;
  subOptions: Array<string | MenuSubOptionDto>;
  sub_options: Array<string | MenuSubOptionDto>;
}

export interface SerializedMenuGroupPayload {
  id: string;
  source: string | undefined;
  sourceId: string | undefined;
  canonicalId: string | undefined;
  key: string | undefined;
  minSelection: number | undefined;
  maxSelection: number | undefined;
  title: string;
  type: string;
  isRequired: boolean;
  scope: string;
  appliedCategories: string[];
  appliedItems: string[];
  sortOrder: number;
  options: SerializedMenuOptionPayload[];
}

export interface SerializedCustomizationsSectionPayload {
  id: string;
  title: string;
  shortName: string;
  sortOrder: number;
  groups: SerializedMenuGroupPayload[];
}

export interface SerializedMenuItemPayload {
  id: string | null | undefined;
  price: number | null;
  badge_text: string | null;
  is_recommended: number;
  item_type: string;
  sort_order: number;
  modifier_groups?: ItemModifierGroupDraft[];
}

export interface SerializedMenuCategoryPayload {
  __title: string;
  __short_name: string;
  __type: string;
  __allow_customization: number;
  __applied_modifiers: string[];
  __sort_order: number;
  [itemName: string]:
    | string
    | number
    | string[]
    | SerializedMenuItemPayload;
}

export interface MenuDeletionsDto {
  categories: string[];
  items: string[];
  customizations: string[];
}

export interface MenuWirePayload {
  __customizations?: SerializedCustomizationsSectionPayload;
  __delete?: MenuDeletionsDto;
  [categoryId: string]:
    | SerializedMenuCategoryPayload
    | SerializedCustomizationsSectionPayload
    | MenuDeletionsDto
    | undefined;
}

export interface SerializeMenuDependencies {
  getTenantId?: () => string;
  createUuid?: () => string;
  getDuplicateItemMessage?: () => string;
  isCustomizationCategory?: (category: MenuCategoryDraft) => boolean;
  sharedCategories?: MenuCategoryDraft[] | null;
}

export interface GetMenuDeletionsDependencies {
  isCustomizationCategory?: (category: MenuCategoryDraft) => boolean;
}

export function isCustomizationCategory(
  category: MenuCategoryDraft | null | undefined,
  predicate?: (category: MenuCategoryDraft) => boolean
): boolean {
  if (!category) return false;
  return Boolean(
    category.type === 'order_customization' ||
    category.id === 'sec-flavor' ||
    category.slug === 'sec-flavor' ||
    category.type === 'modifier' ||
    (typeof predicate === 'function' && predicate(category))
  );
}

/**
 * Generates a deterministic canonical JSON string representing menu state for dirty checking.
 * Does not mutate inputs.
 */
export function canonicalMenuSnapshot(data: unknown): string {
  if (!data) return '';

  function clean(val: unknown): unknown {
    if (val === null || val === undefined) return null;
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'number') return Number.isNaN(val) ? 0 : val;
    if (typeof val === 'boolean') return val;
    if (Array.isArray(val)) {
      return val.map(clean);
    }
    if (typeof val === 'object') {
      const record = val as Record<string, unknown>;
      const sortedKeys = Object.keys(record).sort();
      const res: Record<string, unknown> = {};
      for (const k of sortedKeys) {
        if (k.startsWith('_')) continue;
        const v = record[k];
        if (
          (k === 'modifierGroups' ||
            k === 'appliedItems' ||
            k === 'appliedCategories' ||
            k === 'sub_options') &&
          (v === undefined || v === null || (Array.isArray(v) && v.length === 0))
        ) {
          res[k] = [];
          continue;
        }
        if (k === 'badgeText') {
          res[k] = v ? String(v).trim() : '';
          continue;
        }
        if (k === 'bundleRule') {
          const rule = v as BundleRuleDto | null | undefined;
          if (!rule || !rule.groups || rule.groups.length === 0) {
            res[k] = null;
            continue;
          }
        }
        res[k] = clean(v);
      }
      return res;
    }
    return val;
  }

  return JSON.stringify(clean(data));
}

function normalizeSerializedOption(option: MenuOptionDraft): SerializedMenuOptionPayload {
  const optPrice = Number(option.price ?? option.surcharge ?? 0);
  const optIsDefault = Boolean(option.isDefault ?? option.is_default);
  const optIsOos = Boolean(option.isOos ?? option.isOutOfStock ?? option.is_out_of_stock);
  const optSubOptions = Array.isArray(option.sub_options)
    ? option.sub_options
    : Array.isArray(option.subOptions)
      ? option.subOptions
      : [];

  return {
    ...option,
    id: option.id || option.name,
    name: option.name,
    price: optPrice,
    surcharge: optPrice,
    isDefault: optIsDefault,
    is_default: optIsDefault,
    isOutOfStock: optIsOos,
    is_out_of_stock: optIsOos,
    isOos: optIsOos,
    subOptions: optSubOptions,
    sub_options: optSubOptions
  };
}

/**
 * Normalizes /api/tenant/bootstrap + /api/menu/modifier-library responses
 * into the sorted MenuCategoryDraft array used by POS Menu Editor & store.
 */
export function normalizeBootstrapMenuCategories(
  params: NormalizeBootstrapMenuParams
): MenuCategoryDraft[] {
  const { bootstrap, libraryGroups, tenantId, locale } = params;
  const isLangVi = locale === 'vi';
  const categories: MenuCategoryDraft[] = [];

  const categoryEditorIds = new Map<string, string>();
  for (const cat of bootstrap.catalog ?? []) {
    if (cat.id) categoryEditorIds.set(String(cat.id), cat.slug);
    if (cat.slug) categoryEditorIds.set(String(cat.slug), cat.slug);
  }
  const normalizeAppliedCategories = (ids: Array<string | undefined>): string[] => [
    ...new Set(ids.map(id => (id ? categoryEditorIds.get(String(id)) : undefined)).filter((v): v is string => Boolean(v)))
  ];

  const isCatalogCustomSection = (cat: BootstrapMenuCategoryDto): boolean =>
    cat.slug === 'sec-flavor' ||
    cat.slug === 'flavor' ||
    cat.categoryType === 'order_customization' ||
    cat.category_type === 'order_customization';

  for (const [cIdx, cat] of (bootstrap.catalog ?? []).entries()) {
    if (isCatalogCustomSection(cat)) continue;
    const allowCustomization =
      cat.allowCustomization !== undefined
        ? cat.allowCustomization
        : cat.allow_customization !== undefined
          ? Boolean(cat.allow_customization)
          : true;

    categories.push({
      id: cat.slug,
      databaseId: cat.id ?? null,
      catId: cat.id || cat.slug,
      title: cat.name,
      shortName: cat.shortName || cat.name,
      type: 'catalog',
      allowCustomization,
      appliedModifiers: cat.appliedModifiers || (allowCustomization === false ? [] : ['*']),
      sortOrder: Number(
        cat.sortOrder !== undefined ? cat.sortOrder : cat.sort_order !== undefined ? cat.sort_order : cIdx + 1
      ),
      items: (cat.items ?? []).map(it => ({
        id: it.id || null,
        name: it.name,
        price: it.price,
        isOos: Boolean(it.isOutOfStock),
        outOfStockUntil: it.outOfStockUntil || it.out_of_stock_until || null,
        badgeText: it.badgeText || it.badge || '',
        isRecommended: Boolean(it.isRecommended),
        bundleRule: it.bundleRule || null,
        itemType: it.itemType || 'standard',
        modifierGroups: Array.isArray(it.modifierGroups) ? it.modifierGroups : [],
        originalName: it.name
      }))
    });
  }

  for (const [mIdx, mod] of (bootstrap.modifiers ?? []).entries()) {
    if (categories.some(c => c.id === mod.slug)) continue;
    const libraryGroup = libraryGroups.find(
      group => group.source === 'modifier_category' && String(group.sourceId) === String(mod.id)
    );
    const modOptions: MenuOptionDraft[] = (mod.options ?? []).map(opt => ({
      id: opt.id,
      name: opt.name,
      price: opt.price !== undefined ? opt.price : 0,
      isOos: Boolean(opt.isOutOfStock || opt.is_out_of_stock),
      outOfStockUntil: opt.outOfStockUntil || opt.out_of_stock_until || null,
      badgeText: opt.badgeText || opt.badge || '',
      isRecommended: Boolean(opt.isRecommended),
      originalName: opt.name
    }));

    const linkedCatIds: string[] = [];
    for (const link of bootstrap.categoryModifierLinks ?? []) {
      if (
        link.categoryId &&
        (link.groupId === mod.id || link.groupId === mod.slug || link.groupId === `mg_${mod.id}`)
      ) {
        linkedCatIds.push(link.categoryId);
      }
    }
    for (const c of bootstrap.catalog ?? []) {
      if (!c.id) continue;
      if (
        Array.isArray(c.appliedModifiers) &&
        (c.appliedModifiers.includes('*') ||
          (mod.id && c.appliedModifiers.includes(mod.id)) ||
          c.appliedModifiers.includes(mod.slug))
      ) {
        if (!linkedCatIds.includes(c.id)) linkedCatIds.push(c.id);
      }
      if (
        Array.isArray(c.modifierGroups) &&
        c.modifierGroups.some(
          g => g.id === mod.id || g.id === mod.slug || g.id === `mg_${mod.id}`
        )
      ) {
        if (!linkedCatIds.includes(c.id)) linkedCatIds.push(c.id);
      }
    }
    const modScope = libraryGroup?.scope || mod.scope || (linkedCatIds.length > 0 ? 'category' : 'item');

    categories.push({
      id: mod.slug,
      databaseId: mod.id ?? null,
      title: mod.name,
      shortName: mod.shortName || mod.name,
      type: 'modifier',
      sortOrder: Number(
        mod.sortOrder !== undefined ? mod.sortOrder : mod.sort_order !== undefined ? mod.sort_order : 100 + mIdx
      ),
      groups: [
        {
          id: libraryGroup?.canonicalId || mod.id || mod.slug,
          key: mod.slug,
          title: mod.name,
          type: mod.selectionType === 'single' ? 'radio' : 'checkbox',
          isRequired: Boolean(mod.isRequired),
          scope: modScope,
          appliedCategories: normalizeAppliedCategories(
            libraryGroup?.categoryIds?.length ? libraryGroup.categoryIds : linkedCatIds
          ),
          appliedItems: Array.isArray(libraryGroup?.itemIds) ? [...libraryGroup.itemIds] : [],
          source: 'modifier_category',
          sourceId: mod.id || mod.slug,
          canonicalId: libraryGroup?.canonicalId || null,
          sortOrder: 0,
          options: modOptions
        }
      ],
      items: modOptions.map(opt => ({
        ...opt,
        price: opt.price ?? 0
      }))
    });
  }

  const hasCustomizations = Array.isArray(bootstrap.customizations) && bootstrap.customizations.length > 0;
  const hasCustomInCatalog = Boolean(
    bootstrap.catalog?.some(
      c =>
        c.slug === 'sec-flavor' ||
        c.categoryType === 'order_customization' ||
        c.category_type === 'order_customization'
    )
  );

  if (hasCustomizations || hasCustomInCatalog) {
    if (!categories.some(c => c.type === 'order_customization' || c.id === 'sec-flavor')) {
      const customGroups: MenuOptionGroupDraft[] = hasCustomizations
        ? (bootstrap.customizations ?? []).map((cust, gIdx) => {
            const custId = cust.id || `custom_${tenantId}_${cust.key || gIdx}`;
            const modGid = `mg_${custId}`;
            const libraryGroup =
              libraryGroups.find(
                group => group.source === 'customization' && String(group.sourceId) === String(cust.id)
              ) || libraryGroups.find(group => String(group.id) === String(custId));

            const linkedCatIds: string[] = [];
            for (const link of bootstrap.categoryModifierLinks ?? []) {
              if (
                link.categoryId &&
                (link.groupId === custId || link.groupId === modGid || (cust.key && link.groupId === cust.key))
              ) {
                linkedCatIds.push(link.categoryId);
              }
            }
            for (const c of bootstrap.catalog ?? []) {
              if (!c.id) continue;
              if (
                Array.isArray(c.modifierGroups) &&
                c.modifierGroups.some(
                  g => g.id === custId || g.id === modGid || (cust.key && g.id === cust.key)
                )
              ) {
                if (!linkedCatIds.includes(c.id)) linkedCatIds.push(c.id);
              }
            }
            const resolvedScope = cust.scope || (linkedCatIds.length > 0 ? 'category' : 'order');
            const matchedSourceGroup = libraryGroups.find(group => group.sourceId === cust.id);

            return {
              minSelection: matchedSourceGroup?.minSelection,
              maxSelection: matchedSourceGroup?.maxSelection,
              id: custId,
              key: cust.key || `custom_${gIdx}`,
              title: cust.title || cust.name || '',
              type: cust.type || 'radio',
              isRequired: Boolean(cust.isRequired),
              scope: resolvedScope,
              appliedCategories: normalizeAppliedCategories(linkedCatIds),
              appliedItems: Array.isArray(libraryGroup?.itemIds) ? [...libraryGroup.itemIds] : [],
              source: 'customization',
              sourceId: cust.id || custId,
              canonicalId: libraryGroup?.canonicalId || null,
              sortOrder: cust.sortOrder !== undefined ? cust.sortOrder : gIdx,
              options: (cust.options ?? []).map(opt => {
                const name = opt.name || opt.title || '';
                const subOptions = Array.isArray(opt.sub_options)
                  ? [...opt.sub_options]
                  : Array.isArray(opt.subOptions)
                    ? [...opt.subOptions]
                    : [];
                return {
                  ...opt,
                  id: opt.id || opt.name || '',
                  name,
                  price: opt.price !== undefined ? opt.price : opt.surcharge !== undefined ? opt.surcharge : 0,
                  isOos: Boolean(opt.isOutOfStock || opt.is_out_of_stock),
                  sub_options: subOptions,
                  originalName: name
                };
              })
            };
          })
        : [];

      categories.push({
        id: 'sec-flavor',
        databaseId: bootstrap.customizationCategoryId || null,
        title: isLangVi ? 'Tùy chọn khẩu vị & biến thể' : '口味與客製化選擇',
        shortName: isLangVi ? 'Khẩu vị' : '口味選擇',
        type: 'order_customization',
        allowCustomization: false,
        appliedModifiers: [],
        sortOrder: Number(bootstrap.customizationSortOrder !== undefined ? bootstrap.customizationSortOrder : 0),
        groups: customGroups,
        items: []
      });
    }
  }

  const canonicalGroups = libraryGroups.filter(group => group.source === 'canonical');
  if (canonicalGroups.length > 0) {
    let section = categories.find(cat => cat.type === 'order_customization');
    if (!section) {
      section = {
        id: 'sec-flavor',
        type: 'order_customization',
        title: isLangVi ? 'Tùy chọn khẩu vị & biến thể' : '口味與客製化選擇',
        groups: [],
        items: [],
        sortOrder: 0
      };
      categories.push(section);
    }
    const groupsList = section.groups ?? (section.groups = []);
    for (const group of canonicalGroups) {
      if (!groupsList.some(g => String(g.id) === String(group.id) || g.key === `canonical_${group.id}`)) {
        groupsList.push({
          ...group,
          key: `canonical_${group.id}`,
          title: group.name || '',
          type: group.selectionType === 'multiple' ? 'checkbox' : 'radio',
          isRequired: Boolean(group.isRequired),
          scope: group.scope || (group.categoryIds?.length || group.itemIds?.length ? 'category' : 'order'),
          appliedCategories: normalizeAppliedCategories(group.categoryIds || []),
          appliedItems: [...(group.itemIds || [])],
          sortOrder: group.sortOrder || 0,
          options: (group.options ?? []).map(option => ({
            ...option,
            id: option.id || option.name,
            name: option.name,
            price: option.price !== undefined ? option.price : 0,
            isOos: Boolean(option.isOutOfStock || option.is_out_of_stock),
            sub_options: Array.isArray(option.sub_options) ? [...option.sub_options] : [],
            originalName: option.name
          }))
        });
      }
    }
  }

  categories.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return categories;
}

/**
 * Serializes in-memory menu category drafts into the wire format expected by the backend.
 * Mutates categories in-place for newly assigned item IDs and scoped option IDs.
 */
export function serializeMenuData(
  categories: MenuCategoryDraft[],
  dependencies: SerializeMenuDependencies = {}
): MenuWirePayload {
  const isCustomCat = (c: MenuCategoryDraft): boolean =>
    isCustomizationCategory(c, dependencies.isCustomizationCategory);
  const output: MenuWirePayload = {};

  const temporaryItemIds = new Map<string, string>();
  for (const cat of categories) {
    if (isCustomCat(cat)) continue;
    const names = new Set<string>();
    for (const item of cat.items ?? []) {
      const name = String(item.name || '').trim();
      if (!name || item.price === null || item.price === undefined) continue;
      if (names.has(name)) {
        throw new Error((dependencies.getDuplicateItemMessage as () => string)());
      }
      names.add(name);
      if (!item.id) {
        const tenantId = (dependencies.getTenantId as () => string)();
        const uuid = (dependencies.createUuid as () => string)();
        item.id = `${tenantId}_item_${uuid}`;
        temporaryItemIds.set(`${cat.id}:${item.name}`, String(item.id));
        temporaryItemIds.set(`${cat.id}:${name}`, String(item.id));
      }
    }
  }

  for (const cat of categories.filter(isCustomCat)) {
    for (const group of cat.groups ?? []) {
      if (Array.isArray(group.appliedItems)) {
        group.appliedItems = [
          ...new Set(group.appliedItems.map(id => temporaryItemIds.get(String(id)) || String(id)))
        ];
      }
    }
  }

  const assignedOptionOwners = new Map<string, string>();
  for (const cat of categories.filter(isCustomCat)) {
    for (const grp of cat.groups ?? []) {
      const stableGid = String(grp.canonicalId || grp.id || '');
      for (const [oIdx, opt] of (grp.options ?? []).entries()) {
        const rawId = String(opt.id || opt.name || `opt_${oIdx}`).trim();
        let uniqueOptId = rawId;
        if (assignedOptionOwners.has(uniqueOptId) && assignedOptionOwners.get(uniqueOptId) !== stableGid) {
          uniqueOptId = `mo_${stableGid}_${rawId}`;
        }
        assignedOptionOwners.set(uniqueOptId, stableGid);
        opt.id = uniqueOptId;
      }
    }
  }

  const customCatsSource = Object.prototype.hasOwnProperty.call(dependencies, 'sharedCategories')
    ? dependencies.sharedCategories === null
      ? []
      : dependencies.sharedCategories ?? []
    : categories;

  const sharedGroups: Array<{ customCat: MenuCategoryDraft; group: MenuOptionGroupDraft }> = [];
  for (const customCat of customCatsSource.filter(isCustomCat)) {
    for (const group of customCat.groups ?? []) {
      sharedGroups.push({ customCat, group });
    }
  }
  const sharedGroupIds = new Set(
    sharedGroups.flatMap(({ group }) => [
      String(group.id),
      String(group.canonicalId || ''),
      group.id && String(group.id).startsWith('mg_') ? String(group.id).slice(3) : `mg_${group.id}`
    ])
  );

  for (const [cIdx, cat] of categories.entries()) {
    const currentOrder = cat.sortOrder !== undefined ? cat.sortOrder : cIdx + 1;
    if (cat.type === 'order_customization' || cat.id === 'sec-flavor') {
      if (cat.groups?.length && !cat.databaseId) {
        const tenantId = (dependencies.getTenantId as () => string)();
        cat.databaseId = `${tenantId}_${cat.id}`;
      }
      output.__customizations = {
        id: cat.databaseId || cat.id,
        title: cat.title,
        shortName: cat.shortName || cat.title,
        sortOrder: currentOrder,
        groups: (cat.groups ?? []).map((grp, gIdx) => ({
          id: grp.id,
          source: grp.source || undefined,
          sourceId: grp.sourceId || undefined,
          canonicalId: grp.canonicalId || undefined,
          key: grp.key,
          minSelection: grp.minSelection,
          maxSelection: grp.maxSelection,
          title: grp.title,
          type: grp.type || 'radio',
          isRequired: Boolean(grp.isRequired),
          scope: grp.scope || 'order',
          appliedCategories: Array.isArray(grp.appliedCategories) ? grp.appliedCategories : [],
          appliedItems: Array.isArray(grp.appliedItems) ? grp.appliedItems : [],
          sortOrder: grp.sortOrder !== undefined ? grp.sortOrder : gIdx + 1,
          options: (grp.options ?? []).map(normalizeSerializedOption)
        }))
      };
      continue;
    }

    const catPayload: SerializedMenuCategoryPayload = {
      __title: cat.title,
      __short_name: cat.shortName || cat.title,
      __type: cat.type || 'catalog',
      __allow_customization: cat.allowCustomization !== false ? 1 : 0,
      __applied_modifiers: cat.appliedModifiers || (cat.allowCustomization === false ? [] : ['*']),
      __sort_order: currentOrder
    };

    for (const [itemIdx, item] of (cat.items ?? []).entries()) {
      const trimmedName = item.name ? item.name.trim() : '';
      if (!trimmedName || item.price === null || item.price === undefined) continue;
      if (Object.prototype.hasOwnProperty.call(catPayload, trimmedName)) {
        throw new Error((dependencies.getDuplicateItemMessage as () => string)());
      }

      const serializedItem: SerializedMenuItemPayload = {
        id: item.id,
        price: item.price,
        badge_text: item.badgeText || null,
        is_recommended: item.isRecommended ? 1 : 0,
        item_type:
          item.itemType ||
          (item.bundleRule && item.bundleRule.groups && item.bundleRule.groups.length > 0
            ? 'bundle'
            : 'standard'),
        sort_order:
          item.sortOrder !== undefined
            ? item.sortOrder
            : item.sort_order !== undefined
              ? item.sort_order
              : itemIdx + 1
      };

      const linkedGroups: ItemModifierGroupDraft[] = (
        Array.isArray(item.modifierGroups) ? item.modifierGroups : []
      )
        .filter(link => !sharedGroupIds.has(String(link.id || link.groupId || link.group_id)))
        .map(link => ({ ...link }));

      const itemKey = String(item.id || `${cat.id}:${item.name}`);
      for (const { group } of sharedGroups) {
        if (!(group.appliedItems ?? []).includes(itemKey)) continue;
        const linkedGroupId = group.canonicalId || group.id;
        if (
          linkedGroups.some(
            link => String(link.id || link.groupId || link.group_id) === String(linkedGroupId)
          )
        ) {
          continue;
        }
        linkedGroups.push({
          id: linkedGroupId,
          name: group.title,
          selectionType: group.type === 'checkbox' ? 'multiple' : 'single',
          isRequired: Boolean(group.isRequired),
          minSelection: group.minSelection,
          maxSelection: group.maxSelection,
          sortOrder: group.sortOrder || 0,
          options: (group.options ?? []).map(normalizeSerializedOption)
        });
      }

      for (const grp of linkedGroups) {
        if (Array.isArray(grp.options)) {
          grp.options = grp.options.map(normalizeSerializedOption);
        }
      }

      if (Array.isArray(item.modifierGroups) || linkedGroups.length > 0) {
        serializedItem.modifier_groups = linkedGroups;
      }
      catPayload[trimmedName] = serializedItem;
    }

    output[cat.id] = catPayload;
  }

  return output;
}

/**
 * Computes deletions against the fully loaded editor snapshot.
 * Does not mutate inputs and fails fast on invalid snapshots.
 */
export function getMenuDeletions(
  before: MenuCategoryDraft[],
  after: MenuCategoryDraft[],
  dependencies: GetMenuDeletionsDependencies = {}
): MenuDeletionsDto {
  if (!Array.isArray(before) || !Array.isArray(after)) {
    throw new TypeError('before and after must be arrays');
  }
  const isCustomCat = (c: MenuCategoryDraft): boolean =>
    isCustomizationCategory(c, dependencies.isCustomizationCategory);

  const remainingCategories = new Set(after.map(cat => cat.id));
  const remainingItems = new Set(after.flatMap(cat => (cat.items ?? []).map(item => item.id)));
  const remainingGroups = new Set(after.flatMap(cat => (cat.groups ?? []).map(group => group.id)));

  return {
    categories: before
      .filter(cat => !isCustomCat(cat) && !remainingCategories.has(cat.id))
      .map(cat => cat.databaseId || cat.id)
      .filter((id): id is string => Boolean(id)),
    items: before
      .filter(cat => remainingCategories.has(cat.id))
      .flatMap(cat =>
        (cat.items ?? [])
          .filter(item => item.id && !remainingItems.has(item.id))
          .map(item => item.id)
      )
      .filter((id): id is string => Boolean(id)),
    customizations: before
      .flatMap(cat =>
        (cat.groups ?? [])
          .filter(group => group.id && !remainingGroups.has(group.id))
          .map(group => group.id)
      )
      .filter((id): id is string => Boolean(id))
  };
}
