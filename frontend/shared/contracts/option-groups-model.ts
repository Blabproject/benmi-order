import {
  canonicalMenuSnapshot,
  type MenuCategoryDraft
} from '@shared/contracts/menu-model';
import {
  translatePos,
  type PosLocale,
  type PosTranslationKey
} from '@shared/i18n/pos-dictionary';

export interface MenuI18nLocalePatchDto {
  name?: string;
  badge_text?: string;
  sub_options?: Record<string, string>;
  [key: string]: unknown;
}

export type MenuI18nMapDto = Record<string, MenuI18nLocalePatchDto>;

export interface OptionCatalogProductDto {
  id: string;
  category_id: string;
  name: string;
  price: number;
  sku?: string | null;
  badge_text?: string | null;
  is_recommended?: boolean | number;
  image_key?: string | null;
  is_out_of_stock?: boolean | number;
  out_of_stock_until?: string | null;
  menu_revision?: number;
  i18n?: MenuI18nMapDto;
  [key: string]: unknown;
}

export interface OptionCatalogCategoryDto {
  id: string;
  name: string;
  slug?: string;
  category_type?: string;
  [key: string]: unknown;
}

export interface OptionCatalogSubOptionDto {
  id?: string;
  productId?: string | null;
  name: string;
  price?: number;
  [key: string]: unknown;
}

export interface OptionCatalogEligibilityRuleDto {
  rule_type: string;
  min_order_subtotal?: number;
  error_message?: string;
  threshold_basis?: string;
  [key: string]: unknown;
}

export interface OptionCatalogOptionDto {
  id: string;
  name: string;
  productId?: string | null;
  price: number;
  quantity?: number;
  isDefault?: boolean;
  isOutOfStock?: boolean;
  isLocallyOutOfStock?: boolean;
  outOfStockUntil?: string | null;
  description?: string | null;
  i18n?: MenuI18nMapDto;
  subOptions?: Array<string | OptionCatalogSubOptionDto>;
  eligibilityRules?: OptionCatalogEligibilityRuleDto[];
  fromSource?: boolean;
  retailPrice?: number;
  imageUrl?: string | null;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OptionCatalogSourceDto {
  type: 'category' | 'item_list' | string;
  refId?: string;
  categoryId?: string;
  itemIds?: string[];
}

export interface OptionCatalogGroupDto {
  id: string;
  name: string;
  scope?: 'item' | 'order' | 'category' | string;
  revision?: number;
  sortOrder?: number;
  minSelection: number | string;
  maxSelection: number | string;
  allowRepeats?: boolean;
  included?: boolean;
  autoPopup?: boolean | null;
  i18n?: MenuI18nMapDto;
  options: OptionCatalogOptionDto[];
  sources?: OptionCatalogSourceDto[];
  itemIds?: string[];
  categoryIds?: string[];
  labels?: Record<string, unknown>;
  metadata?: {
    legacySurcharges?: Record<string, number>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface OptionCatalogLinkDto {
  groupId: string;
  itemId?: string;
  optionIds: string[] | null;
  disabled?: boolean;
  sortOrder?: number;
  [key: string]: unknown;
}

export interface OptionCatalogDto {
  products: OptionCatalogProductDto[];
  categories: OptionCatalogCategoryDto[];
  groups: OptionCatalogGroupDto[];
  links: OptionCatalogLinkDto[];
  categoryLinks?: Array<Record<string, unknown>>;
}

export interface ResolvedOptionDto extends OptionCatalogOptionDto {
  retailPrice?: number;
  isOutOfStock: boolean;
}

export interface ProductGroupEntry {
  group: OptionCatalogGroupDto;
  link: OptionCatalogLinkDto;
  inherited: boolean;
}

export interface ProductDraft {
  id: string;
  isNew?: boolean;
  name: string;
  price: number;
  categoryId: string;
  badgeText: string;
  isRecommended: boolean;
  revision: number;
  i18n: MenuI18nMapDto;
  links: OptionCatalogLinkDto[];
  imageKey: string | null;
  imageDraft?: string | null;
  removedPhoto?: boolean;
  prevImageKey?: string | null;
  [key: string]: unknown;
}

export interface OptionGroupDraft extends OptionCatalogGroupDto {
  isNew?: boolean;
  scope: 'item' | 'order';
  itemIds: string[];
  categoryIds: string[];
  sources: OptionCatalogSourceDto[];
  i18n?: MenuI18nMapDto;
}

export interface OptionDrawerViewState {
  scroll?: number;
  details?: string[];
  focus?: string | null;
  search?: string;
  filter?: string;
  openCategories?: string[];
}

export type OptionDrawerRoute =
  | { page: 'new-group-scope'; original?: string; view?: OptionDrawerViewState }
  | { page: 'product'; original?: string; view?: OptionDrawerViewState }
  | { page: 'product-options'; original?: string; view?: OptionDrawerViewState }
  | { page: 'group'; original?: string; view?: OptionDrawerViewState }
  | { page: 'groups'; ids: string[]; original?: string; view?: OptionDrawerViewState }
  | {
      page: 'subset';
      id: string;
      optionIds: string[] | null;
      originalOptionIds?: string[] | null;
      original?: string;
      view?: OptionDrawerViewState;
    }
  | { page: 'add-option'; original?: string; view?: OptionDrawerViewState }
  | { page: 'products'; ids: string[]; original?: string; view?: OptionDrawerViewState }
  | { page: 'linked'; ids: string[]; original?: string; view?: OptionDrawerViewState }
  | { page: 'sub-products'; ids: string[]; original?: string; view?: OptionDrawerViewState }
  | {
      page: 'option';
      option: OptionCatalogOptionDto;
      isNew?: boolean;
      direct?: boolean;
      original?: string;
      view?: OptionDrawerViewState;
    };

export interface OptionDrawerStackEntry {
  route: OptionDrawerRoute;
  scroll: number;
}

export type OptionDrawerConfirmKind = 'discard' | 'delete';
export type OptionSelectionRuleErrors = Partial<Record<'minSelection' | 'maxSelection', string>>;

export interface OptionDrawerState {
  kind: 'product' | 'group';
  draft: ProductDraft | OptionGroupDraft;
  original: string;
  required: boolean;
  ruleErrors: OptionSelectionRuleErrors;
  optionsOnly: boolean;
  stack: OptionDrawerStackEntry[];
  route: OptionDrawerRoute;
  busy: boolean;
  aiBusy?: boolean;
  error: string;
  scroll: number;
  confirm?: OptionDrawerConfirmKind | null;
}

export function cloneValue<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

export function sortedUniqueIds(ids?: readonly string[] | null): string[] {
  return [...new Set(ids || [])].sort();
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const record = v as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(record)
          .sort()
          .map(k => [k, record[k]])
      );
    }
    return v;
  });
}

export function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/đ/g, 'd')
    .trim();
}

export function cleanI18n(raw: unknown): MenuI18nMapDto {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: MenuI18nMapDto = {};
  const record = raw as Record<string, unknown>;
  for (const loc of Object.keys(record).sort()) {
    const patch = record[loc];
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) continue;
    const patchObj = patch as Record<string, unknown>;
    const cleanPatch: MenuI18nLocalePatchDto = {};
    for (const key of Object.keys(patchObj).sort()) {
      const val = patchObj[key];
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed) cleanPatch[key] = trimmed;
      } else if (val && typeof val === 'object' && !Array.isArray(val)) {
        const nestedObj = val as Record<string, unknown>;
        const nested: Record<string, string> = {};
        for (const nk of Object.keys(nestedObj).sort()) {
          const nv = nestedObj[nk];
          if (typeof nv === 'string' && nv.trim()) {
            nested[nk] = nv.trim();
          }
        }
        if (Object.keys(nested).length > 0) {
          cleanPatch[key] = nested;
        }
      }
    }
    if (Object.keys(cleanPatch).length > 0) {
      out[loc] = cleanPatch;
    }
  }
  return out;
}

export function isTimestampActive(until?: string | null, nowMs: number = Date.now()): boolean {
  if (!until) return false;
  const parsed = Date.parse(until);
  return Number.isFinite(parsed) && parsed > nowMs;
}

export function findGroupById(
  catalog: OptionCatalogDto | null,
  id?: string | null
): OptionCatalogGroupDto | undefined {
  if (!catalog || !id) return undefined;
  return catalog.groups.find(g => g.id === id);
}

export function findProductById(
  catalog: OptionCatalogDto | null,
  id?: string | null
): OptionCatalogProductDto | undefined {
  if (!catalog || !id) return undefined;
  return catalog.products.find(p => p.id === id);
}

export function resolveEffectiveOptions(
  group: Pick<OptionCatalogGroupDto, 'id' | 'options' | 'sources' | 'metadata'>,
  catalog: OptionCatalogDto | null,
  nowMs: number = Date.now()
): ResolvedOptionDto[] {
  const result = cloneValue(group.options || []);
  const seen = new Set(result.map(o => o.productId).filter((id): id is string => Boolean(id)));
  const products = catalog?.products || [];

  for (const source of group.sources || []) {
    for (const product of products) {
      const matches =
        source.type === 'category'
          ? product.category_id === (source.refId || source.categoryId)
          : source.type === 'item_list' && Boolean(source.itemIds?.includes(product.id));
      if (!matches || seen.has(product.id)) continue;
      seen.add(product.id);
      result.push({
        id: `source:${group.id}:${product.id}`,
        name: product.name,
        productId: product.id,
        price: Number(group.metadata?.legacySurcharges?.[product.id] || 0),
        quantity: 1,
        isDefault: false,
        isOutOfStock: false,
        outOfStockUntil: null,
        subOptions: [],
        eligibilityRules: [],
        description: null,
        fromSource: true
      });
    }
  }

  return result.map(o => {
    const p = findProductById(catalog, o.productId);
    return {
      ...o,
      name: p?.name || o.name,
      retailPrice: p?.price,
      isOutOfStock:
        Boolean(o.isOutOfStock) ||
        Boolean(o.isLocallyOutOfStock) ||
        isTimestampActive(o.outOfStockUntil, nowMs) ||
        Boolean(p?.is_out_of_stock) ||
        isTimestampActive(p?.out_of_stock_until, nowMs)
    };
  });
}

export function sortProductLinks(
  links: readonly OptionCatalogLinkDto[] | undefined,
  catalog: OptionCatalogDto | null
): OptionCatalogLinkDto[] {
  const groupOrder = (id: string): number => Number(findGroupById(catalog, id)?.sortOrder ?? 0);
  return [...(links || [])].sort(
    (a, b) =>
      Number(Boolean(a.disabled)) - Number(Boolean(b.disabled)) ||
      Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) ||
      groupOrder(a.groupId) - groupOrder(b.groupId)
  );
}

export function resolveProductGroups(
  product: { links?: readonly OptionCatalogLinkDto[] },
  catalog: OptionCatalogDto | null
): ProductGroupEntry[] {
  const direct = sortProductLinks(product.links, catalog);
  return direct
    .filter(l => !l.disabled)
    .map(l => ({
      group: findGroupById(catalog, l.groupId),
      link: l,
      inherited: false
    }))
    .filter((v): v is ProductGroupEntry => Boolean(v.group && v.group.scope !== 'order'));
}

export function computeSelectionRules(
  group: Pick<OptionCatalogGroupDto, 'id' | 'included' | 'minSelection' | 'maxSelection' | 'options' | 'sources' | 'metadata'>,
  catalog: OptionCatalogDto | null,
  nowMs: number = Date.now()
): [number, number] {
  if (!group.included) {
    return [Number(group.minSelection ?? 0), Number(group.maxSelection ?? 1)];
  }
  const count = resolveEffectiveOptions(group, catalog, nowMs).reduce(
    (sum, o) => sum + Number(o.quantity || 1),
    0
  );
  return [count, count];
}

export function isInsufficientLink(
  group: OptionCatalogGroupDto,
  link: Pick<OptionCatalogLinkDto, 'optionIds'>,
  catalog: OptionCatalogDto | null,
  nowMs: number = Date.now()
): boolean {
  const available = resolveEffectiveOptions(group, catalog, nowMs).filter(
    o => !Array.isArray(link.optionIds) || link.optionIds.includes(o.id)
  );
  const count = group.included
    ? available.reduce((n, o) => n + Number(o.quantity || 1), 0)
    : available.length;
  const minSelection = Number(group.minSelection || 0);
  return group.included
    ? count !== minSelection || !count
    : minSelection > 0 && (!count || (!group.allowRepeats && count < minSelection));
}

export function computeAffectedProductIds(
  group: Pick<OptionCatalogGroupDto, 'id' | 'itemIds'>,
  catalog: OptionCatalogDto | null
): string[] {
  const ids =
    group.itemIds ??
    (catalog?.links || [])
      .filter(l => l.groupId === group.id && !l.disabled)
      .map(l => l.itemId)
      .filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}

export function computeSelectionErrors(
  draft: Pick<OptionCatalogGroupDto, 'id' | 'included' | 'minSelection' | 'maxSelection' | 'allowRepeats' | 'options' | 'sources' | 'metadata'>,
  required: boolean,
  catalog: OptionCatalogDto | null,
  locale: PosLocale,
  nowMs: number = Date.now()
): OptionSelectionRuleErrors {
  if (draft.included) return {};
  const errors: OptionSelectionRuleErrors = {};
  const lower = required ? 1 : 0;

  for (const [key, min] of [
    ['minSelection', lower],
    ['maxSelection', 1]
  ] as const) {
    const value = draft[key];
    if (
      value === '' ||
      !Number.isInteger(Number(value)) ||
      Number(value) < min ||
      Number(value) > 999
    ) {
      errors[key] = translatePos(locale, 'ugRuleInteger', { min });
    }
  }

  const optionCount = resolveEffectiveOptions(draft, catalog, nowMs).length;
  const shouldCheckOptionCount =
    optionCount > 0 || required || Number(draft.minSelection) > 0;

  if (!errors.minSelection && !errors.maxSelection) {
    const minVal = Number(draft.minSelection);
    const maxVal = Number(draft.maxSelection);
    if (maxVal < minVal) {
      errors.minSelection = translatePos(locale, 'ugRuleRangeMin');
      if (!draft.allowRepeats && shouldCheckOptionCount && maxVal > optionCount) {
        errors.maxSelection = translatePos(locale, 'ugRuleOptionCountMax', { count: optionCount });
      } else {
        errors.maxSelection = translatePos(locale, 'ugRuleRangeMax');
      }
    } else if (!draft.allowRepeats && shouldCheckOptionCount) {
      if (minVal > optionCount) {
        errors.minSelection = translatePos(locale, 'ugRuleOptionCountMin', { count: optionCount });
      }
      if (maxVal > optionCount) {
        errors.maxSelection = translatePos(locale, 'ugRuleOptionCountMax', { count: optionCount });
      }
    }
  }

  return errors;
}

export function optionValuesSnapshot(o: OptionCatalogOptionDto) {
  return {
    id: o.id,
    productId: o.productId || null,
    name: o.productId ? '' : String(o.name || '').trim(),
    price: Number(o.price || 0),
    quantity: Number(o.quantity ?? 1),
    isDefault: Boolean(o.isDefault),
    isLocallyOutOfStock: Boolean(o.isLocallyOutOfStock),
    outOfStockUntil: o.outOfStockUntil || null,
    description: o.description || '',
    i18n: cleanI18n(o.i18n),
    subOptions: (o.subOptions || []).map(s => {
      if (typeof s === 'string') {
        return {
          name: s.trim(),
          price: 0
        };
      }
      return {
        ...(s.id ? { id: s.id } : {}),
        ...(s.productId ? { productId: s.productId } : {}),
        name: s.productId ? '' : String(s.name || '').trim(),
        price: Number(s.price || 0)
      };
    }),
    eligibilityRules: (o.eligibilityRules || [])
      .map(r =>
        r.rule_type === 'min_order_subtotal'
          ? {
              ...r,
              min_order_subtotal: Number(r.min_order_subtotal || 0),
              error_message: r.error_message || '',
              threshold_basis: r.threshold_basis || 'merchandise_subtotal'
            }
          : r
      )
      .filter(
        r =>
          r.rule_type !== 'min_order_subtotal' ||
          Boolean(r.min_order_subtotal) ||
          Boolean(r.error_message)
      )
  };
}

export function entitySnapshot(
  kind: 'product' | 'group',
  draft: ProductDraft | OptionGroupDraft
): string {
  if (kind === 'product') {
    const d = draft as ProductDraft;
    return stableStringify({
      name: String(d.name || '').trim(),
      price: Number(d.price),
      categoryId: d.categoryId,
      badgeText: d.badgeText || '',
      isRecommended: Boolean(d.isRecommended),
      imageKey: d.imageKey,
      imageDraft: d.imageDraft || null,
      i18n: cleanI18n(d.i18n),
      links: sortProductLinks(d.links, null)
        .filter(l => !l.disabled)
        .map((l, idx) => ({
          groupId: l.groupId,
          order: idx,
          optionIds: l.optionIds === null ? null : sortedUniqueIds(l.optionIds)
        }))
    });
  }
  const g = draft as OptionGroupDraft;
  return stableStringify({
    name: String(g.name || '').trim(),
    scope: g.scope === 'order' ? 'order' : 'item',
    minSelection: g.included ? null : g.minSelection,
    maxSelection: g.included ? null : g.maxSelection,
    allowRepeats: Boolean(g.allowRepeats),
    included: Boolean(g.included),
    autoPopup: g.scope === 'item' ? Boolean(g.included || Number(g.minSelection) > 0) : null,
    i18n: cleanI18n(g.i18n),
    options: (g.options || []).map(optionValuesSnapshot),
    itemIds: sortedUniqueIds(g.itemIds),
    categoryIds: [],
    sources: []
  });
}

export function routeSnapshot(route: OptionDrawerRoute): string {
  if (route.page === 'option') return stableStringify(optionValuesSnapshot(route.option));
  if (route.page === 'subset') {
    return stableStringify(route.optionIds === null ? null : sortedUniqueIds(route.optionIds));
  }
  if ('ids' in route) return stableStringify(sortedUniqueIds(route.ids));
  return '';
}

export function isRouteChanged(route: OptionDrawerRoute): boolean {
  return routeSnapshot(route) !== (route.original ?? '');
}

export function prepareDrawerRoute<T extends OptionDrawerRoute>(route: T): T {
  const prepared: T = {
    ...route,
    original: routeSnapshot(route)
  };
  if (prepared.page === 'subset') {
    prepared.originalOptionIds = cloneValue(prepared.optionIds);
  }
  return prepared;
}

export function hasDrawerChanges(state: OptionDrawerState | null): boolean {
  if (!state) return false;
  if (entitySnapshot(state.kind, state.draft) !== state.original) return true;
  return [state.route, ...state.stack.map(v => v.route)].some(isRouteChanged);
}

function groupNonStockDigest(g: OptionCatalogGroupDto, itemIds: readonly string[]): string {
  const included = Boolean(g.included);
  return stableStringify({
    name: String(g.name || '').trim(),
    scope: g.scope === 'order' ? 'order' : 'item',
    minSelection: included ? null : Number(g.minSelection ?? 0),
    maxSelection: included ? null : Number(g.maxSelection ?? 1),
    allowRepeats: Boolean(g.allowRepeats),
    included,
    autoPopup: g.scope === 'order' ? null : Boolean(included || Number(g.minSelection) > 0),
    i18n: cleanI18n(g.i18n),
    options: (g.options || []).map(o => {
      const val = optionValuesSnapshot(o) as Record<string, unknown>;
      delete val.isLocallyOutOfStock;
      delete val.outOfStockUntil;
      return val;
    }),
    itemIds: sortedUniqueIds(itemIds),
    categoryIds: [],
    sources: []
  });
}

export function extractPureLocalStockChanges(
  draft: OptionGroupDraft,
  catalog: OptionCatalogDto | null
): OptionCatalogOptionDto[] | null {
  const orig = findGroupById(catalog, draft.id);
  if (!orig || orig.sources?.length || draft.sources?.length) return null;
  const origItemIds = (catalog?.links || [])
    .filter(l => l.groupId === draft.id && !l.disabled)
    .map(l => l.itemId)
    .filter((id): id is string => Boolean(id));
  if (groupNonStockDigest(orig, origItemIds) !== groupNonStockDigest(draft, draft.itemIds)) {
    return null;
  }
  const origOpts = orig.options || [];
  const nextOpts = draft.options || [];
  if (origOpts.length !== nextOpts.length) return null;

  const changed: OptionCatalogOptionDto[] = [];
  for (let i = 0; i < origOpts.length; i++) {
    const oldOpt = origOpts[i];
    const newOpt = nextOpts[i];
    if (!oldOpt || !newOpt || oldOpt.id !== newOpt.id || oldOpt.fromSource || newOpt.fromSource) {
      return null;
    }
    const oldOos = Boolean(oldOpt.isLocallyOutOfStock);
    const newOos = Boolean(newOpt.isLocallyOutOfStock);
    if (oldOos !== newOos) {
      changed.push(newOpt);
    } else if ((oldOpt.outOfStockUntil || null) !== (newOpt.outOfStockUntil || null)) {
      return null;
    }
  }
  return changed.length > 0 ? changed : null;
}

export function formatRuleSummary(
  group: OptionCatalogGroupDto,
  catalog: OptionCatalogDto | null,
  locale: PosLocale,
  nowMs: number = Date.now()
): string {
  const [min, max] = computeSelectionRules(group, catalog, nowMs);
  return `${translatePos(locale, 'ugChoose')} ${min === max ? min : `${min}–${max}`}`;
}

export function formatI18nSummary(locales: readonly string[], locale: PosLocale): string {
  const base = translatePos(locale, 'ugI18nSectionBase');
  if (locales.length === 0) return base;
  const labels = locales.map(loc =>
    loc === 'en'
      ? translatePos(locale, 'ugLocaleEn')
      : loc === 'vi'
        ? translatePos(locale, 'ugLocaleVi')
        : loc.toUpperCase()
  );
  const isVi = locale === 'vi';
  const sep = isVi ? ', ' : ' / ';
  return isVi ? `${base} (${labels.join(sep)})` : `${base}（${labels.join(sep)}）`;
}

export function resolveSaveErrorKey(message: string): PosTranslationKey {
  if (message === 'PRODUCT_IS_LINKED') return 'ugInUse';
  if (message.startsWith('INVALID_')) return 'ugInvalid';
  if (message === 'MENU_CONFLICT') return 'ugConflict';
  if (message.includes('CYCLE')) return 'ugCycle';
  if (message.includes('INSUFFICIENT')) return 'ugInsufficient';
  return 'ugError';
}

export interface RebaseMenuInput {
  kind: 'product' | 'group';
  id: string;
  remove: boolean;
  optionsOnly: boolean;
  catalog: OptionCatalogDto;
  currentMenuData: MenuCategoryDraft[];
  savedMenuSnapshot: string;
  serializeCanonical?: (data: MenuCategoryDraft[]) => string;
}

export function rebaseMenuSnapshots({
  kind,
  id,
  remove,
  optionsOnly,
  catalog,
  currentMenuData,
  savedMenuSnapshot,
  serializeCanonical = canonicalMenuSnapshot
}: RebaseMenuInput): { currentMenuData: MenuCategoryDraft[]; savedMenuSnapshot: string } {
  const saved = JSON.parse(savedMenuSnapshot || '[]') as MenuCategoryDraft[];
  for (const data of [currentMenuData, saved]) {
    if (kind === 'product') {
      if (optionsOnly) {
        for (const c of data) {
          const item = c.items?.find(p => p.id === id);
          if (item) item.menuRevision = findProductById(catalog, id)?.menu_revision;
        }
        continue;
      }
      let old: Record<string, unknown> | undefined;
      let oldCategory: MenuCategoryDraft | undefined;
      let oldIndex = -1;
      for (const c of data) {
        const i = c.items?.findIndex(p => p.id === id) ?? -1;
        if (i >= 0) {
          oldCategory = c;
          oldIndex = i;
          old = c.items.splice(i, 1)[0] as unknown as Record<string, unknown>;
          break;
        }
      }
      const p = findProductById(catalog, id);
      if (p && !remove) {
        const c = data.find(cat => (cat.databaseId || cat.catId) === p.category_id);
        c?.items.splice(c === oldCategory ? oldIndex : c.items.length, 0, {
          ...(old || {}),
          id: p.id,
          name: p.name,
          originalName: p.name,
          price: p.price,
          badgeText: p.badge_text || '',
          isRecommended: Boolean(p.is_recommended),
          imageKey: p.image_key || null,
          imageUrl: p.image_key ? (old?.imageUrl as string | null | undefined) : null,
          itemType: 'standard',
          bundleRule: null,
          modifierGroups: [],
          i18n: p.i18n || (old?.i18n as MenuI18nMapDto | undefined) || {},
          menuRevision: p.menu_revision
        });
      }
    } else {
      for (const c of data) {
        if (c.groups) {
          const i = c.groups.findIndex(g => (g.canonicalId || g.id) === id);
          if (i >= 0) {
            if (remove) {
              c.groups.splice(i, 1);
            } else {
              const g = findGroupById(catalog, id);
              if (g) {
                const existing = c.groups[i]!;
                c.groups[i] = {
                  ...existing,
                  title: g.name,
                  options: g.options as unknown as typeof existing.options,
                  minSelection: Number(g.minSelection),
                  maxSelection: Number(g.maxSelection),
                  isRequired: Number(g.minSelection) > 0,
                  i18n: g.i18n || existing.i18n || {}
                };
              }
            }
          }
        }
      }
    }
  }
  return {
    currentMenuData,
    savedMenuSnapshot: serializeCanonical(saved)
  };
}
