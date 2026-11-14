import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PosPaymentWorkspace } from './PosPaymentWorkspace';
import type { PaymentWorkspaceSnapshot } from './payment-workspace-store';

function makeSnapshot(overrides: Partial<PaymentWorkspaceSnapshot> = {}): PaymentWorkspaceSnapshot {
  return {
    locale: 'vi',
    scope: 'https://worker.test|demo',
    configured: true,
    configError: false,
    configBusy: false,
    count: 2,
    countError: false,
    checkedAt: 1700000000000,
    view: 'attention',
    filters: { from: '2026-11-14', to: '2026-11-14', status: '', q: '' },
    items: [],
    summary: null,
    nextCursor: null,
    loaded: false,
    auth: null,
    error: null,
    listBusy: false,
    loginBusy: false,
    detailOpen: false,
    detail: null,
    detailBusy: false,
    detailMessage: null,
    actionBusy: false,
    pinChangeRequired: false,
    pinChanged: false,
    notice: null,
    prompt: null,
    ...overrides
  };
}

describe('PosPaymentWorkspace', () => {
  it('renders locked access panel before PIN verification', () => {
    const onLogin = vi.fn();
    render(
      <PosPaymentWorkspace
        snapshot={makeSnapshot()}
        onOpenSettings={vi.fn()}
        onRefresh={vi.fn()}
        onLogin={onLogin}
        onStartPinChange={vi.fn()}
        onSelectView={vi.fn()}
        onSelectRange={vi.fn()}
        onApplyFilters={() => true}
        onLoadMore={vi.fn()}
        onOpenDetail={vi.fn()}
        onCloseDetail={vi.fn()}
        onReconcileDetail={vi.fn()}
        onRefundDetail={vi.fn()}
        onOpenSupport={vi.fn()}
        onSubmitPrompt={vi.fn()}
        onDismissPrompt={vi.fn()}
      />
    );

    expect(screen.getByText(/Xác thực PIN quản lý/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xác thực quyền của quán' }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('renders unlocked summary and formatted order rows cleanly', () => {
    const onOpenDetail = vi.fn();
    render(
      <PosPaymentWorkspace
        snapshot={makeSnapshot({
          auth: 'tok-1',
          loaded: true,
          summary: { collected: 500, refunded: 100, net: 400 },
          items: [
            {
              id: 'pay-1',
              orderKey: 'ord-1',
              displayKey: '#ZBCF1114-T001',
              createdAt: 1700000000000,
              amount: 200,
              status: 'PAID',
              attentionReason: 'PAID_CANCELLED',
              canRefund: true
            }
          ]
        })}
        onOpenSettings={vi.fn()}
        onRefresh={vi.fn()}
        onLogin={vi.fn()}
        onStartPinChange={vi.fn()}
        onSelectView={vi.fn()}
        onSelectRange={vi.fn()}
        onApplyFilters={() => true}
        onLoadMore={vi.fn()}
        onOpenDetail={onOpenDetail}
        onCloseDetail={vi.fn()}
        onReconcileDetail={vi.fn()}
        onRefundDetail={vi.fn()}
        onOpenSupport={vi.fn()}
        onSubmitPrompt={vi.fn()}
        onDismissPrompt={vi.fn()}
      />
    );

    expect(screen.getByText('1114-T001')).toBeTruthy();
    expect(screen.getByText('TWD 500')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tiền' }));
    expect(onOpenDetail).toHaveBeenCalledWith('pay-1');
  });
});
