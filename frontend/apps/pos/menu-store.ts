import {
  canonicalMenuSnapshot,
  getMenuDeletions,
  isCustomizationCategory,
  normalizeBootstrapMenuCategories,
  serializeMenuData,
  type MenuBootstrapResponseDto,
  type MenuCategoryDraft,
  type MenuWirePayload,
  type ModifierLibraryGroupDto,
  type ModifierLibraryResponseDto
} from '@shared/contracts/menu-model';
import { translatePos, type PosLocale } from '@shared/i18n/pos-dictionary';

export type MenuSidebarTab = 'products' | 'customizations' | 'options';
export type MenuMobileView = 'master' | 'detail';

export interface PosMenuStoreSnapshot {
  tenantId: string | null;
  locale: PosLocale;
  categories: MenuCategoryDraft[] | null;
  savedSnapshot: string | null;
  dirty: boolean;
  loading: boolean;
  loadedCompletely: boolean;
  saving: boolean;
  stockSaving: boolean;
  activeCategoryIndex: number;
  activeOptionGroupIndex: number;
  sidebarTab: MenuSidebarTab;
  mobileView: MenuMobileView;
  modifierLibrary: ModifierLibraryGroupDto[];
  imageKeys: readonly string[];
  error: string | null;
  request: number;
}

export interface MenuStoreLoadDependencies {
  tenantId: string;
  workerBase: string;
  fetcher: typeof fetch;
  getCurrentTenantId?: () => string;
  onSyncPriceMap?: (categories: MenuCategoryDraft[] | null) => void;
  onLoadUnifiedMenu?: () => Promise<void> | void;
  onSyncImageList?: (keys: readonly string[]) => void;
}

export interface MenuStoreSaveDependencies extends MenuStoreLoadDependencies {
  createUuid?: () => string;
  onInvalidateCustomizationCache?: (tenantId: string) => void;
}

function defaultUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function pickInitialCategoryIndex(
  categories: MenuCategoryDraft[],
  sidebarTab: MenuSidebarTab
): number {
  if (categories.length === 0) return -1;
  if (sidebarTab === 'products') {
    const firstCatalog = categories.findIndex(c => !isCustomizationCategory(c));
    return firstCatalog >= 0 ? firstCatalog : 0;
  }
  let flavorIdx = categories.findIndex(
    c => c.type === 'order_customization' || c.id === 'sec-flavor' || c.slug === 'sec-flavor'
  );
  const flavorCat = flavorIdx >= 0 ? categories[flavorIdx] : undefined;
  if (flavorIdx >= 0 && (!flavorCat?.groups || flavorCat.groups.length === 0)) {
    const modIdx = categories.findIndex(c => c.type === 'modifier');
    if (modIdx >= 0) flavorIdx = modIdx;
  }
  if (flavorIdx < 0) flavorIdx = categories.findIndex(c => isCustomizationCategory(c));
  return flavorIdx >= 0 ? flavorIdx : 0;
}

export interface MenuLoadResult {
  ok: boolean;
  preservedDirtyDraft?: boolean;
  error?: string;
}

export interface MenuSaveResult {
  ok: boolean;
  payload?: MenuWirePayload;
  error?: string;
}

/** Reactive store managing POS Menu Editor draft, snapshot diffing, and load/save lifecycles. */
export function createMenuStore(options: { initialLocale?: PosLocale } = {}) {
  let tenantId: string | null = null;
  let locale: PosLocale = options.initialLocale ?? 'zh-TW';
  let categories: MenuCategoryDraft[] | null = null;
  let savedSnapshot: string | null = null;
  let dirty = false;
  let loading = false;
  let loadedCompletely = false;
  let saving = false;
  let stockSaving = false;
  let activeCategoryIndex = -1;
  let activeOptionGroupIndex = 0;
  let sidebarTab: MenuSidebarTab = 'products';
  let mobileView: MenuMobileView = 'master';
  let modifierLibrary: ModifierLibraryGroupDto[] = [];
  let imageKeys: readonly string[] = [];
  let error: string | null = null;
  let request = 0;

  const listeners = new Set<() => void>();
  let currentSnapshot = buildSnapshot();

  function buildSnapshot(): PosMenuStoreSnapshot {
    return {
      tenantId,
      locale,
      categories,
      savedSnapshot,
      dirty,
      loading,
      loadedCompletely,
      saving,
      stockSaving,
      activeCategoryIndex,
      activeOptionGroupIndex,
      sidebarTab,
      mobileView,
      modifierLibrary,
      imageKeys,
      error,
      request
    };
  }

  function emit(): void {
    currentSnapshot = buildSnapshot();
    for (const listener of listeners) {
      listener();
    }
  }

  function clearDirtyInternal(): void {
    dirty = false;
    savedSnapshot = canonicalMenuSnapshot(categories);
  }

  function recomputeDirtyInternal(): boolean {
    if (saving) return dirty;
    if (!loadedCompletely || !savedSnapshot || !categories) {
      return dirty;
    }
    dirty = canonicalMenuSnapshot(categories) !== savedSnapshot;
    return dirty;
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot(): PosMenuStoreSnapshot {
      return currentSnapshot;
    },

    setLocale(nextLocale: PosLocale): void {
      if (locale === nextLocale) return;
      locale = nextLocale;
      emit();
    },

    setSidebarTab(nextTab: MenuSidebarTab): void {
      if (sidebarTab === nextTab) return;
      sidebarTab = nextTab;
      emit();
    },

    setMobileView(nextView: MenuMobileView): void {
      if (mobileView === nextView) return;
      mobileView = nextView;
      emit();
    },

    setActiveCategoryIndex(nextIndex: number): void {
      if (activeCategoryIndex === nextIndex) return;
      activeCategoryIndex = nextIndex;
      emit();
    },

    setActiveOptionGroupIndex(nextIndex: number): void {
      if (activeOptionGroupIndex === nextIndex) return;
      activeOptionGroupIndex = nextIndex;
      emit();
    },

    setStockSaving(nextStockSaving: boolean): void {
      if (stockSaving === nextStockSaving) return;
      stockSaving = nextStockSaving;
      emit();
    },

    markDirty(): boolean {
      if (savedSnapshot && loadedCompletely && categories) {
        recomputeDirtyInternal();
      } else {
        dirty = true;
      }
      emit();
      return dirty;
    },

    recomputeDirty(): boolean {
      const nextDirty = recomputeDirtyInternal();
      emit();
      return nextDirty;
    },

    clearDirty(): void {
      clearDirtyInternal();
      emit();
    },

    discardDraft(): boolean {
      if (saving || stockSaving) return false;
      recomputeDirtyInternal();
      if (!dirty) return true;
      categories = savedSnapshot ? (JSON.parse(savedSnapshot) as MenuCategoryDraft[]) : null;
      activeCategoryIndex = categories?.length
        ? Math.max(0, Math.min(activeCategoryIndex, categories.length - 1))
        : -1;
      clearDirtyInternal();
      emit();
      return true;
    },

    updateDraft(mutator: (draft: MenuCategoryDraft[]) => void): void {
      if (!categories) return;
      mutator(categories);
      recomputeDirtyInternal();
      emit();
    },

    syncFromLegacy(
      nextCategories: MenuCategoryDraft[] | null,
      meta: {
        tenantId?: string | null;
        loadedCompletely?: boolean;
        activeCategoryIndex?: number;
        savedSnapshot?: string | null;
        dirty?: boolean;
      } = {}
    ): void {
      categories = nextCategories;
      if (meta.tenantId !== undefined) tenantId = meta.tenantId;
      if (meta.loadedCompletely !== undefined) loadedCompletely = meta.loadedCompletely;
      if (meta.activeCategoryIndex !== undefined) activeCategoryIndex = meta.activeCategoryIndex;
      if (meta.savedSnapshot !== undefined) savedSnapshot = meta.savedSnapshot;
      if (meta.dirty !== undefined) {
        dirty = meta.dirty;
      } else {
        recomputeDirtyInternal();
      }
      emit();
    },

    async load(deps: MenuStoreLoadDependencies): Promise<MenuLoadResult> {
      if (loading) return { ok: false };
      const targetTenant = deps.tenantId;
      const seq = ++request;
      tenantId = targetTenant;
      loading = true;
      loadedCompletely = false;
      error = null;
      emit();

      try {
        const ts = Date.now();
        const encodedTenant = encodeURIComponent(targetTenant);
        const [bootstrapRes, libraryRes, imageListRes] = await Promise.all([
          deps.fetcher(`${deps.workerBase}/api/tenant/bootstrap?tenant_id=${encodedTenant}&_t=${ts}`),
          deps.fetcher(`${deps.workerBase}/api/menu/modifier-library?tenant_id=${encodedTenant}&_t=${ts}`),
          deps
            .fetcher(`${deps.workerBase}/api/image_list?tenant_id=${encodedTenant}&_t=${ts}`)
            .catch(() => null)
        ]);

        if (!bootstrapRes.ok) throw new Error('Failed to load bootstrap');
        const data = (await bootstrapRes.json()) as MenuBootstrapResponseDto;
        if (
          data.menuComplete !== true ||
          !Array.isArray(data.catalog) ||
          !Array.isArray(data.modifiers) ||
          (data.customizations !== undefined && !Array.isArray(data.customizations))
        ) {
          throw new Error('Incomplete menu');
        }

        if (!libraryRes.ok) throw new Error('Failed to load modifier library');
        const libraryData = (await libraryRes.json()) as ModifierLibraryResponseDto;
        if (libraryData.complete !== true || !Array.isArray(libraryData.groups)) {
          throw new Error('Incomplete modifier library');
        }

        let nextImages = imageKeys;
        if (imageListRes && imageListRes.ok) {
          try {
            const imgArr = (await imageListRes.json()) as unknown;
            if (Array.isArray(imgArr)) {
              nextImages = imgArr.map(item => String(item));
              deps.onSyncImageList?.(nextImages);
            }
          } catch {
            // Optional image list cache failure should not block menu loading.
          }
        }

        const activeTenant = deps.getCurrentTenantId ? deps.getCurrentTenantId() : targetTenant;
        if (seq !== request || targetTenant !== activeTenant) {
          return { ok: false };
        }

        const normalizedCategories = normalizeBootstrapMenuCategories({
          bootstrap: data,
          libraryGroups: libraryData.groups,
          tenantId: targetTenant,
          locale
        });

        if (data.unifiedMenu && deps.onLoadUnifiedMenu) {
          await deps.onLoadUnifiedMenu();
        }

        if (seq !== request) {
          return { ok: false };
        }

        modifierLibrary = libraryData.groups;
        imageKeys = nextImages;
        categories = normalizedCategories;
        loadedCompletely = true;
        clearDirtyInternal();
        activeCategoryIndex = pickInitialCategoryIndex(normalizedCategories, sidebarTab);
        deps.onSyncPriceMap?.(normalizedCategories);
        emit();
        return { ok: true };
      } catch (err) {
        if (seq !== request) return { ok: false };
        loadedCompletely = false;
        const message = err instanceof Error ? err.message : translatePos(locale, 'menuIncompleteReload');
        error = message;
        if (dirty && categories) {
          emit();
          return { ok: false, preservedDirtyDraft: true, error: message };
        }
        categories = null;
        savedSnapshot = null;
        dirty = false;
        activeCategoryIndex = -1;
        emit();
        return { ok: false, error: message };
      } finally {
        if (seq === request) {
          loading = false;
          emit();
        }
      }
    },

    async save(deps: MenuStoreSaveDependencies): Promise<MenuSaveResult> {
      if (!loadedCompletely) {
        const message = translatePos(locale, 'menuIncompleteReload');
        error = message;
        emit();
        return { ok: false, error: message };
      }
      if (!categories || saving || stockSaving) {
        return { ok: false };
      }

      const targetTenant = deps.getCurrentTenantId ? deps.getCurrentTenantId() : deps.tenantId;
      let payload: MenuWirePayload;
      try {
        payload = serializeMenuData(categories, {
          getTenantId: () => targetTenant,
          createUuid: deps.createUuid ?? defaultUuid,
          sharedCategories: categories,
          isCustomizationCategory: cat => isCustomizationCategory(cat),
          getDuplicateItemMessage: () => translatePos(locale, 'menuDuplicateItem')
        });
        const baseline = JSON.parse(savedSnapshot || '[]') as MenuCategoryDraft[];
        payload.__delete = getMenuDeletions(baseline, categories, {
          isCustomizationCategory: cat => isCustomizationCategory(cat)
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error = message;
        emit();
        return { ok: false, error: message };
      }

      saving = true;
      error = null;
      emit();

      try {
        const res = await deps.fetcher(
          `${deps.workerBase}/api/menu?tenant_id=${encodeURIComponent(targetTenant)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );
        if (!res.ok) {
          const details = (await res.json().catch(() => null)) as
            | { code?: string; error?: string }
            | null;
          const code = details?.code || details?.error || '';
          throw new Error(`API returned ${res.status}${code ? ` (${code})` : ''}`);
        }
        await deps.onLoadUnifiedMenu?.();
        clearDirtyInternal();
        deps.onInvalidateCustomizationCache?.(targetTenant);
        deps.onSyncPriceMap?.(categories);
        emit();
        return { ok: true, payload };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error = message;
        emit();
        return { ok: false, error: message };
      } finally {
        saving = false;
        emit();
      }
    }
  };
}

export type PosMenuStore = ReturnType<typeof createMenuStore>;
