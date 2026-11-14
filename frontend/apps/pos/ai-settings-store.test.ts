import { describe, expect, it, vi } from 'vitest';
import type { AiSettingsDto } from '@shared/contracts/api';
import { createAiSettingsBridgeStore } from './ai-settings-store';

const DEFAULT_SETTINGS: AiSettingsDto = {
  enabled: true,
  address: true,
  hours: true,
  delivery: true,
  customReplies: true,
  orderRedirect: true,
  orderStatus: true,
  pendingOrderReplies: true
};

describe('createAiSettingsBridgeStore', () => {
  it('loads tenant AI settings and transitions status to aiAutoSave', async () => {
    const store = createAiSettingsBridgeStore({ initialLocale: 'vi' });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ aiSettings: DEFAULT_SETTINGS }), { status: 200 }));

    await store.load({ tenantId: 'benmi', workerBase: 'https://api.test', fetcher });

    expect(fetcher).toHaveBeenCalledWith('https://api.test/api/config?tenant_id=benmi', { cache: 'no-store' });
    expect(store.getSnapshot()).toMatchObject({
      tenantId: 'benmi',
      values: DEFAULT_SETTINGS,
      busy: false,
      status: 'aiAutoSave',
      request: 1,
      locale: 'vi'
    });
  });

  it('sets aiLoadError on load failure without stale state', async () => {
    const store = createAiSettingsBridgeStore();
    const fetcher = vi.fn(async () => new Response('fail', { status: 503 }));

    await store.load({ tenantId: 'benmi', workerBase: 'https://api.test', fetcher });

    expect(store.getSnapshot()).toMatchObject({
      values: null,
      busy: false,
      status: 'aiLoadError'
    });
  });

  it('optimistically updates a toggle, commits server payload, and rolls back on save failure', async () => {
    const store = createAiSettingsBridgeStore();
    const updated = { ...DEFAULT_SETTINGS, address: false };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ aiSettings: DEFAULT_SETTINGS }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, aiSettings: updated }), { status: 200 }))
      .mockResolvedValueOnce(new Response('error', { status: 500 }));

    await store.load({ tenantId: 'benmi', workerBase: 'https://api.test', fetcher });
    await store.toggle({ tenantId: 'benmi', workerBase: 'https://api.test', fetcher }, 'address', false);
    expect(store.getSnapshot()).toMatchObject({ values: updated, busy: false, status: 'aiSaved' });

    await store.toggle({ tenantId: 'benmi', workerBase: 'https://api.test', fetcher }, 'hours', false);
    expect(store.getSnapshot()).toMatchObject({ values: updated, busy: false, status: 'aiSaveError' });
  });
});
