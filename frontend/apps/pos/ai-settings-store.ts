import type { AiSettingKey, AiSettingsDto, SaveAiSettingsResponseDto } from '@shared/contracts/api';
import type { PosLocale } from '@shared/i18n/pos-dictionary';

export type AiSettingsStatusKey =
  | 'aiLoading'
  | 'aiAutoSave'
  | 'aiSaving'
  | 'aiSaved'
  | 'aiLoadError'
  | 'aiSaveError';

export interface AiSettingsBridgeSnapshot {
  tenantId: string | null;
  values: AiSettingsDto | null;
  busy: boolean;
  status: AiSettingsStatusKey;
  request: number;
  locale: PosLocale;
}

export interface AiSettingsFetchDependencies {
  tenantId: string;
  workerBase: string;
  fetcher: typeof fetch;
  getCurrentTenantId?: () => string;
}

/** Reactive store backing the POS AI conversation settings card and legacy window bridge. */
export function createAiSettingsBridgeStore(options: { initialLocale?: PosLocale } = {}) {
  let tenantId: string | null = null;
  let values: AiSettingsDto | null = null;
  let busy = false;
  let status: AiSettingsStatusKey = 'aiLoading';
  let request = 0;
  let locale: PosLocale = options.initialLocale ?? 'zh-TW';

  const listeners = new Set<() => void>();
  let currentSnapshot = buildSnapshot();

  function buildSnapshot(): AiSettingsBridgeSnapshot {
    return {
      tenantId,
      values,
      busy,
      status,
      request,
      locale
    };
  }

  function emit(): void {
    currentSnapshot = buildSnapshot();
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot(): AiSettingsBridgeSnapshot {
      return currentSnapshot;
    },

    setLocale(nextLocale: PosLocale): void {
      if (locale === nextLocale) return;
      locale = nextLocale;
      emit();
    },

    triggerRender(): void {
      emit();
    },

    async load(deps: AiSettingsFetchDependencies): Promise<void> {
      if (busy) return;
      const targetTenant = deps.tenantId;
      const seq = ++request;
      tenantId = targetTenant;
      values = null;
      busy = true;
      status = 'aiLoading';
      emit();

      try {
        const response = await deps.fetcher(
          `${deps.workerBase}/api/config?tenant_id=${encodeURIComponent(targetTenant)}`,
          { cache: 'no-store' }
        );
        if (!response.ok) throw new Error('AI settings load failed');
        const data = (await response.json()) as { aiSettings?: AiSettingsDto };
        if (!data.aiSettings || typeof data.aiSettings.enabled !== 'boolean') {
          throw new Error('AI settings unavailable');
        }
        const activeTenant = deps.getCurrentTenantId ? deps.getCurrentTenantId() : targetTenant;
        if (seq !== request || targetTenant !== activeTenant) return;
        values = data.aiSettings;
        status = 'aiAutoSave';
      } catch {
        if (seq === request) status = 'aiLoadError';
      } finally {
        if (seq === request) {
          busy = false;
          emit();
        }
      }
    },

    async toggle(deps: AiSettingsFetchDependencies, key: AiSettingKey, checked: boolean): Promise<void> {
      const currentTenant = deps.getCurrentTenantId ? deps.getCurrentTenantId() : deps.tenantId;
      if (busy || !values || tenantId !== currentTenant) return;

      const before = values;
      const patch: Partial<AiSettingsDto> = { [key]: checked };
      values = { ...before, ...patch };
      busy = true;
      status = 'aiSaving';
      emit();

      try {
        const response = await deps.fetcher(
          `${deps.workerBase}/api/config?tenant_id=${encodeURIComponent(tenantId)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aiSettings: patch })
          }
        );
        if (!response.ok) throw new Error('AI settings save failed');
        const data = (await response.json()) as SaveAiSettingsResponseDto;
        if (!data.success || !data.aiSettings) throw new Error('AI settings save failed');
        values = data.aiSettings;
        status = 'aiSaved';
      } catch {
        values = before;
        status = 'aiSaveError';
      } finally {
        busy = false;
        emit();
      }
    }
  };
}

export type AiSettingsBridgeStore = ReturnType<typeof createAiSettingsBridgeStore>;
