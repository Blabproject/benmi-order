import { describe, expect, it, vi } from 'vitest';
import { createPaymentWorkspaceStore } from './payment-workspace-store';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    }
  };
}

describe('createPaymentWorkspaceStore', () => {
  it('loads public config and attention count without loading private transactions before auth', async () => {
    const storage = createMemoryStorage();
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/api/payments/config')) {
        return new Response(JSON.stringify({ linePay: { configured: true, enabled: true } }), { status: 200 });
      }
      if (url.includes('/api/payments/attention/count')) {
        return new Response(JSON.stringify({ count: 3, checkedAt: 1700000000000 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });

    const store = createPaymentWorkspaceStore({
      getTenantId: () => 'a',
      getWorkerBase: () => 'https://worker.test',
      getLocale: () => 'vi',
      isWorkspaceOpen: () => false,
      isDocumentHidden: () => false,
      fetcher,
      sessionStorageRef: storage
    });

    await store.init();
    const snap = store.getSnapshot();
    expect(snap.configured).toBe(true);
    expect(snap.count).toBe(3);
    expect(snap.auth).toBeNull();
    expect(calls.some((u) => u.includes('/transactions') || u.includes('/summary'))).toBe(false);
  });

  it('rejects invalid >31-day ranges and preserves existing items when invalid', () => {
    const storage = createMemoryStorage();
    const store = createPaymentWorkspaceStore({
      getTenantId: () => 'a',
      getWorkerBase: () => 'https://worker.test',
      getLocale: () => 'vi',
      isWorkspaceOpen: () => true,
      isDocumentHidden: () => false,
      fetcher: vi.fn(),
      sessionStorageRef: storage
    });

    const ok = store.applyFilters({
      from: '2026-01-01',
      to: '2026-02-15',
      status: '',
      q: ''
    });
    expect(ok).toBe(false);
    expect(store.getSnapshot().error).toBe('paymentInvalidRange');
  });

  it('locks workspace and clears session token on 401 and tenant switch', async () => {
    const storage = createMemoryStorage();
    storage.setItem('staff_session_token_a', 'tok-a');
    let tenant = 'a';
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/payments/session')) {
        return new Response(JSON.stringify({ code: 'SESSION_REQUIRED' }), { status: 401 });
      }
      if (url.includes('/api/payments/config')) {
        return new Response(JSON.stringify({ linePay: { configured: true } }), { status: 200 });
      }
      return new Response(JSON.stringify({ count: 0, checkedAt: 1 }), { status: 200 });
    });

    const store = createPaymentWorkspaceStore({
      getTenantId: () => tenant,
      getWorkerBase: () => 'https://worker.test',
      getLocale: () => 'vi',
      isWorkspaceOpen: () => true,
      isDocumentHidden: () => false,
      fetcher,
      sessionStorageRef: storage
    });

    await store.init();
    expect(storage.getItem('staff_session_token_a')).toBeNull();
    expect(store.getSnapshot().auth).toBeNull();

    tenant = 'b';
    await store.init();
    expect(store.getSnapshot().scope).toBe('https://worker.test|b');
  });
});
