import {
  canonicalMenuSnapshot,
  getMenuDeletions,
  isCustomizationCategory,
  normalizeBootstrapMenuCategories,
  serializeMenuData,
  type MenuCategoryDraft
} from '@shared/contracts/menu-model';
import { resolveWorkerBase } from '@shared/infra/http';
import type { PosLocale } from '@shared/i18n/pos-dictionary';
import {
  createMenuStore,
  type MenuLoadResult,
  type MenuSaveResult,
  type MenuStoreLoadDependencies,
  type MenuStoreSaveDependencies,
  type PosMenuStore
} from './menu-store';

interface PosMenuBridgeWindow extends Window {
  WORKER_BASE?: string;
  currentLang?: string;
  currentTenantId?: string;
  getTenantIdFromUrl?: () => string;
  updatePosCatalogPriceMap?: (categories: MenuCategoryDraft[] | null) => void;
  UnifiedMenu?: {
    enabled?: boolean;
    load?: () => Promise<void> | void;
  };
  _tenantImageList?: Set<string>;
  applyLanguageToDOM?: ((...args: unknown[]) => unknown) & {
    __benmiMenuStoreWrapped?: boolean;
  };
  PosMenuStore?: {
    store: PosMenuStore;
    getSnapshot: PosMenuStore['getSnapshot'];
    subscribe: PosMenuStore['subscribe'];
    load: () => Promise<MenuLoadResult>;
    save: () => Promise<MenuSaveResult>;
    recomputeDirty: () => boolean;
    discardDraft: () => boolean;
    syncFromLegacy: PosMenuStore['syncFromLegacy'];
    model: {
      canonicalMenuSnapshot: typeof canonicalMenuSnapshot;
      normalizeBootstrapMenuCategories: typeof normalizeBootstrapMenuCategories;
      serializeMenuData: typeof serializeMenuData;
      getMenuDeletions: typeof getMenuDeletions;
      isCustomizationCategory: typeof isCustomizationCategory;
    };
  };
}

function getPosWindow(): PosMenuBridgeWindow {
  return window as unknown as PosMenuBridgeWindow;
}

function readLocale(): PosLocale {
  return getPosWindow().currentLang === 'vi' ? 'vi' : 'zh-TW';
}

function readTenantId(): string {
  const posWindow = getPosWindow();
  if (typeof posWindow.getTenantIdFromUrl === 'function') {
    const fromUrl = String(posWindow.getTenantIdFromUrl() || '').trim();
    if (fromUrl) return fromUrl;
  }
  const fromGlobal = typeof posWindow.currentTenantId === 'string' ? posWindow.currentTenantId.trim() : '';
  if (fromGlobal) return fromGlobal;
  const params = new URLSearchParams(window.location.search);
  return (params.get('tenant') || params.get('tenant_id') || 'benmi').trim() || 'benmi';
}

function readWorkerBase(): string {
  const posWindow = getPosWindow();
  if (typeof posWindow.WORKER_BASE === 'string' && posWindow.WORKER_BASE.trim()) {
    return posWindow.WORKER_BASE.trim();
  }
  return resolveWorkerBase(window.location);
}

function buildLoadDeps(): MenuStoreLoadDependencies {
  const posWindow = getPosWindow();
  menuStore.setLocale(readLocale());
  return {
    tenantId: readTenantId(),
    workerBase: readWorkerBase(),
    fetcher: window.fetch.bind(window),
    getCurrentTenantId: readTenantId,
    onSyncPriceMap: categories => {
      posWindow.updatePosCatalogPriceMap?.(categories);
    },
    onLoadUnifiedMenu: async () => {
      if (posWindow.UnifiedMenu?.load) {
        await posWindow.UnifiedMenu.load();
      }
    },
    onSyncImageList: keys => {
      posWindow._tenantImageList = new Set(keys);
    }
  };
}

function buildSaveDeps(): MenuStoreSaveDependencies {
  return {
    ...buildLoadDeps(),
    onInvalidateCustomizationCache: tenantId => {
      try {
        window.localStorage.removeItem(`tenant_customizations_${tenantId}`);
      } catch {
        // Ignore storage restriction errors in embedded webviews.
      }
    }
  };
}

const menuStore = createMenuStore({ initialLocale: readLocale() });

function wrapApplyLanguage(): void {
  const posWindow = getPosWindow();
  const original = posWindow.applyLanguageToDOM;
  if (typeof original === 'function' && !original.__benmiMenuStoreWrapped) {
    const wrapped = function applyLanguageForMenuStore(
      this: unknown,
      ...args: unknown[]
    ): unknown {
      const result = original.apply(this, args);
      menuStore.setLocale(readLocale());
      return result;
    } as typeof original;
    wrapped.__benmiMenuStoreWrapped = true;
    posWindow.applyLanguageToDOM = wrapped;
  }
}

function installPosMenuBridge(): void {
  const posWindow = getPosWindow();
  wrapApplyLanguage();

  posWindow.PosMenuStore = {
    store: menuStore,
    getSnapshot: () => menuStore.getSnapshot(),
    subscribe: listener => menuStore.subscribe(listener),
    load: () => menuStore.load(buildLoadDeps()),
    save: () => menuStore.save(buildSaveDeps()),
    recomputeDirty: () => menuStore.recomputeDirty(),
    discardDraft: () => menuStore.discardDraft(),
    syncFromLegacy: (categories, meta) => menuStore.syncFromLegacy(categories, meta),
    model: {
      canonicalMenuSnapshot,
      normalizeBootstrapMenuCategories,
      serializeMenuData,
      getMenuDeletions,
      isCustomizationCategory
    }
  };
}

installPosMenuBridge();
