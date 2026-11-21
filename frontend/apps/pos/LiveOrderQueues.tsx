import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { HistoryOrderDto } from '@shared/contracts/api';
import { resolveOrderPaymentBadge } from '@shared/contracts/order-formatters';
import { ClockIcon, DineInIcon, EyeIcon, InboxIcon, ModifyIcon, ReceiptIcon, TakeawayIcon } from '@shared/ui/PosIcons';

type Filter = 'all' | 'dine_in' | 'takeaway';
type Station = 'pending' | 'ready';
type NextStatus = 'DONE' | 'PAID' | 'PICKED_UP';

declare const OrderCode: { format: (key: string) => string };
declare const processingKeys: Set<string>;
declare const unacknowledgedAppends: Map<string, unknown>;
declare function t(key: string, params?: Record<string, string | number>): string;
declare function isOrderDineIn(order: HistoryOrderDto): boolean;
declare function getOrderTableNumber(order: HistoryOrderDto): string;
declare function isOrderElapsedMode(order: HistoryOrderDto): boolean;
declare function formatLiveOrderTimeDisplay(order: HistoryOrderDto): string;
declare function formatSubmissionElapsedTime(order: HistoryOrderDto): string;
declare function formatEta(time: string): string;
declare function formatOrderTotal(order: HistoryOrderDto): string;
declare function countItemsFromContent(content: string): number;
declare function openReview(key: string): void;
declare function updateStatus(key: string, status: NextStatus): Promise<boolean>;
declare function renderAll(): void;

const pos = window as Window & { currentLang?: string };

function CheckIcon({ ready = false }: { ready?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ready ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></> : <path d="m7 13 4 4L21 7m-19 6 4 4m9-10L9 13" />}
  </svg>;
}

function EmptyQueue({ station }: { station: Station }) {
  const pending = station === 'pending';
  return <div className="empty-state-card">
    <div className={`empty-state-icon-circle ${pending ? 'pending' : 'accepted'}`}>
      {pending ? <InboxIcon size={26} /> : <CheckIcon ready />}
    </div>
    <div className="empty-state-title">{t(pending ? 'emptyLivePendingTitle' : 'emptyLiveAcceptedTitle')}</div>
    <div className="empty-state-desc">{t(pending ? 'emptyLivePendingSub' : 'emptyLiveAcceptedSub')}</div>
  </div>;
}

function QueueAction({ order, station, dineIn }: { order: HistoryOrderDto; station: Station; dineIn: boolean }) {
  const { key, status } = order;
  if (station === 'pending' && status === 'NEW') {
    return <button type="button" className="btn tile-action-btn btn-action-review" onClick={event => {
      event.stopPropagation();
      openReview(key);
    }}><EyeIcon size={16} /><span>{t('btnReview')}</span></button>;
  }
  if (station === 'pending' && status !== 'ACCEPTED') {
    return <button type="button" className="btn tile-action-btn btn-action-waiting" disabled><span>{t('btnWaitingReply')}</span></button>;
  }
  const ready = station === 'pending';
  const next = ready ? 'DONE' : dineIn ? 'PAID' : 'PICKED_UP';
  const variant = ready ? 'ready' : dineIn ? 'paid' : 'pickup';
  const busy = processingKeys.has(key);

  return <button type="button" className={`btn tile-action-btn btn-action-${variant}`} disabled={busy} aria-busy={busy || undefined}
    onClick={event => {
      event.stopPropagation();
      // The same status controller serves the detail dialog. React owns this
      // button, so the controller receives no DOM element to mutate.
      void updateStatus(key, next);
      renderAll();
    }}>
    {!busy && <CheckIcon ready={ready} />}
    <span>{t(busy ? 'processing' : ready ? 'btnReady' : dineIn ? 'btnPaid' : 'btnPickedUp')}</span>
  </button>;
}

function OrderTile({ order, station, dineIn }: { order: HistoryOrderDto; station: Station; dineIn: boolean }) {
  const pending = station === 'pending';
  const isNew = pending && order.status === 'NEW';
  const isUnreadAppend = pending && unacknowledgedAppends.has(order.key);
  const locale = pos.currentLang === 'vi' ? 'vi' : 'zh-TW';
  const table = getOrderTableNumber(order);
  const tableLabel = table ? ` · ${locale === 'vi' ? 'Bàn' : '桌號'} ${table}` : '';
  const isElapsed = isOrderElapsedMode(order);
  const eta = isElapsed ? formatSubmissionElapsedTime(order) : formatEta(order.time);
  const rounds = Number(order.round_count || order.roundCount) || 1;
  const modified = order.is_modified === 1 || order.isModified === true;
  const payment = resolveOrderPaymentBadge(order, locale);
  const customer = order.customer || t('defaultCustomer');
  const orderCode = OrderCode.format(order.displayKey || order.key);
  const itemCount = countItemsFromContent(order.content);
  const total = formatOrderTotal(order);

  function open() {
    if (pending) unacknowledgedAppends.delete(order.key);
    openReview(order.key);
  }

  return <div className={`tile ${dineIn ? 'is-dine-in' : 'is-takeaway'}${isNew ? ' is-new' : ''}${isUnreadAppend ? ' is-append-new' : ''}`}
    data-order-key={order.key} role="group" tabIndex={0} aria-label={`${orderCode} · ${customer}`}
    aria-keyshortcuts="Enter Space" onClick={open}
    onKeyDown={event => {
      if (event.target !== event.currentTarget || event.repeat || event.nativeEvent.isComposing || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      open();
    }}>
    <div className="tile-info">
      <div className="tile-top">
        <span className="tile-customer" title={customer}>{customer}</span>
        <span className="tile-order-key">{orderCode}</span>
        {isNew && <span className="tile-badge badge-new-pulse">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M20 13 11 22 2 13V2h11l9 9Z" /><path d="M7 7h.01" strokeLinecap="round" />
          </svg>{t('badgeNewOrder')}
        </span>}
        {payment && <span className="tile-meta-tag">{payment.label}</span>}
        {modified && <span className="tile-badge badge-modified"><ModifyIcon />{t('badgeModifiedOrder')}</span>}
        {dineIn
          ? <span className="tile-badge badge-dine-in"><DineInIcon size={12} />{t('badgeDineIn')}{tableLabel}</span>
          : <span className="tile-badge badge-takeaway"><TakeawayIcon size={12} />{t('badgeTakeaway')}</span>}
        {dineIn && rounds > 1 && <span className="tile-badge badge-append">{t('badgeAppendRound', { n: rounds })}</span>}
      </div>
      <div className="tile-meta-row">
        <span className="tile-meta-tag"><span className="tile-meta-icon"><ClockIcon /></span>
          <span className="tile-pickup-time">{formatLiveOrderTimeDisplay(order)}</span>
        </span>
        <span className={`tile-meta-tag tile-eta ${isElapsed ? 'tile-eta-dinein' : 'tile-eta-pickup'}`}>{eta}</span>
      </div>
      <div className="tile-count-row">
        <div className="tile-item-summary">
          <span className="tile-item-count"><span className="tile-meta-icon"><ReceiptIcon /></span>
            {t('tileItemCount', { count: itemCount > 0 ? itemCount : '?' })}
          </span>
        </div>
        {total !== '-' && <span className="tile-price">{total}</span>}
      </div>
    </div>
    <div className="tile-actions"><QueueAction order={order} station={station} dineIn={dineIn} /></div>
  </div>;
}

function Queue({ orders, station, filter }: { orders: HistoryOrderDto[]; station: Station; filter: Filter }) {
  const entries = orders.map(order => ({ order, dineIn: isOrderDineIn(order) }))
    .filter(({ dineIn }) => filter === 'all' || (filter === 'dine_in' ? dineIn : !dineIn));
  if (!entries.length) return <EmptyQueue station={station} />;
  return entries.map(({ order, dineIn }) => <OrderTile key={order.key} order={order} station={station} dineIn={dineIn} />);
}

const hosts = [document.getElementById('list-left'), document.getElementById('list-right')];
const roots: (Root | undefined)[] = [];

function renderQueues(left: React.ReactNode, right: React.ReactNode) {
  const scroll = hosts.map(host => host && host.clientHeight > 0 ? host.scrollTop : null);
  flushSync(() => {
    [left, right].forEach((children, index) => {
      const host = hosts[index];
      if (!host) return;
      const root = roots[index] ??= createRoot(host);
      root.render(children);
    });
  });
  hosts.forEach((host, index) => {
    const position = scroll[index];
    if (host && position != null) host.scrollTop = position;
  });
}

Object.assign(window, {
  PosLiveOrders: {
    render(pending: HistoryOrderDto[], ready: HistoryOrderDto[], filter: Filter) {
      renderQueues(<Queue station="pending" orders={pending} filter={filter} />, <Queue station="ready" orders={ready} filter={filter} />);
    },
    error(message: string) {
      const style = { textAlign: 'center', padding: 22, color: '#d32f2f' } as const;
      renderQueues(<div style={style} role="alert">{message}</div>, <div style={style}>-</div>);
    }
  }
});
