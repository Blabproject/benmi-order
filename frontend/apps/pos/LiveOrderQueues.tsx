import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { HistoryOrderDto } from '@shared/contracts/api';
import { extractOrderChannelLabel } from '@shared/contracts/history-model';
import { resolveOrderPaymentBadge } from '@shared/contracts/order-formatters';
import { ClockIcon, DineInIcon, EyeIcon, InboxIcon, ModifyIcon, ReceiptIcon, TagIcon, TakeawayIcon } from '@shared/ui/PosIcons';
import { Badge } from '@shared/ui/badge';
import { Button } from '@shared/ui/button';
import { Card } from '@shared/ui/card';

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
declare function setDiningFilter(filter: Filter): void;
declare function setLiveMobileStation(station: Station): void;
declare function updateStatus(key: string, status: NextStatus): Promise<boolean>;
declare function renderAll(): void;

const pos = window as Window & { currentLang?: string };

function DiningFilters() {
  return <>
    <div className="dining-filter-group" role="group" aria-label={t('diningOption')}>
      <Button className="dining-filter-btn active" id="filter-btn-all" variant="ghost"
        aria-pressed="true" onClick={() => setDiningFilter('all')}>
        <span id="i18n-filter-all">{t('filterAll')}</span>
        <Badge className="filter-count-badge" id="filter-count-all" variant="secondary">0</Badge>
      </Button>
      <Button className="dining-filter-btn" id="filter-btn-takeaway" variant="ghost"
        aria-pressed="false" onClick={() => setDiningFilter('takeaway')}>
        <TakeawayIcon size={14} />
        <span id="i18n-filter-takeaway">{t('filterTakeaway')}</span>
        <Badge className="filter-count-badge" id="filter-count-takeaway" variant="secondary">0</Badge>
      </Button>
      <Button className="dining-filter-btn" id="filter-btn-dine-in" variant="ghost"
        aria-pressed="false" onClick={() => setDiningFilter('dine_in')}>
        <DineInIcon size={14} />
        <span id="i18n-filter-dinein">{t('filterDineIn')}</span>
        <Badge className="filter-count-badge" id="filter-count-dinein" variant="secondary">0</Badge>
      </Button>
    </div>
    <div className="dining-filter-stats" id="dining-filter-stats">
      <Badge className="stat-pill takeaway" id="stat-pill-takeaway" variant="secondary">{t('badgeTakeaway')} 0</Badge>
      <Badge className="stat-pill dine-in" id="stat-pill-dinein" variant="purple">{t('badgeDineIn')} 0</Badge>
    </div>
  </>;
}

function MobileStations() {
  return <>
    <Button className="live-mobile-tab active" id="live-mobile-tab-pending" variant="ghost" role="tab"
      aria-controls="live-panel-pending" aria-selected="true" tabIndex={0} onClick={() => setLiveMobileStation('pending')}>
      <span id="i18n-live-mobile-pending">{t('panelLeftTitle')}</span>
      <Badge className="live-mobile-count" id="live-mobile-count-pending" variant="secondary">0</Badge>
    </Button>
    <Button className="live-mobile-tab" id="live-mobile-tab-ready" variant="ghost" role="tab"
      aria-controls="live-panel-ready" aria-selected="false" tabIndex={-1} onClick={() => setLiveMobileStation('ready')}>
      <span id="i18n-live-mobile-ready">{t('panelRightTitle')}</span>
      <Badge className="live-mobile-count" id="live-mobile-count-ready" variant="secondary">0</Badge>
    </Button>
  </>;
}

function CheckIcon({ ready = false }: { ready?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ready ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></> : <path d="m7 13 4 4L21 7m-19 6 4 4m9-10L9 13" />}
  </svg>;
}

function EmptyQueue({ station }: { station: Station }) {
  const pending = station === 'pending';
  return <Card flush dashed className="empty-state-card ps-shadow-none">
    <div className={`empty-state-icon-circle ${pending ? 'pending' : 'accepted'}`}>
      {pending ? <InboxIcon size={26} /> : <CheckIcon ready />}
    </div>
    <div className="empty-state-title">{t(pending ? 'emptyLivePendingTitle' : 'emptyLiveAcceptedTitle')}</div>
    <div className="empty-state-desc">{t(pending ? 'emptyLivePendingSub' : 'emptyLiveAcceptedSub')}</div>
  </Card>;
}

function QueueAction({ order, station, dineIn }: { order: HistoryOrderDto; station: Station; dineIn: boolean }) {
  const { key, status } = order;
  if (station === 'pending' && status === 'NEW') {
    return <Button variant="default" className="btn tile-action-btn btn-action-review" onClick={event => {
      event.stopPropagation();
      openReview(key);
    }}><EyeIcon size={16} /><span>{t('btnReview')}</span></Button>;
  }
  if (station === 'pending' && status !== 'ACCEPTED') {
    return <Button variant="secondary" className="btn tile-action-btn btn-action-waiting" disabled><span>{t('btnWaitingReply')}</span></Button>;
  }
  const ready = station === 'pending';
  const next = ready ? 'DONE' : dineIn ? 'PAID' : 'PICKED_UP';
  const variant = ready ? 'ready' : dineIn ? 'paid' : 'pickup';
  const busy = processingKeys.has(key);

  return <Button variant="default" className={`btn tile-action-btn btn-action-${variant}`} disabled={busy} aria-busy={busy || undefined}
    onClick={event => {
      event.stopPropagation();
      // The same status controller serves the detail dialog. React owns this
      // button, so the controller receives no DOM element to mutate.
      void updateStatus(key, next);
      renderAll();
    }}>
    {!busy && <CheckIcon ready={ready} />}
    <span>{t(busy ? 'processing' : ready ? 'btnReady' : dineIn ? 'btnPaid' : 'btnPickedUp')}</span>
  </Button>;
}

function OrderTile({ order, station, dineIn }: { order: HistoryOrderDto; station: Station; dineIn: boolean }) {
  const pending = station === 'pending';
  const isNew = pending && order.status === 'NEW';
  const isUnreadAppend = pending && unacknowledgedAppends.has(order.key);
  const locale = pos.currentLang === 'vi' ? 'vi' : 'zh-TW';
  const table = getOrderTableNumber(order);
  const tableLabel = table ? ` · ${locale === 'vi' ? 'Bàn' : '桌號'} ${table}` : '';
  const channelLabel = extractOrderChannelLabel(order);
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

  return <Card flush className={`tile ${dineIn ? 'is-dine-in' : 'is-takeaway'}${isNew ? ' is-new' : ''}${isUnreadAppend ? ' is-append-new' : ''}`}
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
        {isNew && <Badge variant="destructive" shape="rounded" className="tile-badge badge-new-pulse">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M20 13 11 22 2 13V2h11l9 9Z" /><path d="M7 7h.01" strokeLinecap="round" />
          </svg>{t('badgeNewOrder')}
        </Badge>}
        {payment && <span className="tile-meta-tag">{payment.label}</span>}
        {modified && <Badge variant="amber" shape="rounded" className="tile-badge badge-modified"><ModifyIcon />{t('badgeModifiedOrder')}</Badge>}
        {dineIn
          ? <Badge variant="purple" shape="rounded" className="tile-badge badge-dine-in"><DineInIcon size={12} />{t('badgeDineIn')}{tableLabel}</Badge>
          : <Badge variant="success" shape="rounded" className="tile-badge badge-takeaway"><TakeawayIcon size={12} />{t('badgeTakeaway')}</Badge>}
        {channelLabel && (
          <Badge variant="outline" shape="rounded" className="tile-badge badge-channel-tag" data-testid="live-order-channel-tag" title={channelLabel}>
            <TagIcon size={12} /><span className="tile-badge-label">{channelLabel}</span>
          </Badge>
        )}
        {dineIn && rounds > 1 && <Badge variant="amber" shape="rounded" className="tile-badge badge-append">{t('badgeAppendRound', { n: rounds })}</Badge>}
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
  </Card>;
}

function Queue({ orders, station, filter }: { orders: HistoryOrderDto[]; station: Station; filter: Filter }) {
  const entries = orders.map(order => ({ order, dineIn: isOrderDineIn(order) }))
    .filter(({ dineIn }) => filter === 'all' || (filter === 'dine_in' ? dineIn : !dineIn));
  if (!entries.length) return <EmptyQueue station={station} />;
  return entries.map(({ order, dineIn }) => <OrderTile key={order.key} order={order} station={station} dineIn={dineIn} />);
}

const hosts = [document.getElementById('list-left'), document.getElementById('list-right')];
const roots: (Root | undefined)[] = [];

const diningFilters = document.getElementById('dining-filter-bar');
const stationTabs = document.getElementById('live-mobile-tabs');
// The existing POS controller updates counts and keyboard selection on these hosts.
// Commit the controls before its DOMContentLoaded handlers run.
flushSync(() => {
  if (diningFilters) createRoot(diningFilters).render(<DiningFilters />);
  if (stationTabs) createRoot(stationTabs).render(<MobileStations />);
});

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
