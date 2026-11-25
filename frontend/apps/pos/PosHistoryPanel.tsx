import { isDeliveryOrder } from '@shared/contracts/history-model';
import type { HistoryOrderDto } from '@shared/contracts/api';
import {
  extractOrderChannelLabel,
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
  resolveOrderTimestampLabel,
  type OrderStatusTone
} from '@shared/contracts/order-formatters';
import { translatePos, type PosLocale, type PosTranslationKey } from '@shared/i18n/pos-dictionary';
import { Badge, type BadgeVariant } from '@shared/ui/badge';
import { Button } from '@shared/ui/button';
import { Card } from '@shared/ui/card';
import { Input } from '@shared/ui/input';
import {
  ArchiveIcon,
  CalendarIcon,
  ChevronDownIcon,
  ClockIcon,
  CloseIcon,
  DeliveryIcon,
  DineInIcon,
  EyeIcon,
  FolderIcon,
  FolderOpenIcon,
  InboxIcon,
  MessageSquareIcon,
  ModifyIcon,
  ReceiptIcon,
  SearchIcon,
  TagIcon,
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

const STATUS_BADGE_VARIANTS: Record<OrderStatusTone, BadgeVariant> = {
  paid: 'purple',
  picked: 'default',
  rejected: 'destructive',
  neutral: 'secondary'
};

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
    <Card
      flush
      className="ps-flex ps-h-full ps-min-h-0 ps-w-full ps-max-w-full ps-flex-col ps-overflow-hidden ps-rounded-2xl max-[680px]:ps-rounded-xl"
    >
      <div
        data-slot="card-header"
        className="ps-flex ps-flex-col ps-gap-3 ps-border-0 ps-border-b ps-border-solid ps-border-slate-200 ps-bg-white ps-px-5 ps-py-4 max-[680px]:ps-gap-2 max-[680px]:ps-px-3 max-[680px]:ps-py-2.5"
      >
        <div className="history-toolbar ps-flex ps-w-full ps-flex-wrap ps-items-center ps-justify-between ps-gap-3 max-[860px]:ps-flex-col max-[860px]:ps-items-stretch max-[860px]:ps-gap-2.5 max-[680px]:ps-gap-2">
          <div className="history-search-box ps-relative ps-flex ps-min-w-[240px] ps-max-w-[360px] ps-flex-1 ps-items-center max-[860px]:ps-w-full max-[860px]:ps-min-w-0 max-[860px]:ps-max-w-full">
            <span
              className="ps-pointer-events-none ps-absolute ps-left-3 ps-flex ps-items-center ps-justify-center ps-text-slate-400"
              aria-hidden="true"
            >
              <SearchIcon />
            </span>
            <label htmlFor="history-search-input" className="visually-hidden">
              {t('searchLabel')}
            </label>
            <Input
              id="history-search-input"
              type="text"
              className="ps-h-12 ps-min-h-12 ps-w-full ps-rounded-[10px] ps-border-[1.5px] ps-border-solid ps-border-slate-200 ps-bg-slate-50 ps-pl-9 ps-pr-12 ps-text-[length:var(--pos-text-meta)] ps-font-semibold ps-text-slate-900 ps-transition-colors placeholder:ps-text-slate-400 focus:ps-border-[#00b900] focus:ps-bg-white focus:ps-outline-none focus:ps-ring-[3px] focus:ps-ring-[#00b900]/15"
              value={searchQuery}
              placeholder={t('historySearchPlaceholder')}
              onChange={event => onSearchChange(event.target.value)}
              autoComplete="off"
            />
            <Button
              type="button"
              id="btn-history-search-clear"
              variant="ghost"
              className="ps-absolute ps-right-0 ps-h-12 ps-w-12 ps-cursor-pointer ps-items-center ps-justify-center ps-rounded-full ps-border-0 ps-bg-transparent ps-p-0 ps-text-slate-400 ps-transition-colors hover:ps-text-slate-900"
              onClick={onClearSearch}
              aria-label={t('historyClearSearch')}
              style={{ display: searchQuery ? 'inline-flex' : 'none' }}
            >
              <CloseIcon />
            </Button>
          </div>

          <div className="history-controls-row ps-flex ps-flex-1 ps-items-center ps-justify-end ps-gap-3 max-[860px]:ps-w-full max-[860px]:ps-flex-wrap max-[860px]:ps-justify-between max-[860px]:ps-gap-2.5 max-[680px]:ps-flex-col max-[680px]:ps-items-stretch max-[680px]:ps-gap-2">
            <div
              className="ps-box-border ps-inline-flex ps-items-center ps-gap-[3px] ps-rounded-[10px] ps-bg-slate-100 ps-p-[3px] max-[680px]:ps-w-full"
              id="history-filter-group"
              role="group"
              aria-label={t('filterGroupLabel')}
              style={{ display: dineInSupported ? 'inline-flex' : 'none' }}
            >
              {FILTER_OPTIONS.map(option => {
                const isActive = filterType === option.value;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    id={option.id}
                    data-filter={option.value}
                    variant={isActive ? 'default' : 'ghost'}
                    className={`history-filter-btn${isActive ? ' active' : ''} ps-box-border ps-inline-flex ps-select-none ps-cursor-pointer ps-items-center ps-justify-center ps-rounded-lg ps-border-0 ps-px-3.5 ps-py-1.5 ps-text-[length:var(--pos-text-meta)] ps-transition-all max-[680px]:ps-flex-1 max-[680px]:ps-px-1.5 ${
                      isActive
                        ? 'ps-bg-white ps-font-extrabold ps-text-slate-900 ps-shadow-sm'
                        : 'ps-bg-transparent ps-font-bold ps-text-slate-500 hover:ps-text-slate-900'
                    }`}
                    aria-pressed={isActive}
                    onClick={() => onFilterChange(option.value)}
                  >
                    {t(option.labelKey)}
                  </Button>
                );
              })}
            </div>

            <div className="history-header-actions ps-ml-auto ps-flex ps-items-center ps-gap-2.5 max-[680px]:ps-ml-0 max-[680px]:ps-w-full max-[680px]:ps-justify-between">
              <Badge
                id="history-total-summary-badge"
                variant="default"
                className="ps-box-border ps-min-h-10 ps-px-3.5 ps-py-1.5 ps-text-[length:var(--pos-text-meta)] ps-font-black"
              >
                {summaryText}
              </Badge>
              <Button
                type="button"
                variant="outline"
                className="ps-box-border ps-inline-flex ps-shrink-0 ps-cursor-pointer ps-items-center ps-justify-center ps-gap-2 ps-whitespace-nowrap ps-rounded-[10px] ps-border-[1.5px] ps-border-solid ps-border-slate-200 ps-bg-white ps-px-3.5 ps-text-[length:var(--pos-text-meta)] ps-font-extrabold ps-text-slate-700 ps-shadow-sm ps-transition-colors hover:ps-border-slate-300 hover:ps-bg-slate-50 hover:ps-text-slate-900 max-[680px]:ps-px-3"
                id="btn-toggle-all-history"
                aria-expanded={isAllExpanded}
                onClick={onToggleAll}
              >
                <span
                  id="btn-toggle-all-icon"
                  className="ps-flex ps-items-center ps-justify-center ps-text-slate-500"
                  aria-hidden="true"
                >
                  {isAllExpanded ? <FolderIcon /> : <FolderOpenIcon />}
                </span>
                <span id="btn-toggle-all-text">
                  {isAllExpanded ? t('btnCollapseAll') : t('btnExpandAll')}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div
        className="ps-flex ps-min-h-0 ps-min-w-0 ps-flex-1 ps-flex-col ps-gap-3 ps-overflow-auto ps-p-3.5 max-[680px]:ps-gap-2 max-[680px]:ps-px-1.5 max-[680px]:ps-py-2"
        id="list-history"
      >
        {loading && totalCount === 0 ? (
          <div className="ps-p-6 ps-text-center ps-text-slate-500" id="list-history-loading" role="status">
            {t('loading')}
          </div>
        ) : totalCount === 0 ? (
          <Card
            dashed
            className="ps-my-3 ps-flex ps-flex-col ps-items-center ps-justify-center ps-gap-2 ps-rounded-2xl ps-border-[1.5px] ps-px-5 ps-py-12 ps-text-center ps-shadow-none"
          >
            <div className="ps-mb-1.5 ps-flex ps-h-14 ps-w-14 ps-items-center ps-justify-center ps-rounded-[14px] ps-border ps-border-solid ps-border-slate-200 ps-bg-slate-50 ps-text-slate-400">
              <InboxIcon />
            </div>
            <div className="ps-text-[length:var(--pos-text-body)] ps-font-extrabold ps-text-slate-800">
              {t('emptyHistory')}
            </div>
          </Card>
        ) : groups.length === 0 ? (
          <Card
            dashed
            className="ps-my-3 ps-flex ps-flex-col ps-items-center ps-justify-center ps-gap-2 ps-rounded-2xl ps-border-[1.5px] ps-px-5 ps-py-12 ps-text-center ps-shadow-none"
          >
            <div className="ps-mb-1.5 ps-flex ps-h-14 ps-w-14 ps-items-center ps-justify-center ps-rounded-[14px] ps-border ps-border-solid ps-border-slate-200 ps-bg-slate-50 ps-text-slate-400">
              <SearchIcon size={24} />
            </div>
            <div className="ps-text-[length:var(--pos-text-body)] ps-font-extrabold ps-text-slate-800">
              {t('historyNoSearchResults')}
            </div>
            <div className="ps-mb-2 ps-text-[length:var(--pos-text-meta)] ps-text-slate-500">
              {t('historyNoSearchResultsSub')}
            </div>
            <Button
              type="button"
              variant="outline"
              className="ps-inline-flex ps-cursor-pointer ps-items-center ps-justify-center ps-rounded-lg ps-border-[1.5px] ps-border-solid ps-border-slate-300 ps-bg-white ps-px-3.5 ps-py-1.5 ps-text-[length:var(--pos-text-meta)] ps-font-bold ps-text-slate-800 ps-transition-colors hover:ps-border-slate-400 hover:ps-bg-slate-100"
              onClick={onClearAllFilters}
            >
              {t('btnClearFilter')}
            </Button>
          </Card>
        ) : (
          <>
            {groups.map(group => {
              const isExpanded = resolveDateExpanded(group.date, expandedKeys, isFiltering);
              return (
                <details
                  key={group.date}
                  className="history-date-group ps-flex ps-flex-col ps-gap-2"
                  id={`history-group-${group.date}`}
                  open={isExpanded}
                >
                  <summary
                    className={`history-date-header${isExpanded ? ' expanded' : ''} ps-box-border ps-flex ps-min-h-[52px] ps-cursor-pointer ps-select-none ps-flex-wrap ps-items-center ps-justify-between ps-gap-x-3 ps-gap-y-2 ps-rounded-[14px] ps-border-[1.5px] ps-border-solid ps-px-[18px] ps-py-3.5 ps-shadow-sm ps-transition-all active:ps-scale-[0.995] max-[680px]:ps-gap-2 max-[680px]:ps-rounded-[10px] max-[680px]:ps-px-3 max-[680px]:ps-py-2.5 ${
                      isExpanded
                        ? 'ps-border-[#00b900] ps-bg-[#fafffa]'
                        : 'ps-border-slate-200 ps-bg-white hover:ps-border-slate-300 hover:ps-bg-[#fcfdfe]'
                    }`}
                    aria-expanded={isExpanded}
                    onClick={event => {
                      event.preventDefault();
                      onToggleDate(group.date);
                    }}
                  >
                    <div className="ps-flex ps-items-center ps-gap-3 max-[680px]:ps-min-w-0 max-[680px]:ps-flex-1 max-[680px]:ps-gap-2 max-[680px]:ps-overflow-hidden">
                      <div className="ps-flex ps-h-[34px] ps-w-[34px] ps-shrink-0 ps-items-center ps-justify-center ps-rounded-lg ps-border ps-border-solid ps-border-slate-200 ps-bg-slate-100 ps-text-slate-600 max-[680px]:ps-h-7 max-[680px]:ps-w-7 max-[680px]:ps-rounded-md">
                        <CalendarIcon />
                      </div>
                      <span className="ps-text-[length:var(--pos-text-body)] ps-font-black ps-text-slate-900 max-[680px]:ps-whitespace-nowrap max-[680px]:ps-text-sm">
                        {group.date}
                      </span>
                      {group.isToday ? (
                        <Badge
                          variant="blue"
                          shape="rounded"
                          className="history-today-tag ps-px-2 ps-py-[3px] ps-text-[length:var(--pos-text-meta)] ps-font-black ps-tracking-[0.3px] max-[680px]:ps-px-1.5 max-[680px]:ps-py-0.5 max-[680px]:ps-text-[11px]"
                        >
                          {t('todayTag')}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="ps-flex ps-shrink-0 ps-items-center ps-gap-2.5 max-[680px]:ps-gap-1.5">
                      <Badge
                        variant="secondary"
                        className="history-group-count-badge ps-px-2.5 ps-py-1 ps-text-[length:var(--pos-text-meta)] ps-font-extrabold max-[680px]:ps-px-1.5 max-[680px]:ps-py-0.5 max-[680px]:ps-text-xs"
                      >
                        {group.orders.length} {t('orderUnit')}
                      </Badge>
                      <Badge
                        variant="default"
                        className="history-group-total-badge ps-px-2.5 ps-py-1 ps-text-[length:var(--pos-text-meta)] ps-font-black max-[680px]:ps-px-1.5 max-[680px]:ps-py-0.5 max-[680px]:ps-text-xs"
                      >
                        ${group.dayTotal.toLocaleString()}
                      </Badge>
                      <ChevronDownIcon
                        className={`ps-transition-transform ps-duration-200 ${isExpanded ? 'ps-rotate-180 ps-text-[#00b900]' : 'ps-text-slate-500'}`}
                      />
                    </div>
                  </summary>

                  <div
                    className="ps-flex ps-flex-col ps-gap-2 ps-pl-0.5"
                    id={`history-body-${group.date}`}
                    style={{ display: isExpanded ? 'flex' : 'none' }}
                  >
                    {group.orders.map(order => {
                      const displayCode = formatOrderCode(order.displayKey || order.key);
                      const customerName = order.customer || order.customer_name || t('defaultCustomer');
                      const statusBadge = resolveOrderStatusBadge(order.status, locale);
                      const diningBadge = resolveOrderDiningBadge(order, locale);
                      const channelLabel = extractOrderChannelLabel(order);
                      const paymentBadge = resolveOrderPaymentBadge(order, locale);
                      const itemsSummary = formatPosShortItems(order, resolveOptionLabel);
                      const totalFormatted = formatOrderTotal(order);
                      const timestampLabel = resolveOrderTimestampLabel(order, locale, nowMs);

                      return (
                        <Card
                          key={order.key}
                          flush
                          className="history-tile ps-box-border ps-flex ps-min-h-[80px] ps-cursor-pointer ps-items-stretch ps-overflow-hidden ps-rounded-[14px] ps-transition-all hover:ps-border-slate-300 hover:ps-shadow max-[680px]:ps-min-h-0 max-[680px]:ps-flex-col max-[680px]:ps-gap-1.5 max-[680px]:ps-px-3.5 max-[680px]:ps-py-3"
                          onClick={() => onSelectOrder(order.key)}
                        >
                          <div className="ps-box-border ps-flex ps-min-w-0 ps-flex-1 ps-flex-col ps-justify-center ps-gap-[5px] ps-overflow-hidden ps-px-3.5 ps-py-2.5 max-[680px]:ps-w-full max-[680px]:ps-p-0">
                            <div className="ps-flex ps-w-full ps-min-w-0 ps-flex-nowrap ps-items-center ps-gap-[5px] ps-overflow-hidden max-[680px]:ps-flex-wrap max-[680px]:ps-gap-x-2 max-[680px]:ps-gap-y-[5px]">
                              <span
                                className="ps-max-w-[110px] ps-min-w-0 ps-flex-[0_1_auto] ps-truncate ps-text-[length:var(--pos-text-body)] ps-font-black ps-text-slate-900 max-[680px]:ps-max-w-none max-[680px]:ps-text-[14.5px] max-[680px]:ps-font-extrabold"
                                title={customerName}
                              >
                                {customerName}
                              </span>
                              <span className="ps-shrink-0 ps-whitespace-nowrap ps-font-mono ps-text-[length:var(--pos-text-meta)] ps-font-extrabold ps-text-slate-500">
                                {displayCode}
                              </span>
                              <Badge
                                variant={isDeliveryOrder(order) ? 'blue' : diningBadge.isDineIn ? 'purple' : 'success'}
                                className="ps-ml-1 ps-px-1.5 ps-py-0.5 ps-text-[length:var(--pos-text-meta)]"
                              >
                                {isDeliveryOrder(order) ? <DeliveryIcon /> : diningBadge.isDineIn ? <DineInIcon /> : <TakeawayIcon />}
                                <span>{diningBadge.label}</span>
                              </Badge>
                              {channelLabel ? (
                                <Badge
                                  variant="outline"
                                  data-testid="history-order-channel-tag"
                                  title={channelLabel}
                                  className="ps-max-w-[140px] ps-border-sky-200 ps-bg-sky-50 ps-px-1.5 ps-py-0.5 ps-text-[length:var(--pos-text-meta)] ps-text-sky-700"
                                >
                                  <TagIcon size={12} className="ps-shrink-0" />
                                  <span className="ps-truncate">{channelLabel}</span>
                                </Badge>
                              ) : null}
                              {diningBadge.isDineIn && diningBadge.roundCount > 1 ? (
                                <Badge
                                  variant="purple"
                                  shape="square"
                                  className="ps-border-[1.5px] ps-border-purple-300 ps-bg-purple-100 ps-px-1.5 ps-py-0.5 ps-text-[length:var(--pos-text-meta)] ps-text-purple-700"
                                >
                                  {t('badgeAppendRound', { n: diningBadge.roundCount })}
                                </Badge>
                              ) : null}
                              {paymentBadge ? (
                                <Badge
                                  variant={paymentBadge.isUnrefundedWarning ? 'destructive' : 'outline'}
                                  shape="rounded"
                                  className="ps-px-1.5 ps-py-0.5 ps-text-[length:var(--pos-text-meta)]"
                                >
                                  {paymentBadge.label}
                                </Badge>
                              ) : null}
                              {diningBadge.isModified ? (
                                <Badge
                                  variant="amber"
                                  className="ps-ml-1 ps-px-1.5 ps-py-0.5 ps-text-[length:var(--pos-text-meta)]"
                                >
                                  <ModifyIcon />
                                  <span>{t('badgeModifiedOrder')}</span>
                                </Badge>
                              ) : null}
                              <Badge
                                variant={STATUS_BADGE_VARIANTS[statusBadge.tone]}
                                className="ps-ml-auto ps-px-1.5 ps-py-0.5 ps-text-[length:var(--pos-text-meta)]"
                              >
                                {statusBadge.label}
                              </Badge>
                            </div>

                            <div className="ps-flex ps-w-full ps-min-w-0 ps-items-center ps-justify-between ps-gap-2 max-[680px]:ps-pt-0.5 max-[680px]:ps-text-[12.5px]">
                              <span className="ps-inline-flex ps-min-w-0 ps-items-center ps-gap-1 ps-whitespace-nowrap ps-text-[length:var(--pos-text-meta)] ps-font-extrabold ps-text-slate-600">
                                <ClockIcon />
                                <span>{timestampLabel}</span>
                              </span>
                              {totalFormatted !== '-' ? (
                                <span className="ps-shrink-0 ps-whitespace-nowrap ps-text-[length:var(--pos-text-meta)] ps-font-black ps-text-[#00b900] max-[680px]:ps-text-base">
                                  {totalFormatted}
                                </span>
                              ) : null}
                            </div>

                            {itemsSummary ? (
                              <div className="ps-flex ps-min-w-0 ps-flex-1 ps-items-center ps-gap-1.5 ps-text-[length:var(--pos-text-meta)] ps-font-bold ps-text-slate-500 max-[680px]:ps-text-[13px] max-[680px]:ps-leading-snug">
                                <ReceiptIcon className="ps-shrink-0" />
                                <span className="ps-min-w-0 ps-truncate max-[680px]:ps-line-clamp-2 max-[680px]:ps-whitespace-normal">
                                  {itemsSummary}
                                </span>
                              </div>
                            ) : null}
                          </div>

                          <div className="ps-box-border ps-flex ps-w-[90px] ps-min-w-[75px] ps-max-w-[100px] ps-shrink-0 ps-flex-col ps-items-stretch ps-self-stretch max-[680px]:ps-hidden">
                            <Button
                              type="button"
                              variant="ghost"
                              className="ps-box-border ps-flex ps-h-full ps-w-full ps-flex-1 ps-cursor-pointer ps-items-center ps-justify-center ps-gap-2 ps-rounded-none ps-rounded-r-[13px] ps-border-0 ps-bg-slate-50 ps-px-2.5 ps-py-1.5 ps-text-center ps-text-[length:var(--pos-text-meta)] ps-font-black ps-text-slate-600 ps-transition-colors hover:ps-bg-slate-100 hover:ps-text-slate-900 active:ps-bg-slate-200"
                              onClick={event => {
                                event.stopPropagation();
                                onSelectOrder(order.key);
                              }}
                            >
                              <EyeIcon />
                              <span>{t('btnView')}</span>
                              <span className="visually-hidden"> {displayCode}</span>
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </details>
              );
            })}

            <Card
              flush
              dashed
              className="ps-mb-5 ps-mt-3.5 ps-flex ps-cursor-pointer ps-flex-wrap ps-items-center ps-justify-between ps-gap-x-4 ps-gap-y-2 ps-rounded-[14px] ps-border-[1.5px] ps-border-slate-300 ps-bg-gradient-to-br ps-from-slate-50 ps-to-slate-200/75 ps-px-5 ps-py-4 ps-shadow-none ps-transition-all hover:ps-border-[#00b900] hover:ps-bg-[#f7fee7] hover:ps-bg-none max-[640px]:ps-flex-col max-[640px]:ps-items-stretch max-[640px]:ps-text-left"
              onClick={onOpenSupport}
            >
              <div className="ps-flex ps-items-center ps-gap-3.5">
                <div className="ps-flex ps-h-10 ps-w-10 ps-shrink-0 ps-items-center ps-justify-center ps-rounded-[10px] ps-border ps-border-solid ps-border-slate-200 ps-bg-slate-100 ps-text-slate-600">
                  <ArchiveIcon />
                </div>
                <div>
                  <div className="ps-flex ps-flex-wrap ps-items-center ps-gap-1.5 ps-text-[length:var(--pos-text-body)] ps-font-black ps-text-slate-800">
                    <span>{t('historyOlderTitle')}</span>
                  </div>
                  <div className="ps-mt-0.5 ps-text-[length:var(--pos-text-meta)] ps-font-semibold ps-text-slate-500">
                    {t('historyOlderSub')}
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="default"
                className="ps-inline-flex ps-cursor-pointer ps-items-center ps-justify-center ps-gap-2 ps-whitespace-nowrap ps-rounded-[10px] ps-border-0 ps-bg-[#00b900] ps-px-[18px] ps-py-2.5 ps-text-[length:var(--pos-text-meta)] ps-font-black ps-text-white ps-shadow-sm ps-transition-colors hover:ps-bg-[#009900] max-[640px]:ps-justify-center"
                onClick={event => {
                  event.stopPropagation();
                  onOpenSupport();
                }}
              >
                <MessageSquareIcon />
                <span>{t('btnContactBlab')}</span>
              </Button>
            </Card>
          </>
        )}
      </div>
    </Card>
  );
}
