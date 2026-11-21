import { useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { HistoryOrderDto } from '@shared/contracts/api';
import { Button } from '@shared/ui/button';
import { ClockIcon, CloseIcon, ModifyIcon, ReceiptIcon } from '@shared/ui/PosIcons';

interface PrintItem { name?: string; price?: string | number; unitPrice?: string | number; quantity?: number }
type ActionVariant = 'primary' | 'change' | 'danger' | 'blue';

declare const OrderCode: { format(key: string): string };
declare const PrinterService: {
  parseOrderItems(order: HistoryOrderDto, includeStickers: boolean): PrintItem[];
  canPrintFullOrder(): boolean;
  printFullOrder(key: string): void;
  printManual(key: string, part: 'all'): void;
  printCashierOnly(key: string): void;
};
declare function t(key: string, params?: Record<string, string | number>): string;
declare function isOrderDineIn(order: HistoryOrderDto): boolean;
declare function getOrderTableNumber(order: HistoryOrderDto): string;
declare function formatContentHtml(order: HistoryOrderDto): string;
declare function formatOrderTotal(order: HistoryOrderDto): string;
declare function formatDineInTimeDisplay(order: HistoryOrderDto): string;
declare function formatPickupTimeDisplay(time: string, createdAt: number, content: string): string;
declare function formatSubmissionElapsedTime(order: HistoryOrderDto): string;
declare function formatEta(time: string): string;
declare function parsePickupTimeMs(time: string): number;
declare function lookupItemPrice(name: string): number | null;
declare function isOrderMetadataText(name: string): boolean;
declare function dismissReviewModal(): void;
declare function reviewOpenChange(): void;
declare function reviewOpenReject(): void;
declare function reviewAccept(): Promise<void>;
declare function markReadyFromReview(): Promise<void>;
declare function reviewForceCancel(): Promise<void>;
declare function completeOrderFromReview(): Promise<void> | undefined;
declare function cancelOrderFromReview(): Promise<void> | undefined;
declare function openQuickStickerModal(key: string): void;

const statusLabels: Record<string, string> = {
  NEW: 'statusPillNew', ACCEPTED: 'statusPillAccepted', DONE: 'statusPillDone', PICKED_UP: 'statusPillPicked',
  PAID: 'statusPillPaid', REJECTED: 'statusPillRejected', CANCELLED: 'statusPillRejected',
  WAITING_CUSTOMER_CHANGE: 'statusPillWaiting', WAITING_CUSTOMER_REJECT: 'statusPillWaiting',
};

function timing(order: HistoryOrderDto) {
  const { status, time } = order;
  const finished = ['PICKED_UP', 'PAID', 'CANCELLED', 'REJECTED'].includes(status);
  if (finished) {
    return {
      text: t(statusLabels[status] ?? status), className: '',
      color: status === 'PICKED_UP' || status === 'PAID' ? '#059669' : '#64748b',
    };
  }
  if (isOrderDineIn(order)) {
    return { text: formatSubmissionElapsedTime(order), className: 'timing-eta-dinein', color: '#7c3aed' };
  }
  const minutes = Math.round((parsePickupTimeMs(time) - Date.now()) / 60000);
  const urgent = minutes > 0 && minutes <= 15;
  return {
    text: formatEta(time), className: minutes <= 0 ? 'timing-eta-overdue' : urgent ? 'timing-eta-urgent' : '',
    color: urgent ? '#ea580c' : 'var(--brand-red, #dc2626)',
  };
}

function orderSubtotal(order: HistoryOrderDto) {
  if (typeof PrinterService === 'undefined') {
    return (order.items ?? []).reduce((sum, item) => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      return sum + (Number(item.subtotal) > 0 ? Number(item.subtotal) : (Number(item.price ?? item.unit_price) || 0) * quantity);
    }, 0);
  }
  const amount = (value: PrintItem['price']) => Number(String(value ?? '').replace(/[^0-9.]/g, '')) || 0;
  return (PrinterService.parseOrderItems(order, false) ?? []).reduce((sum, item) => {
    const linePrice = amount(item.price);
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const unitPrice = amount(item.unitPrice) || (item.name && typeof lookupItemPrice === 'function' ? Number(lookupItemPrice(item.name)) || 0 : 0);
    return sum + (linePrice || Math.max(0, unitPrice) * quantity);
  }, 0);
}

function readDetail(order: HistoryOrderDto) {
  const items = typeof PrinterService !== 'undefined' ? PrinterService.parseOrderItems(order, true) ?? [] : [];
  const itemCount = items.filter(item => item?.name && !isOrderMetadataText(item.name)).length || 1;
  const legacyTotal = order.content?.match(/💰\s*總金額[：:]\s*\$?(\d+)/) ?? order.content?.match(/Tổng\s*(?:tiền)?[：:]\s*(\d+)/i);
  const total = Number(order.total) > 0 ? Number(order.total) : Number(legacyTotal?.[1]) || 0;
  const subtotal = orderSubtotal(order);
  return { itemsHtml: formatContentHtml(order), itemCount, subtotal, discount: total > 0 ? Math.max(0, subtotal - total) : 0 };
}

function CheckIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 12 5 5L20 6" /></svg>;
}

function PrintIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></svg>;
}

function DetailActions({ status, dineIn }: { status: string; dineIn: boolean }) {
  const [active, setActive] = useState('');
  const pending = useRef(false);

  function action(id: string, label: string, icon: ReactNode, run: () => void | Promise<void>, variant: ActionVariant = 'primary') {
    const style = variant === 'change' ? 'yellow' : variant === 'danger' ? 'danger' : 'primary';
    const lifecycle = variant === 'blue' ? 'primary btn-lifecycle-blue' : variant;
    return <Button id={id} className={`btn btn-${style} btn-lifecycle-${lifecycle}`} disabled={Boolean(active)} aria-busy={active === id || undefined}
      onClick={async () => {
        if (pending.current) return;
        pending.current = true;
        setActive(id);
        try { await run(); } finally { pending.current = false; setActive(''); }
      }}>
      {icon}<span>{t(active === id ? 'processing' : label)}</span>
    </Button>;
  }

  let controls;
  switch (status) {
    case 'NEW':
      controls = <div className="modal-actions" id="review-actions">
        {action('btn-review-accept', 'btnAccept', <CheckIcon />, reviewAccept)}
        {action('btn-review-change', 'btnChange', <ClockIcon size={16} />, reviewOpenChange, 'change')}
        {action('btn-review-reject', 'btnReject', <CloseIcon size={16} />, reviewOpenReject, 'danger')}
      </div>;
      break;
    case 'ACCEPTED':
      controls = <div className="modal-actions" id="review-actions-accepted">
        {action('btn-review-ready', 'btnReady', <CheckIcon />, markReadyFromReview)}
        {action('btn-review-cancel-1', 'btnCancelOrder', <CloseIcon size={16} />, cancelOrderFromReview, 'danger')}
      </div>;
      break;
    case 'DONE':
      controls = <div className="modal-actions" id="review-actions-done">
        {action('btn-review-picked', dineIn ? 'reviewCompleteDineIn' : 'btnPickedUp', <CheckIcon />, completeOrderFromReview, 'blue')}
        {action('btn-review-cancel-2', 'btnCancelOrder', <CloseIcon size={16} />, cancelOrderFromReview, 'danger')}
      </div>;
      break;
    case 'WAITING_CUSTOMER_CHANGE':
    case 'WAITING_CUSTOMER_REJECT':
      controls = <div className="modal-actions" id="review-actions-waiting">
        {action('btn-review-accept-wait', 'btnAccept', <CheckIcon />, reviewAccept)}
        {action('btn-review-force-cancel', 'btnCancelOrder', <CloseIcon size={16} />, reviewForceCancel, 'danger')}
      </div>;
      break;
  }
  return <div className="modal-lifecycle-footer">{controls}</div>;
}

function OrderDetail({ order, etaOrder, detail }: { order: HistoryOrderDto; etaOrder: HistoryOrderDto; detail: ReturnType<typeof readDetail> }) {
  const dineIn = isOrderDineIn(order);
  const table = getOrderTableNumber(order);
  const appended = (Number(order.round_count || order.roundCount) || 1) > 1 || Boolean(order.lastAppendedAt || order.last_appended_at);
  const customer = order.customer?.trim();
  const name = customer || t('defaultCustomer');
  const dining = dineIn ? (table ? t('reviewTable', { table }) : t('dineIn')) : t('takeaway');
  const eta = timing(etaOrder);
  const statusLabel = statusLabels[order.status];

  return <div className="order-detail-page-container">
    <div className="order-detail-topbar">
      <div className="order-detail-topbar-left">
        <Button className="order-detail-circle-btn" onClick={dismissReviewModal} aria-label={t('btnClose')} title={t('btnClose')}><CloseIcon size={20} /></Button>
        <div className="order-detail-header-text">
          <h1 className="order-detail-title" id="review-header-title">
            <span id="review-customer-header">{name}</span><span className="order-title-dot" aria-hidden="true">•</span>
            <span className="order-title-key" id="review-order-key-badge">{OrderCode.format(order.displayKey || order.key || '-')}</span>
          </h1>
        </div>
      </div>
      <div className="order-detail-topbar-right">
        <Button className="order-detail-circle-btn" id="btn-review-quick-print" title={t('btnPrint')} aria-label={t('btnPrint')}
          onClick={() => PrinterService.canPrintFullOrder() ? PrinterService.printFullOrder(order.key) : PrinterService.printManual(order.key, 'all')}><PrintIcon size={20} /></Button>
      </div>
    </div>
    <div className="order-detail-grid">
      <div className="order-detail-main-col">
        <div className="order-detail-meta-bar"><span className="order-detail-items-count" id="review-items-count">{t('tileItemCount', { count: detail.itemCount })}</span></div>
        {/* The shared formatter escapes order data and preserves both snapshot and legacy portion/print controls. */}
        <div className="detail-content" id="review-content" dangerouslySetInnerHTML={{ __html: detail.itemsHtml }} />
        <div className="order-detail-totals-block">
          {detail.discount > 0 && <>
            <div className="order-detail-total-row subtotal-row" id="review-subtotal-row">
              <span className="total-label">{t('labelSubtotal')}</span><span className="total-val" id="review-subtotal">${detail.subtotal.toLocaleString()}</span>
            </div>
            <div className="order-detail-total-row discount-row" id="review-discount-row">
              <span className="total-label">{t('labelDiscount')}</span><span className="total-val" id="review-discount">-${detail.discount.toLocaleString()}</span>
            </div>
          </>}
          <div className="order-detail-total-row grand-total-row" id="review-grandtotal-row">
            <span className="total-label">{t('labelGrandtotal')}</span><span className="total-val" id="review-total">{formatOrderTotal(order)}</span>
          </div>
          <section id="review-payment" className="payment-panel" />
        </div>
      </div>
      <div className="order-detail-side-col">
        <div className="order-detail-status-header"><h2 className="order-detail-status-title" id="review-status-title">{statusLabel ? t(statusLabel) : order.status || '-'}</h2></div>
        <div className="order-detail-timing-card" id="review-timing-card">
          <div className="timing-card-box pickup-box">
            <div className="timing-card-label">{t(dineIn ? (appended ? 'dineInAppendedTimeLabel' : 'dineInTimeLabel') : 'labelPickup')}</div>
            <div className="timing-card-val" id="review-pickup"><ClockIcon /><span>{dineIn ? formatDineInTimeDisplay(order) : formatPickupTimeDisplay(order.time, order.createdAt, order.content)}</span></div>
          </div>
          <div className="timing-card-divider" />
          <div className="timing-card-box eta-box">
            <div className="timing-card-label">{t(dineIn ? 'dineInElapsedHeader' : 'labelEta')}</div>
            <div className={`timing-card-val ${eta.className}`} id="review-eta" style={{ color: eta.color }}>{eta.text}</div>
          </div>
        </div>
        <div className="order-detail-customer-card">
          <div className="customer-card-header">
            <div className="customer-avatar-circle" id="review-customer-avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</div>
            <div className="customer-card-info">
              <span className="customer-card-name" id="review-customer">{customer || '-'}</span>
              <span className="customer-card-sub" id="review-customer-sub">{dining}{order.phone ? ` · ${order.phone}` : ''}</span>
            </div>
          </div>
          <DetailActions key={order.key} status={order.status} dineIn={dineIn} />
        </div>
        <div className="modal-print-toolbar">
          <div className="printer-reports" data-printer-reports="current" role="status" aria-live="polite" />
          <div className="print-toolbar-header"><PrintIcon size={14} /><span>{t('printToolsLabel')}</span></div>
          <div className="review-print-macro-bar" id="review-print-macro-bar">
            <Button className="btn btn-print-full" id="btn-review-print-full" data-print-action="full" onClick={() => PrinterService.printFullOrder(order.key)}>
              <PrintIcon /><span id="i18n-btn-print-full">{t('btnPrintFullOrder')}<span className="print-action-summary">{t('reviewPrintFullSummary', { n: detail.itemCount })}</span></span>
            </Button>
            <Button className="btn btn-print-bill" id="btn-review-print-bill" data-print-action="bill" onClick={() => PrinterService.printCashierOnly(order.key)}>
              <ReceiptIcon size={14} /><span>{t('btnPrintBillOnly')}</span>
            </Button>
            <Button className="btn btn-print-custom" id="btn-review-print-custom" data-print-action="stickers" onClick={() => openQuickStickerModal(order.key)}>
              <ModifyIcon size={14} /><span>{t('btnPrintCustomOption')}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>;
}

const host = document.getElementById('reviewModal');
let root: Root | undefined;
let model: ReturnType<typeof readDetail>;

Object.assign(window, {
  PosOrderDetail: {
    render(order: HistoryOrderDto, etaOrder = order, refreshItems = true) {
      if (!host) return;
      if (refreshItems || !model) model = readDetail(order);
      flushSync(() => {
        root ??= createRoot(host);
        root.render(<OrderDetail order={order} etaOrder={etaOrder} detail={model} />);
      });
    },
  },
});
