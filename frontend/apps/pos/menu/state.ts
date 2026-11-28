import {
  getHost,
  getHostTargets,
  registerGlobalProperties,
  resolveTenantId,
  type BundleRuleDraft,
  type DisplayOrderCaptureEntry,
  type HubModalReturnState,
  type ItemModifierGroupDraft,
  type MenuCategoryDraft,
  type MenuItemDraft,
  type ModifierLibraryGroupDto
} from './types';

export interface BundleEditingTargetState {
  catIndex: number;
  itemIndex: number;
  item: MenuItemDraft;
}

export interface BundleWizardProduct {
  id: string | null;
  categoryId: string;
  name: string;
  price: number;
}

export interface BundleWizardState {
  product: BundleWizardProduct;
  config: BundleRuleDraft;
  step: number;
  changed: boolean;
  returnFocus: Element | null;
  renderedStep?: number;
  imageDataUri?: string;
  search?: Record<number, string>;
  filters?: Record<number, string>;
  preview?: Record<string, string[]>;
}

function readInitialSidebarTab(): 'products' | 'options' {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const saved = sessionStorage.getItem('pos_menu_subtab');
      if (saved === 'products' || saved === 'options') {
        return saved;
      }
    }
  } catch {
    // Ignore storage errors in sandboxed/private contexts.
  }
  return 'products';
}

export interface PosMenuRuntimeState {
  currentMenuData: MenuCategoryDraft[] | null;
  rawMenuData: unknown;
  activeCategoryIndex: number;
  isMenuDirty: boolean;
  savedMenuSnapshot: string | null;
  isMenuSaving: boolean;
  isStockSaving: boolean;
  isMenuLoadedCompletely: boolean;
  isMenuLoading: boolean;
  menuLoadPromise: Promise<void> | null;
  isCustomGroupCreatorOpen: boolean;
  newCustomGroupType: 'radio' | 'checkbox';
  newCustomGroupRequired: boolean;
  newCustomGroupScope: 'order' | 'category' | 'item';
  newCustomGroupAppliedCategories: string[];
  currentLibraryOptionGroups: unknown[];
  menuModifierLibrary: ModifierLibraryGroupDto[];
  menuMobileView: 'master' | 'detail';
  draggedCategoryIndex: number | null;
  isCategoryManagerOpen: boolean;
  categoryBeforeDisplayOrder: number;
  displayOrderCategory: MenuCategoryDraft | null;
  displayOrderInitial: DisplayOrderCaptureEntry[];
  displayOrderInitialSnapshot: string | null;
  displayOrderGroupInitial: DisplayOrderCaptureEntry[];
  collapsedMenuSections: Record<'catalog' | 'custom', boolean>;
  menuSidebarTab: 'products' | 'options';
  activeOptionGroupIndex: number | null;
  menuOptionSectionsOpen: Record<'order' | 'item', boolean>;
  menuItemFilterQuery: string;
  menuItemFilterStatus: 'all' | 'instock' | 'oos';
  currentImageItemName: string | null;
  currentStockCidx: number | null;
  currentStockIidx: number | null;
  currentStockGidx: number | null;
  currentStockOidx: number | null;
  stockReturnFocus: HTMLElement | Element | null;
  stockReturnFocusId: string | null;
  stockBodyOverflow: string;
  bundleEditingTarget: BundleEditingTargetState | null;
  bundleDraftRule: BundleRuleDraft | null;
  bundleActiveGroupIndex: number;
  bundleSourceTab: 'category' | 'items';
  comboWizard: BundleWizardState | null;
  currentItemModifiersCidx: number | null;
  currentItemModifiersIidx: number | null;
  tempItemModifierGroups: ItemModifierGroupDraft[];
  itemModifierFilterMode: 'all' | 'selected';
  itemModifiersSnapshotBeforeEdit: ItemModifierGroupDraft[] | null;
  itemCustomizationCategoriesSnapshotBeforeEdit: MenuCategoryDraft[] | null;
  activeItemDetailCatIdx: number | null;
  activeItemDetailItemIdx: number | null;
  currentDetailImageKey: string | null;
  isItemDetailCreateMode: boolean;
  itemDetailSession: number;
  itemDetailImageRequest: number;
  itemDetailSnapshotBeforeEdit: MenuItemDraft | null;
  collapsedCategoryMods: Set<string>;
  initializedCategoryMods: Set<string>;
  tenantImageList: Set<string> | null;
  isMenuAiTranslating: boolean;
  hubModalReturnState: HubModalReturnState | null;
  isCustomScopeSectionOpen: Record<string, boolean>;
}

export const menuState: PosMenuRuntimeState = {
  currentMenuData: null,
  rawMenuData: null,
  activeCategoryIndex: -1,
  isMenuDirty: false,
  savedMenuSnapshot: null,
  isMenuSaving: false,
  isStockSaving: false,
  isMenuLoadedCompletely: false,
  isMenuLoading: false,
  menuLoadPromise: null,
  isCustomGroupCreatorOpen: false,
  newCustomGroupType: 'radio',
  newCustomGroupRequired: false,
  newCustomGroupScope: 'order',
  newCustomGroupAppliedCategories: [],
  currentLibraryOptionGroups: [],
  menuModifierLibrary: [],
  menuMobileView: 'master',
  draggedCategoryIndex: null,
  isCategoryManagerOpen: false,
  categoryBeforeDisplayOrder: -1,
  displayOrderCategory: null,
  displayOrderInitial: [],
  displayOrderInitialSnapshot: null,
  displayOrderGroupInitial: [],
  collapsedMenuSections: { catalog: false, custom: false },
  menuSidebarTab: readInitialSidebarTab(),
  activeOptionGroupIndex: null,
  menuOptionSectionsOpen: { order: true, item: true },
  menuItemFilterQuery: '',
  menuItemFilterStatus: 'all',
  currentImageItemName: null,
  currentStockCidx: null,
  currentStockIidx: null,
  currentStockGidx: null,
  currentStockOidx: null,
  stockReturnFocus: null,
  stockReturnFocusId: null,
  stockBodyOverflow: '',
  bundleEditingTarget: null,
  bundleDraftRule: null,
  bundleActiveGroupIndex: 0,
  bundleSourceTab: 'category',
  comboWizard: null,
  currentItemModifiersCidx: null,
  currentItemModifiersIidx: null,
  tempItemModifierGroups: [],
  itemModifierFilterMode: 'all',
  itemModifiersSnapshotBeforeEdit: null,
  itemCustomizationCategoriesSnapshotBeforeEdit: null,
  activeItemDetailCatIdx: null,
  activeItemDetailItemIdx: null,
  currentDetailImageKey: null,
  isItemDetailCreateMode: false,
  itemDetailSession: 0,
  itemDetailImageRequest: 0,
  itemDetailSnapshotBeforeEdit: null,
  collapsedCategoryMods: new Set<string>(),
  initializedCategoryMods: new Set<string>(),
  tenantImageList: null,
  isMenuAiTranslating: false,
  hubModalReturnState: null,
  isCustomScopeSectionOpen: {}
};

export function syncPosMenuStore(): void {
  const host = getHost();
  host.PosMenuStore?.syncFromLegacy?.(menuState.currentMenuData, {
    tenantId: resolveTenantId(),
    loadedCompletely: menuState.isMenuLoadedCompletely,
    activeCategoryIndex: menuState.activeCategoryIndex,
    savedSnapshot: menuState.savedMenuSnapshot,
    dirty: menuState.isMenuDirty
  });
}

export function installMenuStateAccessors(): void {
  // Preserve any pre-populated globals from sandbox or pre-script setup.
  for (const target of getHostTargets()) {
    if (Array.isArray(target.currentMenuData) && menuState.currentMenuData === null) {
      menuState.currentMenuData = target.currentMenuData;
    }
    if (typeof target.activeCategoryIndex === 'number' && menuState.activeCategoryIndex === -1) {
      menuState.activeCategoryIndex = target.activeCategoryIndex;
    }
    if (typeof target.isMenuLoadedCompletely === 'boolean' && target.isMenuLoadedCompletely) {
      menuState.isMenuLoadedCompletely = true;
    }
    if (typeof target.savedMenuSnapshot === 'string' && menuState.savedMenuSnapshot === null) {
      menuState.savedMenuSnapshot = target.savedMenuSnapshot;
    }
    if (target._collapsedCategoryMods instanceof Set) {
      menuState.collapsedCategoryMods = target._collapsedCategoryMods;
    }
    if (target._initializedCategoryMods instanceof Set) {
      menuState.initializedCategoryMods = target._initializedCategoryMods;
    }
    if (target._tenantImageList instanceof Set) {
      menuState.tenantImageList = target._tenantImageList;
    }
  }

  registerGlobalProperties({
    currentMenuData: {
      get: () => menuState.currentMenuData,
      set: (value: MenuCategoryDraft[] | null) => {
        menuState.currentMenuData = value;
      }
    },
    rawMenuData: {
      get: () => menuState.rawMenuData,
      set: (value: unknown) => {
        menuState.rawMenuData = value;
      }
    },
    activeCategoryIndex: {
      get: () => menuState.activeCategoryIndex,
      set: (value: number) => {
        menuState.activeCategoryIndex = value;
      }
    },
    activeOptionGroupIndex: {
      get: () => menuState.activeOptionGroupIndex,
      set: (value: number | null) => {
        menuState.activeOptionGroupIndex = value;
      }
    },
    isMenuDirty: {
      get: () => menuState.isMenuDirty,
      set: (value: boolean) => {
        menuState.isMenuDirty = Boolean(value);
      }
    },
    savedMenuSnapshot: {
      get: () => menuState.savedMenuSnapshot,
      set: (value: string | null) => {
        menuState.savedMenuSnapshot = value;
      }
    },
    isMenuSaving: {
      get: () => menuState.isMenuSaving,
      set: (value: boolean) => {
        menuState.isMenuSaving = Boolean(value);
      }
    },
    isStockSaving: {
      get: () => menuState.isStockSaving,
      set: (value: boolean) => {
        menuState.isStockSaving = Boolean(value);
      }
    },
    isMenuLoadedCompletely: {
      get: () => menuState.isMenuLoadedCompletely,
      set: (value: boolean) => {
        menuState.isMenuLoadedCompletely = Boolean(value);
      }
    },
    isMenuLoading: {
      get: () => menuState.isMenuLoading,
      set: (value: boolean) => {
        menuState.isMenuLoading = Boolean(value);
      }
    },
    menuSidebarTab: {
      get: () => menuState.menuSidebarTab,
      set: (value: 'products' | 'options') => {
        menuState.menuSidebarTab = value === 'options' ? 'options' : 'products';
      }
    },
    menuMobileView: {
      get: () => menuState.menuMobileView,
      set: (value: 'master' | 'detail') => {
        menuState.menuMobileView = value === 'detail' ? 'detail' : 'master';
      }
    },
    isCategoryManagerOpen: {
      get: () => menuState.isCategoryManagerOpen,
      set: (value: boolean) => {
        menuState.isCategoryManagerOpen = Boolean(value);
      }
    },
    menuModifierLibrary: {
      get: () => menuState.menuModifierLibrary,
      set: (value: ModifierLibraryGroupDto[]) => {
        menuState.menuModifierLibrary = Array.isArray(value) ? value : [];
      }
    },
    _collapsedCategoryMods: {
      get: () => menuState.collapsedCategoryMods,
      set: (value: Set<string>) => {
        menuState.collapsedCategoryMods = value;
      }
    },
    _initializedCategoryMods: {
      get: () => menuState.initializedCategoryMods,
      set: (value: Set<string>) => {
        menuState.initializedCategoryMods = value;
      }
    },
    _tenantImageList: {
      get: () => menuState.tenantImageList,
      set: (value: Set<string> | null) => {
        menuState.tenantImageList = value;
      }
    },
    _isMenuAiTranslating: {
      get: () => menuState.isMenuAiTranslating,
      set: (value: boolean) => {
        menuState.isMenuAiTranslating = Boolean(value);
      }
    },
    _hubModalReturnState: {
      get: () => menuState.hubModalReturnState,
      set: (value: HubModalReturnState | null) => {
        menuState.hubModalReturnState = value;
      }
    },
    isCustomScopeSectionOpen: {
      get: () => menuState.isCustomScopeSectionOpen,
      set: (value: Record<string, boolean>) => {
        menuState.isCustomScopeSectionOpen = value || {};
      }
    },
    menuLoadPromise: {
      get: () => menuState.menuLoadPromise,
      set: (value: Promise<void> | null) => {
        menuState.menuLoadPromise = value;
      }
    },
    isCustomGroupCreatorOpen: {
      get: () => menuState.isCustomGroupCreatorOpen,
      set: (value: boolean) => {
        menuState.isCustomGroupCreatorOpen = Boolean(value);
      }
    },
    newCustomGroupType: {
      get: () => menuState.newCustomGroupType,
      set: (value: 'radio' | 'checkbox') => {
        menuState.newCustomGroupType = value === 'checkbox' ? 'checkbox' : 'radio';
      }
    },
    newCustomGroupRequired: {
      get: () => menuState.newCustomGroupRequired,
      set: (value: boolean) => {
        menuState.newCustomGroupRequired = Boolean(value);
      }
    },
    newCustomGroupScope: {
      get: () => menuState.newCustomGroupScope,
      set: (value: 'order' | 'category' | 'item') => {
        menuState.newCustomGroupScope = value === 'category' || value === 'item' ? value : 'order';
      }
    },
    newCustomGroupAppliedCategories: {
      get: () => menuState.newCustomGroupAppliedCategories,
      set: (value: string[]) => {
        menuState.newCustomGroupAppliedCategories = Array.isArray(value) ? value : [];
      }
    },
    currentLibraryOptionGroups: {
      get: () => menuState.currentLibraryOptionGroups,
      set: (value: unknown[]) => {
        menuState.currentLibraryOptionGroups = Array.isArray(value) ? value : [];
      }
    },
    draggedCategoryIndex: {
      get: () => menuState.draggedCategoryIndex,
      set: (value: number | null) => {
        menuState.draggedCategoryIndex = value;
      }
    },
    categoryBeforeDisplayOrder: {
      get: () => menuState.categoryBeforeDisplayOrder,
      set: (value: number) => {
        menuState.categoryBeforeDisplayOrder = value;
      }
    },
    displayOrderCategory: {
      get: () => menuState.displayOrderCategory,
      set: (value: MenuCategoryDraft | null) => {
        menuState.displayOrderCategory = value;
      }
    },
    displayOrderInitial: {
      get: () => menuState.displayOrderInitial,
      set: (value: DisplayOrderCaptureEntry[]) => {
        menuState.displayOrderInitial = Array.isArray(value) ? value : [];
      }
    },
    displayOrderInitialSnapshot: {
      get: () => menuState.displayOrderInitialSnapshot,
      set: (value: string | null) => {
        menuState.displayOrderInitialSnapshot = value;
      }
    },
    displayOrderGroupInitial: {
      get: () => menuState.displayOrderGroupInitial,
      set: (value: DisplayOrderCaptureEntry[]) => {
        menuState.displayOrderGroupInitial = Array.isArray(value) ? value : [];
      }
    },
    collapsedMenuSections: {
      get: () => menuState.collapsedMenuSections,
      set: (value: Record<'catalog' | 'custom', boolean>) => {
        menuState.collapsedMenuSections = value || { catalog: false, custom: false };
      }
    },
    menuOptionSectionsOpen: {
      get: () => menuState.menuOptionSectionsOpen,
      set: (value: Record<'order' | 'item', boolean>) => {
        menuState.menuOptionSectionsOpen = value || { order: true, item: true };
      }
    },
    menuItemFilterQuery: {
      get: () => menuState.menuItemFilterQuery,
      set: (value: string) => {
        menuState.menuItemFilterQuery = String(value ?? '');
      }
    },
    menuItemFilterStatus: {
      get: () => menuState.menuItemFilterStatus,
      set: (value: 'all' | 'instock' | 'oos') => {
        menuState.menuItemFilterStatus = value === 'instock' || value === 'oos' ? value : 'all';
      }
    },
    currentImageItemName: {
      get: () => menuState.currentImageItemName,
      set: (value: string | null) => {
        menuState.currentImageItemName = value;
      }
    },
    currentStockCidx: {
      get: () => menuState.currentStockCidx,
      set: (value: number | null) => {
        menuState.currentStockCidx = value;
      }
    },
    currentStockIidx: {
      get: () => menuState.currentStockIidx,
      set: (value: number | null) => {
        menuState.currentStockIidx = value;
      }
    },
    currentStockGidx: {
      get: () => menuState.currentStockGidx,
      set: (value: number | null) => {
        menuState.currentStockGidx = value;
      }
    },
    currentStockOidx: {
      get: () => menuState.currentStockOidx,
      set: (value: number | null) => {
        menuState.currentStockOidx = value;
      }
    },
    stockReturnFocus: {
      get: () => menuState.stockReturnFocus,
      set: (value: HTMLElement | Element | null) => {
        menuState.stockReturnFocus = value;
      }
    },
    stockReturnFocusId: {
      get: () => menuState.stockReturnFocusId,
      set: (value: string | null) => {
        menuState.stockReturnFocusId = value;
      }
    },
    stockBodyOverflow: {
      get: () => menuState.stockBodyOverflow,
      set: (value: string) => {
        menuState.stockBodyOverflow = String(value ?? '');
      }
    },
    bundleEditingTarget: {
      get: () => menuState.bundleEditingTarget,
      set: (value: BundleEditingTargetState | null) => {
        menuState.bundleEditingTarget = value;
      }
    },
    bundleDraftRule: {
      get: () => menuState.bundleDraftRule,
      set: (value: BundleRuleDraft | null) => {
        menuState.bundleDraftRule = value;
      }
    },
    bundleActiveGroupIndex: {
      get: () => menuState.bundleActiveGroupIndex,
      set: (value: number) => {
        menuState.bundleActiveGroupIndex = value;
      }
    },
    bundleSourceTab: {
      get: () => menuState.bundleSourceTab,
      set: (value: 'category' | 'items') => {
        menuState.bundleSourceTab = value === 'items' ? 'items' : 'category';
      }
    },
    comboWizard: {
      get: () => menuState.comboWizard,
      set: (value: BundleWizardState | null) => {
        menuState.comboWizard = value;
      }
    },
    currentItemModifiersCidx: {
      get: () => menuState.currentItemModifiersCidx,
      set: (value: number | null) => {
        menuState.currentItemModifiersCidx = value;
      }
    },
    currentItemModifiersIidx: {
      get: () => menuState.currentItemModifiersIidx,
      set: (value: number | null) => {
        menuState.currentItemModifiersIidx = value;
      }
    },
    tempItemModifierGroups: {
      get: () => menuState.tempItemModifierGroups,
      set: (value: ItemModifierGroupDraft[]) => {
        menuState.tempItemModifierGroups = Array.isArray(value) ? value : [];
      }
    },
    itemModifierFilterMode: {
      get: () => menuState.itemModifierFilterMode,
      set: (value: 'all' | 'selected') => {
        menuState.itemModifierFilterMode = value === 'selected' ? 'selected' : 'all';
      }
    },
    itemModifiersSnapshotBeforeEdit: {
      get: () => menuState.itemModifiersSnapshotBeforeEdit,
      set: (value: ItemModifierGroupDraft[] | null) => {
        menuState.itemModifiersSnapshotBeforeEdit = value;
      }
    },
    itemCustomizationCategoriesSnapshotBeforeEdit: {
      get: () => menuState.itemCustomizationCategoriesSnapshotBeforeEdit,
      set: (value: MenuCategoryDraft[] | null) => {
        menuState.itemCustomizationCategoriesSnapshotBeforeEdit = value;
      }
    },
    activeItemDetailCatIdx: {
      get: () => menuState.activeItemDetailCatIdx,
      set: (value: number | null) => {
        menuState.activeItemDetailCatIdx = value;
      }
    },
    activeItemDetailItemIdx: {
      get: () => menuState.activeItemDetailItemIdx,
      set: (value: number | null) => {
        menuState.activeItemDetailItemIdx = value;
      }
    },
    currentDetailImageKey: {
      get: () => menuState.currentDetailImageKey,
      set: (value: string | null) => {
        menuState.currentDetailImageKey = value;
      }
    },
    isItemDetailCreateMode: {
      get: () => menuState.isItemDetailCreateMode,
      set: (value: boolean) => {
        menuState.isItemDetailCreateMode = Boolean(value);
      }
    },
    itemDetailSession: {
      get: () => menuState.itemDetailSession,
      set: (value: number) => {
        menuState.itemDetailSession = value;
      }
    },
    itemDetailImageRequest: {
      get: () => menuState.itemDetailImageRequest,
      set: (value: number) => {
        menuState.itemDetailImageRequest = value;
      }
    },
    itemDetailSnapshotBeforeEdit: {
      get: () => menuState.itemDetailSnapshotBeforeEdit,
      set: (value: MenuItemDraft | null) => {
        menuState.itemDetailSnapshotBeforeEdit = value;
      }
    }
  });
}
