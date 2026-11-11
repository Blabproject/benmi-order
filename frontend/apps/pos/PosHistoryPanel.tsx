import type { HistoryOrderDto } from '@shared/contracts/api';
import {
  formatOrderTotal,
  resolveDateExpanded,
  type HistoryDateGroup,
  type HistoryFilterType
} from '@shared/contracts/history-model';
import {
  formatOrderCode,
  formatPosShortItems,
  resolveOrderDiningBadge,
  resolveOrderPaymentBadge,
  resolveOrderStatusBadge,
  resolveOrderTimestampLabel
} from '@shared/contracts/order-formatters';
import { translatePos, type PosLocale, type PosTranslationKey } from '@shared/i18n/pos-dictionary';
import {
  ArchiveIcon,
  CalendarIcon,
  ChevronDownIcon,
  ClockIcon,
  CloseIcon,
  DineInIcon,
  EyeIcon,
  FolderIcon,
  FolderOpenIcon,
  InboxIcon,
  MessageSquareIcon,
  ModifyIcon,
  ReceiptIcon,
  SearchIcon,
  TakeawayIcon
} from '@shared/ui/PosIcons';

export interface PosHistoryPanelProps {
  orders: readonly HistoryOrderDto[];
  groups: readonly HistoryDateGroup[];
  filteredCount: number;
  locale: PosLocale;
  loading: boolean;
  searchQuery: string;
  filterType: HistoryFilterType;
  dineInSupported: boolean;
  expandedKeys: ReadonlySet<string>;
  isFiltering: boolean;
  isAllExpanded: boolean;
  nowMs?: number;
  resolveOptionLabel?: (id: string) => string | undefined;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onFilterChange: (type: HistoryFilterType) => void;
  onClearAllFilters: () => void;
  onToggleDate: (date: string) => void;
  onToggleAll: () => void;
  onSelectOrder: (orderKey: string) => void;
  onOpenSupport: () => void;
}

const FILTER_OPTIONS: ReadonlyArray<{
  id: string;
  value: HistoryFilterType;
  labelKey: PosTranslationKey;
}> = [
  { id: 'i18n-hist-filter-all', value: 'all', labelKey: 'historyFilterAll' },
  { id: 'i18n-hist-filter-dinein', value: 'dine_in', labelKey: 'historyFilterDineIn' },
  { id: 'i18n-hist-filter-takeaway', value: 'takeaway', labelKey: 'historyFilterTakeaway' }
];

/** Production POS Order History panel mounted inside #view-history. */
export function PosHistoryPanel({
  orders,
  groups,
  filteredCount,
  locale,
  loading,
  searchQuery,
  filterType,
  dineInSupported,
  expandedKeys,
  isFiltering,
  isAllExpanded,
  nowMs,
  resolveOptionLabel,
  onSearchChange,
  onClearSearch,
  onFilterChange,
  onClearAllFilters,
  onToggleDate,
  onToggleAll,
  onSelectOrder,
  onOpenSupport
}: PosHistoryPanelProps) {
  const t = (key: PosTranslationKey, params?: Record<string, string | number>) => translatePos(locale, key, params);
  const totalCount = orders.length;
  const summaryText =
    filteredCount !== totalCount && isFiltering
      ? `${filteredCount} / ${totalCount} ${t('orderUnit')}`
      : `${totalCount} ${t('orderUnit')}`;

  return (
    <div className="panel">
      <div className="panel-header history-header">
        <div className="history-toolbar">
          <div className="history-search-box">
            <span className="history-search-icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <label htmlFor="history-search-input" className="visually-hidden">
              {t('searchLabel')}
            </label>
            <input
              id="history-search-input"
              type="text"
              className="history-search-input"
              value={searchQuery}
              placeholder={t('historySearchPlaceholder')}
              onChange={event => onSearchChange(event.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              id="btn-history-search-clear"
              className="history-search-clear-btn"
              onClick={onClearSearch}
              aria-label={t('historyClearSearch')}
              style={{ display: searchQuery ? 'inline-flex' : 'none' }}
            >
              <CloseIcon />
            </button>
          </div>

          <div className="history-controls-row">
            <div
              className="history-filter-group"
              id="history-filter-group"
              role="group"
              aria-label={t('filterGroupLabel')}
              style={{ display: dineInSupported ? 'inline-flex' : 'none' }}
            >
              {FILTER_OPTIONS.map(option => {
                const isActive = filterType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    id={option.id}
                    data-filter={option.value}
                    className={`history-filter-btn${isActive ? ' active' : ''}`}
                    aria-pressed={isActive}
                    onClick={() => onFilterChange(option.value)}
                  >
                    {t(option.labelKey)}
                  </button>
                );
              })}
            </div>

            <div className="history-header-actions">
              <div className="badge history-total-badge" id="history-total-summary-badge">
                {summaryText}
              </div>
              <button
                type="button"
                className="btn btn-ghost history-toggle-btn"
                id="btn-toggle-all-history"
                aria-expanded={isAllExpanded}
                onClick={onToggleAll}
              >
                <span id="btn-toggle-all-icon" className="history-toggle-icon" aria-hidden="true">
                  {isAllExpanded ? <FolderIcon /> : <FolderOpenIcon />}
                </span>
                <span id="btn-toggle-all-text">
                  {isAllExpanded ? t('btnCollapseAll') : t('btnExpandAll')}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="panel-body history-list-body" id="list-history">
        {loading && totalCount === 0 ? (
          <div className="history-loading-state" id="list-history-loading" role="status">
            {t('loading')}
          </div>
        ) : totalCount === 0 ? (
          <div className="history-empty-state">
            <div className="history-empty-icon">
              <InboxIcon />
            </div>
            <div className="history-empty-title">{t('emptyHistory')}</div>
          </div>
        ) : groups.length === 0 ? (
          <div className="history-empty-state">
            <div className="history-empty-icon">
              <SearchIcon size={24} />
            </div>
            <div className="history-empty-title">{t('historyNoSearchResults')}</div>
            <div className="history-empty-sub">{t('historyNoSearchResultsSub')}</div>
            <button
              type="button"
              className="btn btn-ghost history-clear-filter-btn"
              onClick={onClearAllFilters}
            >
              {t('btnClearFilter')}
            </button>
          </div>
        ) : (
          <>
            {groups.map(group => {
              const isExpanded = resolveDateExpanded(group.date, expandedKeys, isFiltering);
              return (
                <details
                  key={group.date}
                  className="history-date-group"
                  id={`history-group-${group.date}`}
                  open={isExpanded}
                >
                  <summary
                    className={`history-date-header${isExpanded ? ' expanded' : ''}`}
                    aria-expanded={isExpanded}
                    onClick={event => {
                      event.preventDefault();
                      onToggleDate(group.date);
                    }}
                  >
                    <div className="history-date-left">
                      <div className="history-date-icon-box">
                        <CalendarIcon />
                      </div>
                      <span className="history-date-text">{group.date}</span>
                      {group.isToday ? <span className="history-today-tag">{t('todayTag')}</span> : null}
                    </div>
                    <div className="history-date-right">
                      <span className="badge history-group-count-badge">
                        {group.orders.length} {t('orderUnit')}
                      </span>
                      <span className="badge history-group-total-badge">
                        ${group.dayTotal.toLocaleString()}
                      </span>
                      <ChevronDownIcon className={`history-chevron${isExpanded ? ' open' : ''}`} />
                    </div>
                  </summary>

                  <div
                    className="history-date-body"
                    id={`history-body-${group.date}`}
                    style={{ display: isExpanded ? 'flex' : 'none' }}
                  >
                    {group.orders.map(order => {
                      const displayCode = formatOrderCode(order.displayKey || order.key);
                      const customerName = order.customer || order.customer_name || t('defaultCustomer');
                      const statusBadge = resolveOrderStatusBadge(order.status, locale);
                      const diningBadge = resolveOrderDiningBadge(order, locale);
                      const paymentBadge = resolveOrderPaymentBadge(order, locale);
                      const itemsSummary = formatPosShortItems(order, resolveOptionLabel);
                      const totalFormatted = formatOrderTotal(order);
                      const timestampLabel = resolveOrderTimestampLabel(order, locale, nowMs);

                      const statusClassName =
                        statusBadge.tone === 'paid'
                          ? 'badge done history-status-paid'
                          : statusBadge.tone === 'picked'
                            ? 'badge done'
                            : statusBadge.tone === 'rejected'
                              ? 'badge new history-status-rejected'
                              : 'badge';

                      return (
                        <div
                          key={order.key}
                          className="history-tile"
                          onClick={() => onSelectOrder(order.key)}
                        >
                          <div className="history-tile-info">
                            <div className="history-tile-top">
                              <span className="history-tile-customer" title={customerName}>
                                {customerName}
                              </span>
                              <span className="history-tile-key">{displayCode}</span>
                              <span
                                className={`badge ${diningBadge.isDineIn ? 'badge-dine-in' : 'badge-takeaway'} history-tile-dining-badge`}
                              >
                                {diningBadge.isDineIn ? <DineInIcon /> : <TakeawayIcon />}
                                <span>{diningBadge.label}</span>
                              </span>
                              {diningBadge.isDineIn && diningBadge.roundCount > 1 ? (
                                <span className="badge badge-append history-tile-append-badge">
                                  {t('badgeAppendRound', { n: diningBadge.roundCount })}
                                </span>
                              ) : null}
                              {paymentBadge ? (
                                <span
                                  className={`tile-meta-tag${paymentBadge.isUnrefundedWarning ? ' history-payment-warning' : ''}`}
                                >
                                  {paymentBadge.label}
                                </span>
                              ) : null}
                              {diningBadge.isModified ? (
                                <span className="badge badge-modified history-tile-modified-badge">
                                  <ModifyIcon />
                                  <span>{t('badgeModifiedOrder')}</span>
                                </span>
                              ) : null}
                              <span className={statusClassName}>{statusBadge.label}</span>
                            </div>

                            <div className="history-tile-meta-row">
                              <span className="history-tile-meta">
                                <ClockIcon />
                                <span>{timestampLabel}</span>
                              </span>
                              {totalFormatted !== '-' ? (
                                <span className="history-tile-price">{totalFormatted}</span>
                              ) : null}
                            </div>

                            {itemsSummary ? (
                              <div className="history-tile-items">
                                <ReceiptIcon />
                                <span>{itemsSummary}</span>
                              </div>
                            ) : null}
                          </div>

                          <div className="history-tile-actions">
                            <button
                              type="button"
                              className="btn btn-ghost history-tile-btn"
                              onClick={event => {
                                event.stopPropagation();
                                onSelectOrder(order.key);
                              }}
                            >
                              <EyeIcon />
                              <span>{t('btnView')}</span>
                              <span className="visually-hidden"> {displayCode}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}

            <div className="history-older-card" onClick={onOpenSupport}>
              <div className="history-older-left">
                <div className="history-older-icon">
                  <ArchiveIcon />
                </div>
                <div>
                  <div className="history-older-title">
                    <span>{t('historyOlderTitle')}</span>
                  </div>
                  <div className="history-older-sub">{t('historyOlderSub')}</div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary history-older-btn"
                onClick={event => {
                  event.stopPropagation();
                  onOpenSupport();
                }}
              >
                <MessageSquareIcon />
                <span>{t('btnContactBlab')}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
