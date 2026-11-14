import { describe, expect, it } from 'vitest';
import {
  buildPaymentMenuUrl,
  createPaymentSessionClient,
  formatPaymentCancelMessage,
  resolvePaymentWorkerBase
} from './payment-result-client';

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

describe('payment-result-client', () => {
  it('resolves worker base across localhost, staging, prod, and explicit ?env overrides', () => {
    expect(resolvePaymentWorkerBase({ hostname: 'localhost', search: '' })).toBe(
      'https://platform-worker-dev.thuanmnc.workers.dev'
    );
    expect(resolvePaymentWorkerBase({ hostname: '127.0.0.1', search: '' })).toBe(
      'https://platform-worker-dev.thuanmnc.workers.dev'
    );
    expect(resolvePaymentWorkerBase({ hostname: 'staging.blabfood.app', search: '' })).toBe(
      'https://platform-worker-staging.thuanmnc.workers.dev'
    );
    expect(resolvePaymentWorkerBase({ hostname: 'order.blabfood.app', search: '?env=staging' })).toBe(
      'https://platform-worker-staging.thuanmnc.workers.dev'
    );
    expect(resolvePaymentWorkerBase({ hostname: 'order.blabfood.app', search: '' })).toBe(
      'https://benmi-worker-official.thuanmnc.workers.dev'
    );
  });

  it('builds safe same-origin menu URLs stripping provider parameters', () => {
    const safe = buildPaymentMenuUrl(
      'https://fixture.test/?tenant_id=a&payment_id=123&transactionId=t1&orderId=o1',
      'a',
      'vi',
      'https://fixture.test'
    );
    expect(safe.toString()).toBe('https://fixture.test/?tenant_id=a&lang=vi');

    const crossOrigin = buildPaymentMenuUrl('https://evil.example/steal?x=1', 'a', 'zh-TW', 'https://fixture.test');
    expect(crossOrigin.toString()).toBe('https://fixture.test/?tenant_id=a&lang=zh-TW');
  });

  it('archives paid and restored sessions while preserving or clearing cart drafts accurately', () => {
    const local = createMemoryStorage();
    const sessionStore = createMemoryStorage();
    const client = createPaymentSessionClient({
      getTenant: () => 'demo',
      getWorkerBase: () => 'https://worker.test',
      localStorageRef: local,
      sessionStorageRef: sessionStore
    });

    const draft = { cart: { b1: 2 }, customizeData: {}, comboDrinkData: {}, bundleCartData: {} };
    local.setItem('cart_save_demo', JSON.stringify(draft));
    sessionStore.setItem('order_detail_pending:demo', JSON.stringify({ payload: { operationId: 'op-1' } }));

    const session = {
      id: 'pay-1',
      token: 'tok-1',
      payload: { operationId: 'op-1' },
      cartSignature: client.signature(draft)
    };
    client.save(session);
    client.paid(session);

    expect(local.getItem('linepay_checkout:demo')).toBeNull();
    expect(local.getItem('cart_save_demo')).toBeNull();
    expect(sessionStore.getItem('order_detail_pending:demo')).toBeNull();
    expect(client.forResult('pay-1')?.completed).toBe(true);

    const terminalSession = {
      id: 'pay-2',
      token: 'tok-2',
      returnDraft: { cart: { b2: 1 } }
    };
    client.save(terminalSession);
    client.restore(terminalSession);
    expect(local.getItem('cart_save_demo')).toContain('"b2":1');
    expect(client.forResult('pay-2')?.terminal).toBe(true);
  });

  it('formats cancellation messages in zh-TW and vi', () => {
    expect(formatPaymentCancelMessage({ paidAt: 100 }, 'vi')).toContain('đã thanh toán');
    expect(formatPaymentCancelMessage({ cancelRequestedAt: 100 }, 'zh-TW')).toContain('正在確認');
  });
});
