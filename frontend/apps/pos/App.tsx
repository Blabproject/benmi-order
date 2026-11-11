import { useEffect, useMemo, useRef, useState } from 'react';
import type { HistoryOrderDto } from '@shared/contracts/api';
import {
  buildHistoryGroups,
  buildOrderItemsSummary,
  extractOrderTableNumber,
  formatOrderSubmissionTime,
  formatOrderTotal,
  formatPickupTimeDisplay,
  isOrderDineIn,
  type HistoryFilterType
} from '@shared/contracts/history-model';
import { translatePos, type PosLocale, type PosTranslationKey } from '@shared/i18n/pos-dictionary';
import { fetchJson, resolveWorkerBase } from '@shared/infra/http';
import { DEFAULT_SANDBOX_ORDERS } from './history-fixtures';

export interface AppProps {
  initialOrders?: readonly HistoryOrderDto[];
  initialLocale?: PosLocale;
  nowMs?: number;
}

type LiveHistoryResponse = HistoryOrderDto[] | { orders?: HistoryOrderDto[] };

function getStatusBadge(status: string): { labelKey: PosTranslationKey; className: string } {
  if (status === 'PAID') {
    return { labelKey: 'badgePaid', className: 'pos-status-pill pos-status-paid' };
  }
  if (status === 'REJECTED' || status === 'FORCE_REJECT' || status === 'EXPIRED') {
    return { labelKey: 'badgeRejected', className: 'pos-status-pill pos-status-rejected' };
  }
  return { labelKey: 'badgePicked', className: 'pos-status-pill pos-status-picked' };
}

function formatCodeBadge(order: HistoryOrderDto): string {
  const code = String(order.displayKey || order.key || '');
  return code.startsWith('#') ? code : `#${code}`;
}

export function App({
  initialOrders = DEFAULT_SANDBOX_ORDERS,
  initialLocale = 'zh-TW',
  nowMs
}: AppProps) {
  const [locale, setLocale] = useState<PosLocale>(initialLocale);
  const [orders, setOrders] = useState<readonly HistoryOrderDto[]>(initialOrders);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<HistoryFilterType>('all');
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});
  const [selectedOrder, setSelectedOrder] = useState<HistoryOrderDto | null>(null);
  const [liveTenantId, setLiveTenantId] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState(false);

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const t = (key: PosTranslationKey, params?: Record<string, string | number>) => translatePos(locale, key, params);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const useLive = params.get('live') === '1';
    const tenantId = params.get('tenant_id')?.trim() || '';
    if (!useLive || !tenantId) return;

    setLiveTenantId(tenantId);
    setLiveLoading(true);
    setLiveError(false);

    const apiBase = resolveWorkerBase(window.location);
    fetchJson<LiveHistoryResponse>(`${apiBase}/api/orders/history-all?tenant_id=${encodeURIComponent(tenantId)}`)
      .then(data => {
        const list = Array.isArray(data) ? data : Array.isArray(data?.orders) ? data.orders : null;
        if (list) {
          setOrders(list);
        }
      })
      .catch(() => {
        setLiveError(true);
      })
      .finally(() => {
        setLiveLoading(false);
      });
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || typeof dialog.showModal !== 'function') return;
    if (selectedOrder && !dialog.open) {
      dialog.showModal();
    } else if (!selectedOrder && dialog.open) {
      dialog.close();
    }
  }, [selectedOrder]);

  const effectiveNowMs = nowMs ?? Date.now();
  const isFiltering = Boolean(searchQuery.trim() || filterType !== 'all');

  useEffect(() => {
    setCollapsedDates({});
  }, [searchQuery, filterType]);

  const { groups } = useMemo(
    () =>
      buildHistoryGroups(orders, {
        filterType,
        searchQuery,
        nowMs: effectiveNowMs
      }),
    [orders, filterType, searchQuery, effectiveNowMs]
  );

  const hasAnyOrders = orders.length > 0;
  const allGroupsExpanded =
    groups.length > 0 && groups.every(group => !(collapsedDates[group.date] ?? false));

  const handleToggleDate = (date: string) => {
    setCollapsedDates(prev => ({
      ...prev,
      [date]: !(prev[date] ?? false)
    }));
  };

  const handleSetAllExpanded = (expand: boolean) => {
    if (expand) {
      setCollapsedDates({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const group of groups) {
      next[group.date] = true;
    }
    setCollapsedDates(next);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setFilterType('all');
  };

  return (
    <div className="blab-modern-root">
      <div className="pos-sandbox-shell">
        <header className="pos-sandbox-header">
          <div>
            <span className="pos-sandbox-badge">{t('sandboxBadge')}</span>
            <h1 className="pos-sandbox-title">{t('sandboxTitle')}</h1>
            <p className="pos-sandbox-subtitle">{t('sandboxSubtitle')}</p>
          </div>
          <div className="pos-header-actions">
            <span className="pos-source-pill">
              {liveTenantId
                ? t('dataSourceLive', { tenant: liveTenantId })
                : t('dataSourceFixture')}
            </span>
            <button
              type="button"
              className="pos-btn pos-btn-primary"
              onClick={() => setLocale(prev => (prev === 'zh-TW' ? 'vi' : 'zh-TW'))}
            >
              {t('switchLang')}
            </button>
          </div>
        </header>

        <main aria-label={t('sandboxTitle')}>
          {liveLoading ? (
            <div role="status" className="pos-notice-banner">
              {t('liveLoading')}
            </div>
          ) : null}
          {liveError ? (
            <div role="status" aria-live="polite" className="pos-notice-banner">
              {t('liveLoadError')}
            </div>
          ) : null}

          {hasAnyOrders ? (
            <div className="pos-toolbar">
              <div className="pos-search-wrap">
                <svg
                  className="pos-search-icon"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <label htmlFor="pos-history-search" className="visually-hidden">
                  {t('searchLabel')}
                </label>
                <input
                  id="pos-history-search"
                  type="search"
                  className="pos-search-input"
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder={t('historySearchPlaceholder')}
                />
              </div>

              <div className="pos-filter-group" role="group" aria-label={t('filterGroupLabel')}>
                {(
                  [
                    ['all', 'historyFilterAll'],
                    ['dine_in', 'historyFilterDineIn'],
                    ['takeaway', 'historyFilterTakeaway']
                  ] as const
                ).map(([value, labelKey]) => (
                  <button
                    key={value}
                    type="button"
                    className="pos-chip"
                    aria-pressed={filterType === value}
                    onClick={() => setFilterType(value)}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>

              {isFiltering && groups.length > 0 ? (
                <button type="button" className="pos-btn" onClick={handleClearFilters}>
                  {t('btnClearFilter')}
                </button>
              ) : null}

              {groups.length > 0 ? (
                <button
                  type="button"
                  className="pos-btn"
                  aria-expanded={allGroupsExpanded}
                  onClick={() => handleSetAllExpanded(!allGroupsExpanded)}
                >
                  {allGroupsExpanded ? t('btnCollapseAll') : t('btnExpandAll')}
                </button>
              ) : null}
            </div>
          ) : null}

          {!hasAnyOrders ? (
            <section className="pos-empty-card" aria-live="polite">
              <p className="pos-empty-title">{t('emptyHistory')}</p>
            </section>
          ) : groups.length === 0 ? (
            <section className="pos-empty-card" aria-live="polite">
              <p className="pos-empty-title">{t('historyNoSearchResults')}</p>
              <p className="pos-empty-sub">{t('historyNoSearchResultsSub')}</p>
              <button type="button" className="pos-btn pos-btn-primary" onClick={handleClearFilters}>
                {t('btnClearFilter')}
              </button>
            </section>
          ) : (
            <div className="pos-group-list">
              {groups.map(group => {
                const isOpen = !(collapsedDates[group.date] ?? false);
                return (
                  <details key={group.date} className="pos-date-group" open={isOpen}>
                    <summary
                      className="pos-date-summary"
                      onClick={event => {
                        event.preventDefault();
                        handleToggleDate(group.date);
                      }}
                    >
                      <span className="pos-date-summary-left">
                        <svg
                          className="pos-chevron"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                        <span>{group.date}</span>
                        {group.isToday ? <span className="pos-today-pill">{t('todayTag')}</span> : null}
                      </span>
                      <span className="pos-date-summary-right">
                        <span className="pos-day-count">
                          {group.orders.length} {t('orderUnit')}
                        </span>
                        <span className="pos-day-total">${group.dayTotal.toLocaleString()}</span>
                      </span>
                    </summary>

                    <ul className="pos-order-list">
                      {group.orders.map(order => {
                        const statusInfo = getStatusBadge(order.status);
                        const dineIn = isOrderDineIn(order);
                        const tableNumber = extractOrderTableNumber(order);
                        const roundCount = Number(order.roundCount || order.round_count || 1);
                        const modified = Boolean(order.isModified || Number(order.is_modified) === 1);
                        const itemsSummary = buildOrderItemsSummary(order);
                        const timeLabel = dineIn
                          ? `${t('dineInTimeLabel')} ${formatOrderSubmissionTime(order)}`
                          : `${t('pickupLabel')} ${formatPickupTimeDisplay(order.time, order.createdAt, order.content, effectiveNowMs)}`;

                        return (
                          <li key={order.key} className="pos-order-row">
                            <div className="pos-order-main">
                              <div className="pos-order-top">
                                <span className="pos-order-code">{formatCodeBadge(order)}</span>
                                <span className="pos-order-customer">
                                  {order.customer || t('defaultCustomer')}
                                </span>
                                <span className={statusInfo.className}>{t(statusInfo.labelKey)}</span>
                                <span className="pos-meta-pill">
                                  {dineIn
                                    ? tableNumber
                                      ? t('tablePrefix', { table: tableNumber })
                                      : t('badgeDineIn')
                                    : t('badgeTakeaway')}
                                </span>
                                {roundCount > 1 ? (
                                  <span className="pos-meta-pill">
                                    {t('badgeAppendRound', { n: roundCount })}
                                  </span>
                                ) : null}
                                {modified ? (
                                  <span className="pos-meta-pill">{t('badgeModifiedOrder')}</span>
                                ) : null}
                              </div>
                              {itemsSummary ? <p className="pos-order-items">{itemsSummary}</p> : null}
                              <div className="pos-order-meta">{timeLabel}</div>
                            </div>

                            <div className="pos-order-side">
                              <span className="pos-order-total">{formatOrderTotal(order)}</span>
                              <button
                                type="button"
                                className="pos-btn"
                                onClick={() => setSelectedOrder(order)}
                              >
                                {t('btnView')}{' '}
                                <span className="visually-hidden">{formatCodeBadge(order)}</span>
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                );
              })}
            </div>
          )}
        </main>
      </div>

      <dialog
        ref={dialogRef}
        className="pos-dialog"
        aria-labelledby="pos-detail-dialog-title"
        onClose={() => setSelectedOrder(null)}
      >
        {selectedOrder ? (
          <div className="pos-dialog-inner">
            <div className="pos-dialog-header">
              <h2 id="pos-detail-dialog-title" className="pos-dialog-title">
                {t('detailModalTitle')} · {formatCodeBadge(selectedOrder)}
              </h2>
              <button type="button" className="pos-btn" onClick={() => setSelectedOrder(null)}>
                {t('btnClose')}
              </button>
            </div>
            <div className="pos-dialog-body">
              <div>
                <strong>{selectedOrder.customer || t('defaultCustomer')}</strong>
                {' · '}
                {t(getStatusBadge(selectedOrder.status).labelKey)}
              </div>
              <div>
                <strong>{t('totalLabel')}:</strong> {formatOrderTotal(selectedOrder)}
              </div>
              <div>
                <strong>{t('itemsSummaryLabel')}:</strong>
              </div>
              <pre className="pos-dialog-pre">
                {selectedOrder.content || buildOrderItemsSummary(selectedOrder)}
              </pre>
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
