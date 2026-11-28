import type {
  BundleGroupRuleDto,
  BundleRuleDto,
  ItemModifierGroupDraft,
  MenuBootstrapResponseDto,
  MenuCategoryDraft,
  MenuDeletionsDto,
  MenuItemDraft,
  MenuOptionDraft,
  MenuOptionGroupDraft,
  MenuWirePayload,
  ModifierLibraryGroupDto,
  ModifierLibraryResponseDto,
  canonicalMenuSnapshot as canonicalMenuSnapshotFn,
  getMenuDeletions as getMenuDeletionsFn,
  normalizeBootstrapMenuCategories as normalizeBootstrapMenuCategoriesFn,
  serializeMenuData as serializeMenuDataFn
} from '@shared/contracts/menu-model';
import { translatePos, type PosLocale, type PosTranslationKey } from '@shared/i18n/pos-dictionary';

export type {
  BundleGroupRuleDto,
  BundleRuleDto,
  ItemModifierGroupDraft,
  MenuBootstrapResponseDto,
  MenuCategoryDraft,
  MenuDeletionsDto,
  MenuItemDraft,
  MenuOptionDraft,
  MenuOptionGroupDraft,
  MenuWirePayload,
  ModifierLibraryGroupDto,
  ModifierLibraryResponseDto
};

export interface MenuEditorModelApi {
  canonicalMenuSnapshot: typeof canonicalMenuSnapshotFn;
  serializeMenuData: typeof serializeMenuDataFn;
  getMenuDeletions: typeof getMenuDeletionsFn;
  normalizeBootstrapMenuCategories?: typeof normalizeBootstrapMenuCategoriesFn;
}

export interface BundleSourceEntry {
  type: 'category' | 'item_list' | 'items' | string;
  categoryId?: string;
  refId?: string;
  itemIds?: string[];
  [key: string]: unknown;
}

export interface BundleFixedItemEntry {
  itemId: string;
  quantity: number;
  surcharge: number;
}

export interface BundleEligibleItemEntry {
  id?: string;
  itemId?: string;
  name?: string;
  [key: string]: unknown;
}

export interface BundleGroupDraft extends BundleGroupRuleDto {
  id: string;
  type?: 'fixed' | 'choice' | string;
  name?: string;
  label?: string | Record<string, string>;
  minQuantity?: number;
  maxQuantity?: number;
  allowRepeats?: boolean;
  allowRepeat?: boolean;
  sources?: BundleSourceEntry[];
  items?: BundleFixedItemEntry[];
  eligibleItems?: BundleEligibleItemEntry[];
  surcharges?: Record<string, number>;
}

export interface BundleRuleDraft extends BundleRuleDto {
  version?: number;
  groups: BundleGroupDraft[];
}

export interface StoreModifierListItem {
  id: string;
  key?: string;
  databaseId?: string | null;
  title: string;
  type: 'modifier' | 'customization';
  group?: MenuOptionGroupDraft;
  count: number;
  categoryIndex: number;
  groupIndex?: number;
}

export interface HubModalReturnState {
  catId: string;
  itemName: string;
  catIdx: number;
  itemIdx: number;
}

export interface ScheduleCategoryPatch {
  id: string;
  availabilityMode: string;
  shiftIds: string[];
  hideWhenUnavailable?: boolean;
}

export interface ScheduleItemPatch {
  id: string;
  categoryId: string;
  availabilityMode: string;
  shiftIds: string[];
}

export interface ScheduleSavePatch {
  categories: ScheduleCategoryPatch[];
  items: ScheduleItemPatch[];
}

export interface MenuDisplayEntry {
  model: MenuCategoryDraft;
  title: string;
  kind: 'scopeOrder' | 'categoryTypeCatalogBadge';
  isOrderSection: boolean;
  field: 'sortOrder';
  position: number;
  itemsCount: number;
}

export interface DisplayOrderCaptureEntry {
  model: Record<string, unknown>;
  field: string;
  position: number;
  value: unknown;
  hadOrder: boolean;
}

export interface MenuCatalogListsApi {
  clearCategories?: () => void;
  renderCategories?: (host: HTMLElement, props: Record<string, unknown>) => void;
  clearProducts?: () => void;
  renderProducts?: (host: HTMLElement, props: Record<string, unknown>) => void;
}

export interface PosItemDetailFormApi {
  show?: (next: { category: string; name: string; create: boolean; bundle: boolean }) => void;
  setQuickTag?: (value: string) => void;
  refreshLanguage?: () => void;
}

export interface UnifiedMenuApi {
  enabled?: boolean;
  imageKey?: (catId: string, itemName?: string) => string | null;
  groupCount?: (id?: string | null) => number;
  load?: (tenantId?: string, force?: boolean) => Promise<unknown>;
  product?: (catOrId: string | number, modeOrIdx?: string | number, entry?: string) => Promise<void>;
  group?: (groupId?: string | null, action?: string, optionId?: string, defaultScope?: string) => Promise<void>;
  sidebar?: () => boolean;
  workspace?: () => boolean;
}

export interface PosMenuStoreApi {
  syncFromLegacy?: (
    categories: MenuCategoryDraft[] | null,
    meta?: {
      tenantId?: string | null;
      loadedCompletely?: boolean;
      activeCategoryIndex?: number;
      savedSnapshot?: string | null;
      dirty?: boolean;
    }
  ) => void;
}

export interface PosSvgMap {
  plus?: string;
  trash?: string;
  edit?: string;
  folder?: string;
  tag?: string;
  [key: string]: string | undefined;
}

export interface PosMenuWindow extends Window {
  MenuEditorModel?: MenuEditorModelApi;
  MenuCatalogLists?: MenuCatalogListsApi;
  PosItemDetailForm?: PosItemDetailFormApi;
  UnifiedMenu?: UnifiedMenuApi;
  PosMenuStore?: PosMenuStoreApi;
  POS_SVG?: PosSvgMap;
  WORKER_BASE?: string;
  currentLang?: string;
  currentTenantId?: string;
  currentTenantFeatures?: string[];
  currentTenantConfig?: { name?: string; storeName?: string } | null;
  currentTenantBrandName?: string;
  storeBrandName?: string;
  currentStoreStatus?: string;
  storeOperatingShifts?: unknown[];
  currentTenantI18nEnabled?: boolean;
  activeTab?: string;
  currentMenuData?: MenuCategoryDraft[] | null;
  rawMenuData?: unknown;
  activeCategoryIndex?: number;
  activeOptionGroupIndex?: number | null;
  isMenuDirty?: boolean;
  savedMenuSnapshot?: string | null;
  isMenuSaving?: boolean;
  isStockSaving?: boolean;
  isMenuLoadedCompletely?: boolean;
  isMenuLoading?: boolean;
  menuSidebarTab?: 'products' | 'options';
  menuMobileView?: 'master' | 'detail';
  isCategoryManagerOpen?: boolean;
  menuModifierLibrary?: ModifierLibraryGroupDto[];
  _tenantImageList?: Set<string> | null;
  _collapsedCategoryMods?: Set<string>;
  _initializedCategoryMods?: Set<string>;
  _isMenuAiTranslating?: boolean;
  _hubModalReturnState?: HubModalReturnState | null;
  isCustomScopeSectionOpen?: Record<string, boolean>;
  posApiFetch?: typeof fetch;
  getTenantIdFromUrl?: () => string;
  t?: (key: string, params?: Record<string, string | number>) => string;
  escapeHtml?: (str: unknown) => string;
  applyTenantBranding?: (tenant: unknown) => void;
  updateSidebarActive?: (tab: string) => void;
  syncStoreStatusPlacement?: (tab: string) => void;
  updatePosCatalogPriceMap?: (categories: MenuCategoryDraft[] | null) => void;
  isMenuScheduleWorkspaceAvailable?: () => boolean;
  isMenuScheduleFeatureEnabled?: () => boolean;
  isTenantMultilingualEnabled?: () => boolean;
  getTenantAiTargetLocales?: () => string[];
  showToast?: (message: string, type?: string) => void;
  [key: string]: unknown;
}

const DEFAULT_FALLBACK_SVGS: Record<string, string> = {
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
  folder: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
  tag: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>'
};

const registeredDefaults = new Map<string, (...args: never[]) => unknown>();

export function getHost(): PosMenuWindow {
  if (typeof window !== 'undefined') {
    return window as unknown as PosMenuWindow;
  }
  return globalThis as unknown as PosMenuWindow;
}

export function getHostTargets(): PosMenuWindow[] {
  const g = globalThis as unknown as PosMenuWindow;
  if (typeof window !== 'undefined' && (window as unknown) !== globalThis) {
    return [g, window as unknown as PosMenuWindow];
  }
  return [g];
}

export function registerGlobalFunctions(entries: Record<string, (...args: never[]) => unknown>): void {
  const targets = getHostTargets();
  for (const [name, fn] of Object.entries(entries)) {
    registeredDefaults.set(name, fn);
    for (const target of targets) {
      target[name] = fn;
    }
  }
}

export function registerGlobalProperties(descriptors: PropertyDescriptorMap): void {
  for (const target of getHostTargets()) {
    for (const [key, desc] of Object.entries(descriptors)) {
      Object.defineProperty(target, key, { ...desc, configurable: true });
    }
  }
}

/**
 * Invokes an overridable global hook (allows tests/bridges to monkey-patch render or lifecycle callbacks
 * on either `globalThis` or `window`).
 */
export function invokeHook<TResult>(
  name: string,
  fallback: (...args: never[]) => TResult,
  ...args: unknown[]
): TResult {
  const def = registeredDefaults.get(name);
  for (const target of getHostTargets()) {
    const candidate = target[name];
    if (typeof candidate === 'function' && candidate !== def && candidate !== fallback) {
      return (candidate as (...a: unknown[]) => TResult)(...args);
    }
  }
  const target = typeof def === 'function' ? def : fallback;
  return (target as (...a: unknown[]) => TResult)(...args);
}

export function readCurrentLang(): string {
  const g = globalThis as unknown as PosMenuWindow;
  if (typeof g.currentLang === 'string' && g.currentLang) return g.currentLang;
  const w = getHost();
  if (typeof w.currentLang === 'string' && w.currentLang) return w.currentLang;
  return 'zh-TW';
}

export function tr(key: string, params?: Record<string, string | number>): string {
  for (const target of getHostTargets()) {
    if (typeof target.t === 'function') {
      return target.t(key, params);
    }
  }
  const locale: PosLocale = readCurrentLang() === 'vi' ? 'vi' : 'zh-TW';
  return translatePos(locale, key as PosTranslationKey, params);
}

export function esc(value: unknown): string {
  for (const target of getHostTargets()) {
    if (typeof target.escapeHtml === 'function') {
      return target.escapeHtml(value);
    }
  }
  return String(value ?? '').replace(/[&<>"']/g, ch => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return ch;
    }
  });
}

export function posSvg(name: keyof typeof DEFAULT_FALLBACK_SVGS): string {
  for (const target of getHostTargets()) {
    const icon = target.POS_SVG?.[name];
    if (typeof icon === 'string') return icon;
  }
  return DEFAULT_FALLBACK_SVGS[name] ?? '';
}

export function resolveTenantId(): string {
  for (const target of getHostTargets()) {
    if (typeof target.getTenantIdFromUrl === 'function') {
      return String(target.getTenantIdFromUrl() || '');
    }
  }
  if (typeof location !== 'undefined') {
    const params = new URLSearchParams(location.search);
    return (params.get('tenant') || params.get('tenant_id') || 'benmi').trim() || 'benmi';
  }
  return 'benmi';
}

export function resolveWorkerBase(): string {
  for (const target of getHostTargets()) {
    if (typeof target.WORKER_BASE === 'string' && target.WORKER_BASE) {
      return target.WORKER_BASE;
    }
  }
  return '';
}

export function menuApiFetch(url: RequestInfo | URL, options?: RequestInit): Promise<Response> {
  for (const target of getHostTargets()) {
    if (typeof target.posApiFetch === 'function') {
      return target.posApiFetch(url, options);
    }
  }
  return fetch(url, options);
}

export function notifyToast(message: string, type?: string): boolean {
  for (const target of getHostTargets()) {
    if (typeof target.showToast === 'function') {
      target.showToast(message, type);
      return true;
    }
  }
  return false;
}
