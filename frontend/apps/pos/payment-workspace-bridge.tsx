import { StrictMode, useEffect, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { resolveWorkerBase } from '@shared/infra/http';
import { resolveOrderPaymentBadge } from '@shared/contracts/order-formatters';
import { translatePos, type PosLocale } from '@shared/i18n/pos-dictionary';
import { PosPaymentWorkspace } from './PosPaymentWorkspace';
import {
  createPaymentWorkspaceStore,
  formatPaymentMoney,
  resolvePaymentErrorKey,
  resolvePaymentStatusLabel,
  type PaymentWorkspaceSnapshot,
  type PaymentWorkspaceStore,
  type RefundOrderTarget
} from './payment-workspace-store';

interface PosPaymentBridgeWindow extends Window {
  WORKER_BASE?: string;
  currentLang?: string;
  currentTenantId?: string;
  activeTab?: string;
  getTenantIdFromUrl?: () => string;
  escapeHtml?: (value: unknown) => string;
  switchTab?: (tab: string) => void;
  switchSettingTab?: (cardId: string) => void;
  closeModal?: () => void;
  fetchOrders?: () => Promise<void> | void;
  openPaymentSettingsFromWorkspace?: () => void;
  openBlabContactModal?: (kind: string) => void;
  updatePageMainTitle?: (tab: string) => void;
  beginStorePinChangeForPayments?: (scope: string) => void;
  resetStorePinChangeForm?: () => void;
  PaymentPOS?: {
    token: (forcePrompt?: boolean) => Promise<string | null>;
    mount: (order: {
      key: string;
      displayKey?: string | null;
      status: string;
      payment?: { id: string; amount: number; status: string } | null;
    }) => void;
    badge: (order: { status?: string; payment?: { status: string } | null }) => string;
    translate: () => void;
    onTabChange: (tab: string) => void;
    login: () => Promise<void>;
    startPinChange: () => void;
    returnFromPinChange: (context: { scope?: string } | null | undefined, changed?: boolean) => void;
    setView: (view: 'attention' | 'history') => void;
    setRange: (days: number) => void;
    applyFilters: (event?: Event) => void;
    openDetail: (id: string) => Promise<void>;
    closeDetail: () => void;
    refresh: () => Promise<void>;
    loadMore: () => Promise<void>;
  };
}

function getPosWindow(): PosPaymentBridgeWindow {
  return window as unknown as PosPaymentBridgeWindow;
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

function escapeSafeHtml(value: unknown): string {
  const posWindow = getPosWindow();
  if (typeof posWindow.escapeHtml === 'function') {
    return posWindow.escapeHtml(value);
  }
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function syncExternalPaymentChrome(snapshot: PaymentWorkspaceSnapshot): void {
  const { locale, configured, count, countError } = snapshot;
  const nav = document.getElementById('tab-payments');
  if (nav) {
    nav.hidden = configured !== true;
    nav.setAttribute('aria-label', translatePos(locale, 'paymentWorkspace'));
  }

  const badgeEl = document.getElementById('sidebar-payment-count');
  if (badgeEl) {
    const countValue = count ?? 0;
    badgeEl.hidden = !(countValue > 0);
    badgeEl.textContent = String(countValue);
    badgeEl.setAttribute('aria-label', translatePos(locale, 'paymentAlertCount', { count: countValue }));
  }

  const live = document.getElementById('payment-live-alert');
  if (live) {
    const countValue = count ?? 0;
    live.hidden = configured !== true || (!(countValue > 0) && !countError);
    const text = countError
      ? `${countValue > 0 ? `${translatePos(locale, 'paymentAlertCount', { count: countValue })} · ` : ''}${translatePos(locale, 'paymentCountStale')}`
      : translatePos(locale, 'paymentAlertCount', { count: countValue });
    if (live.textContent !== text) {
      live.textContent = text;
    }
    live.classList.toggle('is-stale', countError);
  }
}

function createOrderReviewPaymentMount(store: PaymentWorkspaceStore) {
  return function mountOrderReviewPayment(order: {
    key: string;
    displayKey?: string | null;
    status: string;
    payment?: { id: string; amount: number; status: string } | null;
  }): void {
    let el = document.getElementById('review-payment');
    if (!el) {
      el = document.createElement('section');
      el.id = 'review-payment';
      el.className = 'payment-panel';
      document.getElementById('review-total')?.parentElement?.insertAdjacentElement('afterend', el);
    }
    el.replaceChildren();
    el.hidden = !order.payment;
    if (!order.payment) return;

    const payment = order.payment;
    const locale = readLocale();
    const header = document.createElement('div');
    header.className = 'pos-payment-header';
    const brand = document.createElement('div');
    brand.className = 'pos-payment-brand';

    const channelBadge = document.createElement('span');
    channelBadge.className = 'pos-payment-channel-badge';
    channelBadge.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="3"/><line x1="2" x2="22" y1="10" y2="10"/></svg><span>LINE Pay</span>';
    brand.append(channelBadge);

    const statusPill = document.createElement('span');
    const statusClassMap: Record<string, string> = {
      PAID: 'status-paid',
      REFUNDED: 'status-refunded',
      REFUND_PENDING: 'status-pending',
      REFUND_FAILED: 'status-failed'
    };
    statusPill.className = `pos-payment-status-pill ${statusClassMap[payment.status] || 'status-pending'}`;
    statusPill.textContent = resolvePaymentStatusLabel(payment.status, locale);
    brand.append(statusPill);
    header.append(brand);

    const amount = document.createElement('span');
    amount.className = 'pos-payment-amount';
    amount.textContent = formatPaymentMoney(payment.amount, locale);
    header.append(amount);
    el.append(header);

    const isUnrefunded =
      ['CANCELLED', 'REJECTED', 'FORCE_REJECT', 'EXPIRED'].includes(order.status) && payment.status === 'PAID';
    if (isUnrefunded) {
      const alertBox = document.createElement('div');
      alertBox.className = 'pos-payment-alert-unrefunded';
      alertBox.setAttribute('role', 'alert');
      alertBox.innerHTML =
        `<div class="pos-payment-alert-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>` +
        `<div class="pos-payment-alert-content"><div class="pos-payment-alert-title">${escapeSafeHtml(translatePos(locale, 'paymentUnrefundedTitle'))}</div>` +
        `<div class="pos-payment-alert-desc">${escapeSafeHtml(translatePos(locale, 'paymentUnrefundedDesc'))}</div></div>`;
      el.append(alertBox);
    }

    if (payment.status === 'PAID') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'payment-button btn-pos-refund';
      button.innerHTML =
        '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>' +
        `<span>${escapeSafeHtml(translatePos(locale, 'paymentRefund'))}</span>`;
      button.onclick = async () => {
        try {
          await store.refundOrderPayment(order as RefundOrderTarget, async (updated) => {
            order.payment = updated;
            mountOrderReviewPayment(order);
            await getPosWindow().fetchOrders?.();
            await store.refreshAll();
          });
        } catch (error) {
          if ((error as { code?: string })?.code !== 'PAYMENT_AUTH_CANCELLED') {
            window.alert(translatePos(readLocale(), resolvePaymentErrorKey(error)));
          }
        }
      };
      el.append(button);
    }

    if (['UNKNOWN', 'REFUND_PENDING', 'REFUND_FAILED'].includes(payment.status)) {
      const info = document.createElement('p');
      info.className = 'pos-payment-info-hint';
      info.textContent = translatePos(locale, 'paymentReviewHint');
      el.append(info);
      if (['UNKNOWN', 'REFUND_PENDING'].includes(payment.status)) {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'payment-button btn-pos-reconcile';
        retryBtn.style.marginTop = '8px';
        retryBtn.innerHTML =
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>' +
          `<span>${escapeSafeHtml(translatePos(locale, 'paymentViewCheck'))}</span>`;
        retryBtn.onclick = async () => {
          try {
            retryBtn.disabled = true;
            await store.reconcileDetail(payment.id);
            const refreshed = store.getSnapshot().detail;
            if (refreshed && refreshed.id === payment.id) {
              order.payment = refreshed;
              mountOrderReviewPayment(order);
            }
            await getPosWindow().fetchOrders?.();
            await store.refreshAll();
          } catch (error) {
            if ((error as { code?: string })?.code !== 'PAYMENT_AUTH_CANCELLED') {
              window.alert(translatePos(readLocale(), resolvePaymentErrorKey(error)));
            }
          } finally {
            retryBtn.disabled = false;
          }
        };
        el.append(retryBtn);
      }
    }
  };
}

function PosPaymentWorkspaceRoot({ store }: { store: PaymentWorkspaceStore }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    syncExternalPaymentChrome(snapshot);
  }, [snapshot]);

  return (
    <PosPaymentWorkspace
      snapshot={snapshot}
      onOpenSettings={() => getPosWindow().openPaymentSettingsFromWorkspace?.()}
      onRefresh={() => {
        void store.refreshAll();
      }}
      onLogin={() => {
        void store.login();
      }}
      onStartPinChange={() => store.startPinChange()}
      onSelectView={(view) => store.setView(view)}
      onSelectRange={(days) => store.setRange(days)}
      onApplyFilters={(filters) => store.applyFilters(filters)}
      onLoadMore={() => {
        void store.refreshData(true);
      }}
      onOpenDetail={(id) => {
        void store.openDetail(id);
      }}
      onCloseDetail={() => store.closeDetail()}
      onReconcileDetail={(id) => {
        void store.reconcileDetail(id);
      }}
      onRefundDetail={(payment) => {
        void store.refundDetail(payment);
      }}
      onOpenSupport={() => store.openSupport()}
      onSubmitPrompt={(values) => store.submitPrompt(values)}
      onDismissPrompt={() => store.dismissPrompt(null)}
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

/** Mounts React PaymentPOS workspace and registers global bridge methods for legacy POS tabs & modals. */
export function mountPosPaymentWorkspaceBridge(
  mountEl: HTMLElement | null = document.getElementById('pos-payment-workspace-react-root')
): PaymentWorkspaceStore | null {
  if (!mountEl) return null;
  const posWindow = getPosWindow();

  const store = createPaymentWorkspaceStore({
    getTenantId: readTenantId,
    getWorkerBase: readWorkerBase,
    getLocale: readLocale,
    isWorkspaceOpen: () => posWindow.activeTab === 'payments',
    fetcher: window.fetch.bind(window),
    onStartPinChange: (scope) => {
      if (typeof posWindow.beginStorePinChangeForPayments !== 'function') return;
      posWindow.closeModal?.();
      posWindow.switchTab?.('settings');
      if (posWindow.activeTab === 'settings') {
        posWindow.switchSettingTab?.('setting-card-store-pairing');
        posWindow.beginStorePinChangeForPayments(scope);
      }
    },
    onSwitchToPaymentsTab: () => {
      posWindow.switchTab?.('payments');
    },
    onFetchOrders: () => posWindow.fetchOrders?.(),
    onOpenSupport: () => posWindow.openBlabContactModal?.('support'),
    onResetStorePinChangeForm: () => posWindow.resetStorePinChangeForm?.(),
    onFocusButtonAfterPinReturn: (changed) => {
      queueMicrotask(() => {
        document.getElementById(changed ? 'payment-workspace-login' : 'payment-workspace-change-pin')?.focus();
      });
    }
  });

  const mountOrderReviewPayment = createOrderReviewPaymentMount(store);

  posWindow.PaymentPOS = {
    token: (forcePrompt = false) => store.token(forcePrompt),
    mount: mountOrderReviewPayment,
    badge: (order) => {
      const model = resolveOrderPaymentBadge(
        order ? { status: order.status || '', payment: order.payment ? { ...order.payment, id: '', method: 'line_pay', amount: 0, currency: 'TWD', paidAt: null, refundedAmount: 0 } : undefined } : null,
        readLocale()
      );
      if (!model) return '';
      return `<span class="tile-meta-tag">${escapeSafeHtml(model.label)}</span>`;
    },
    translate: () => {
      const locale = readLocale();
      flushBridgeUpdate(() => {
        store.setLocale(locale);
      });
      syncExternalPaymentChrome(store.getSnapshot());
      if (posWindow.activeTab === 'payments' && typeof posWindow.updatePageMainTitle === 'function') {
        posWindow.updatePageMainTitle('payments');
      }
    },
    onTabChange: (tab) => store.onTabChange(tab),
    login: () => store.login(),
    startPinChange: () => store.startPinChange(),
    returnFromPinChange: (context, changed = false) => {
      flushBridgeUpdate(() => {
        store.returnFromPinChange(context, changed);
      });
    },
    setView: (view) => store.setView(view),
    setRange: (days) => {
      store.setRange(days);
    },
    applyFilters: (event?: Event) => {
      event?.preventDefault();
      const from = (document.getElementById('payment-filter-from') as HTMLInputElement | null)?.value || '';
      const to = (document.getElementById('payment-filter-to') as HTMLInputElement | null)?.value || '';
      const status = (document.getElementById('payment-filter-status') as HTMLSelectElement | null)?.value || '';
      const q = (document.getElementById('payment-filter-search') as HTMLInputElement | null)?.value || '';
      store.applyFilters({ from, to, status, q });
    },
    openDetail: (id) => store.openDetail(id),
    closeDetail: () => store.closeDetail(),
    refresh: () => store.refreshAll(),
    loadMore: () => store.refreshData(true)
  };

  mountedRoot = createRoot(mountEl);
  flushBridgeUpdate(() => {
    mountedRoot?.render(
      <StrictMode>
        <PosPaymentWorkspaceRoot store={store} />
      </StrictMode>
    );
  });

  // Preserve callback.name === 'tick' across Vite minification for Playwright polling verification.
  function tick() {
    store.tick();
  }
  Object.defineProperty(tick, 'name', { value: 'tick' });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });
  window.addEventListener('pagehide', () => store.cleanupPageHide());
  window.setInterval(tick, 30000);
  void store.init();

  return store;
}

if (typeof document !== 'undefined') {
  if (document.getElementById('pos-payment-workspace-react-root')) {
    mountPosPaymentWorkspaceBridge();
  } else {
    document.addEventListener('DOMContentLoaded', () => mountPosPaymentWorkspaceBridge(), { once: true });
  }
}
