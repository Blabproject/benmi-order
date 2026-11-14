import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createPaymentSessionClient } from './payment-result-client';
import { PaymentResultApp } from './PaymentResultApp';

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

const VALID_PAYMENT_ID = '11111111-1111-4111-8111-111111111111';

describe('PaymentResultApp', () => {
  it('renders paid receipt details and clears draft on new order navigation', async () => {
    const local = createMemoryStorage();
    const sessionStore = createMemoryStorage();
    const navigate = vi.fn();

    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: VALID_PAYMENT_ID,
        status: 'PAID',
        amount: 160,
        paidAt: 1700000000000,
        orderStatus: 'NEW',
        displayKey: 'ORD-20261114-001',
        pickupTime: '12:30',
        merchant: { brandName: 'Benmi Kitchen', logoUrl: 'https://cdn.example/logo.png', locale: 'vi' },
        receipt: {
          schemaVersion: 1,
          total: 160,
          rounds: [
            {
              roundNumber: 1,
              createdAt: '2026-11-14T10:00:00Z',
              note: 'Giao nhanh',
              discount: 0,
              total: 160,
              groups: [],
              items: [
                {
                  lineId: 'l1',
                  itemId: 'i1',
                  name: 'Banh Mi',
                  categoryId: 'c1',
                  category: 'Main',
                  quantity: 2,
                  unitPrice: 80,
                  subtotal: 160,
                  note: '',
                  portions: [{ portionIndex: 0, note: '', groups: [] }, { portionIndex: 1, note: '', groups: [] }]
                }
              ]
            }
          ]
        }
      })
    });

    const client = createPaymentSessionClient({
      getTenant: () => 'demo',
      getWorkerBase: () => 'https://worker.test',
      fetcher,
      localStorageRef: local,
      sessionStorageRef: sessionStore,
      navigate
    });
    client.save({ id: VALID_PAYMENT_ID, token: 'tok-paid' });

    render(
      <PaymentResultApp
        tenant="demo"
        paymentId={VALID_PAYMENT_ID}
        initialLocale="vi"
        hasExplicitLangParam
        client={client}
        navigate={navigate}
      />
    );

    await screen.findByText('Thanh toán thành công');
    expect(screen.getByText('Benmi Kitchen')).toBeTruthy();
    expect(screen.getByText('2 × Banh Mi')).toBeTruthy();
    expect(screen.getByText('TWD 160')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Đặt đơn mới' }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0]?.[0]).toContain('tenant_id=demo&lang=vi');
  });

  it('shows missing state cleanly when no local session matches', async () => {
    const local = createMemoryStorage();
    const sessionStore = createMemoryStorage();
    const client = createPaymentSessionClient({
      getTenant: () => 'demo',
      getWorkerBase: () => 'https://worker.test',
      localStorageRef: local,
      sessionStorageRef: sessionStore
    });

    render(
      <PaymentResultApp
        tenant="demo"
        paymentId={VALID_PAYMENT_ID}
        initialLocale="vi"
        hasExplicitLangParam
        client={client}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Chưa thể xem kết quả thanh toán')).toBeTruthy();
    });
  });
});
