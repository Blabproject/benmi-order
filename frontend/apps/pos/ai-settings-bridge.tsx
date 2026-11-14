import { StrictMode, useEffect, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import '@shared/ui/tokens.css';
import './pos-ai-settings.css';
import { resolveWorkerBase } from '@shared/infra/http';
import { translatePos, type PosTranslationKey, type PosLocale } from '@shared/i18n/pos-dictionary';
import {
  createAiSettingsBridgeStore,
  type AiSettingsBridgeSnapshot,
  type AiSettingsBridgeStore,
  type AiSettingsFetchDependencies
} from './ai-settings-store';
import { PosAiSettingsPanel } from './PosAiSettingsPanel';

interface PosAiSettingsBridgeWindow extends Window {
  WORKER_BASE?: string;
  currentLang?: string;
  currentTenantId?: string;
  getTenantIdFromUrl?: () => string;
  updateSettingsPanelHeaderTitle?: () => void;
  applyLanguageToDOM?: ((...args: unknown[]) => unknown) & {
    __benmiAiSettingsWrapped?: boolean;
  };
  posAISettings?: Omit<AiSettingsBridgeSnapshot, 'locale'>;
  loadAISettings?: () => Promise<void>;
  renderAISettings?: () => void;
}

function getPosWindow(): PosAiSettingsBridgeWindow {
  return window as unknown as PosAiSettingsBridgeWindow;
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

function buildFetchDeps(): AiSettingsFetchDependencies {
  return {
    tenantId: readTenantId(),
    workerBase: readWorkerBase(),
    fetcher: window.fetch.bind(window),
    getCurrentTenantId: readTenantId
  };
}

function syncHeaderTitleIfActive(locale: PosLocale = readLocale()): void {
  const tocLabel = document.querySelector<HTMLElement>('#toc-item-ai [data-ai-i18n]');
  if (tocLabel) {
    const key = tocLabel.dataset.aiI18n as PosTranslationKey | undefined;
    if (key) {
      tocLabel.textContent = translatePos(locale, key);
    }
  }
  const card = document.getElementById('setting-card-ai');
  const posWindow = getPosWindow();
  if (card?.classList.contains('active') && typeof posWindow.updateSettingsPanelHeaderTitle === 'function') {
    posWindow.updateSettingsPanelHeaderTitle();
  }
}

function PosAiSettingsWorkspace({ store }: { store: AiSettingsBridgeStore }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    syncHeaderTitleIfActive(snapshot.locale);
  }, [snapshot.locale, snapshot.status, snapshot.values]);

  return (
    <PosAiSettingsPanel
      values={snapshot.values}
      busy={snapshot.busy}
      status={snapshot.status}
      locale={snapshot.locale}
      onToggleSetting={(key, checked) => {
        void store.toggle(buildFetchDeps(), key, checked);
      }}
      onRetry={() => {
        void store.load(buildFetchDeps());
      }}
    />
  );
}

let mountedRoot: Root | null = null;
let isFlushing = false;

function flushBridgeUpdate(fn: () => void): void {
  if (isFlushing) {
    fn();
    return;
  }
  isFlushing = true;
  try {
    flushSync(fn);
  } finally {
    isFlushing = false;
  }
}

/** Mounts the React AI settings panel inside #pos-ai-settings-react-root and registers legacy bridges. */
export function mountPosAiSettingsBridge(
  mountEl: HTMLElement | null = document.getElementById('pos-ai-settings-react-root')
): AiSettingsBridgeStore | null {
  if (!mountEl) return null;

  const store = createAiSettingsBridgeStore({ initialLocale: readLocale() });
  const posWindow = getPosWindow();

  const legacyState: Omit<AiSettingsBridgeSnapshot, 'locale'> = {
    get tenantId() {
      return store.getSnapshot().tenantId;
    },
    get values() {
      return store.getSnapshot().values;
    },
    get busy() {
      return store.getSnapshot().busy;
    },
    get status() {
      return store.getSnapshot().status;
    },
    get request() {
      return store.getSnapshot().request;
    }
  };
  posWindow.posAISettings = legacyState;

  posWindow.loadAISettings = async () => {
    flushBridgeUpdate(() => {
      store.setLocale(readLocale());
    });
    await store.load(buildFetchDeps());
  };

  posWindow.renderAISettings = () => {
    flushBridgeUpdate(() => {
      store.setLocale(readLocale());
      store.triggerRender();
    });
    syncHeaderTitleIfActive();
  };

  const prevApply = posWindow.applyLanguageToDOM;
  if (typeof prevApply === 'function' && !prevApply.__benmiAiSettingsWrapped) {
    const wrappedApply = function patchedApplyLanguageToDOM(this: unknown, ...args: unknown[]) {
      const result = prevApply.apply(this, args);
      flushBridgeUpdate(() => {
        store.setLocale(readLocale());
      });
      syncHeaderTitleIfActive();
      return result;
    } as NonNullable<PosAiSettingsBridgeWindow['applyLanguageToDOM']>;
    wrappedApply.__benmiAiSettingsWrapped = true;
    posWindow.applyLanguageToDOM = wrappedApply;
  }

  mountedRoot = createRoot(mountEl);
  flushBridgeUpdate(() => {
    mountedRoot?.render(
      <StrictMode>
        <PosAiSettingsWorkspace store={store} />
      </StrictMode>
    );
  });

  if (document.getElementById('setting-card-ai')?.classList.contains('active')) {
    void store.load(buildFetchDeps());
  }

  return store;
}

if (typeof document !== 'undefined') {
  if (document.getElementById('pos-ai-settings-react-root')) {
    mountPosAiSettingsBridge();
  } else {
    document.addEventListener('DOMContentLoaded', () => mountPosAiSettingsBridge(), { once: true });
  }
}
