import type { ItemAnalyticsSummaryDto, ReportRange } from '@shared/contracts/api';
import type { NormalizedReportRow } from '@shared/contracts/reports-model';
import { translatePos, type PosLocale, type PosTranslationKey } from '@shared/i18n/pos-dictionary';
import { AlertTriangleIcon, ArrowLeftIcon, BarChart3Icon, RefreshCwIcon } from '@shared/ui/PosIcons';

export interface PosReportsPanelProps {
  range: ReportRange;
  data: ItemAnalyticsSummaryDto | null;
  rows: readonly NormalizedReportRow[];
  dateRangeLabel: string;
  locale: PosLocale;
  loading: boolean;
  error: boolean;
  onSelectRange: (range: ReportRange) => void;
  onRefresh: () => void;
  onBackToSettings: () => void;
}

const RANGE_OPTIONS: ReadonlyArray<{
  id: string;
  value: ReportRange;
  labelKey: PosTranslationKey;
}> = [
  { id: 'i18n-range-today', value: 'today', labelKey: 'rangeToday' },
  { id: 'i18n-range-7d', value: '7d', labelKey: 'range7d' },
  { id: 'i18n-range-30d', value: '30d', labelKey: 'range30d' }
];

function rankBadgeClass(rank: number): string {
  if (rank === 1) return 'reports-rank-badge rank-1';
  if (rank === 2) return 'reports-rank-badge rank-2';
  if (rank === 3) return 'reports-rank-badge rank-3';
  return 'reports-rank-badge';
}

/** Read-only POS Item Sales & Analytics workspace mounted inside #view-reports. */
export function PosReportsPanel({
  range,
  data,
  rows,
  dateRangeLabel,
  locale,
  loading,
  error,
  onSelectRange,
  onRefresh,
  onBackToSettings
}: PosReportsPanelProps) {
  const t = (key: PosTranslationKey, params?: Record<string, string | number>) => translatePos(locale, key, params);

  const topItemName = data?.topItem?.itemName || '-';
  const topItemSalesText = data?.topItem
    ? `${data.topItem.totalQuantity.toLocaleString()} ${t('portionUnit')} · $${data.topItem.totalSales.toLocaleString()}`
    : '-';
  const totalSoldText = `${(data?.totalItemsSold ?? 0).toLocaleString()} ${t('portionUnit')}`;
  const totalRevenueText = `$${(data?.totalRevenue ?? 0).toLocaleString()}`;
  const totalOrdersText = `${(data?.totalOrders ?? 0).toLocaleString()} ${t('orderUnit')}`;
  const itemCountText = `${rows.length} ${t('itemUnit')}`;

  return (
    <>
      <div className="reports-header">
        <div>
          <h2 className="reports-title" id="i18n-reports-title">
            {t('reportsTitle')}
          </h2>
          <p className="reports-subtitle" id="i18n-reports-sub">
            {t('reportsSub')}
          </p>
        </div>

        <div className="reports-controls">
          <div className="report-range-group" role="group" aria-label={t('reportsRangeGroupLabel')}>
            {RANGE_OPTIONS.map(option => {
              const active = range === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  id={option.id}
                  data-range={option.value}
                  aria-pressed={active}
                  className={active ? 'report-range-btn active' : 'report-range-btn'}
                  onClick={() => onSelectRange(option.value)}
                >
                  {t(option.labelKey)}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            id="btn-refresh-reports"
            className="btn btn-ghost reports-action-btn icon-only"
            onClick={onRefresh}
            aria-label={t('reportsRefresh')}
            title={t('reportsRefresh')}
          >
            <RefreshCwIcon size={17} />
          </button>

          <button
            type="button"
            id="i18n-btn-back-settings"
            className="btn btn-ghost reports-action-btn"
            onClick={onBackToSettings}
          >
            <ArrowLeftIcon size={15} />
            <span>{t('reportsBackSettings')}</span>
          </button>
        </div>
      </div>

      <div className="reports-kpi-grid">
        <div className="kpi-card reports-kpi-card">
          <div className="reports-kpi-label" id="i18n-kpi-top-item">
            {t('kpiTopItem')}
          </div>
          <div className="reports-kpi-value top-item" id="kpi-top-item-name">
            {topItemName}
          </div>
          <div className="reports-kpi-sub top-sales" id="kpi-top-item-sales">
            {topItemSalesText}
          </div>
        </div>

        <div className="kpi-card reports-kpi-card">
          <div className="reports-kpi-label" id="i18n-kpi-total-sold">
            {t('kpiTotalSold')}
          </div>
          <div className="reports-kpi-value sold" id="kpi-total-sold">
            {totalSoldText}
          </div>
          <div className="reports-kpi-sub" id="kpi-date-range">
            {dateRangeLabel}
          </div>
        </div>

        <div className="kpi-card reports-kpi-card">
          <div className="reports-kpi-label" id="i18n-kpi-total-revenue">
            {t('kpiTotalRevenue')}
          </div>
          <div className="reports-kpi-value revenue" id="kpi-total-revenue">
            {totalRevenueText}
          </div>
          <div className="reports-kpi-sub" id="i18n-revenue-sub">
            {t('revenueSub')}
          </div>
        </div>

        <div className="kpi-card reports-kpi-card">
          <div className="reports-kpi-label" id="i18n-kpi-total-orders">
            {t('kpiTotalOrders')}
          </div>
          <div className="reports-kpi-value orders" id="kpi-total-orders">
            {totalOrdersText}
          </div>
          <div className="reports-kpi-sub" id="i18n-completed-orders-sub">
            {t('completedOrdersSub')}
          </div>
        </div>
      </div>

      <div className="reports-card">
        <div className="reports-card-header">
          <span className="reports-card-title" id="i18n-table-title">
            {t('reportsTableTitle')}
          </span>
          <span className="reports-item-count" id="reports-item-count">
            {itemCountText}
          </span>
        </div>

        <div id="reports-table-container" className="reports-table-scroll">
          {loading ? (
            <div className="reports-state-box">
              <div className="reports-spinner" aria-hidden="true" />
              <div className="reports-state-title">{t('loading')}</div>
            </div>
          ) : error ? (
            <div className="reports-state-box error" role="alert">
              <AlertTriangleIcon size={28} />
              <div className="reports-state-title">{t('reportsLoadError')}</div>
              <button
                type="button"
                id="btn-retry-reports"
                className="btn btn-ghost reports-action-btn"
                onClick={onRefresh}
              >
                <RefreshCwIcon size={15} />
                <span>{t('reportsRetry')}</span>
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="reports-state-box">
              <BarChart3Icon size={30} />
              <div className="reports-state-title">{t('emptyReports')}</div>
              <div className="reports-state-sub">{t('reportsSub')}</div>
            </div>
          ) : (
            <table className="reports-table">
              <thead>
                <tr>
                  <th style={{ width: '58px', textAlign: 'center' }}>{t('colRank')}</th>
                  <th>{t('colItem')}</th>
                  <th>{t('colCategory')}</th>
                  <th style={{ textAlign: 'right' }}>{t('colQuantity')}</th>
                  <th style={{ textAlign: 'right' }}>{t('colSales')}</th>
                  <th style={{ width: '180px' }}>{t('colRatio')}</th>
                  <th style={{ minWidth: '220px' }}>{t('colOptions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={`${row.rank}-${row.itemName}`}>
                    <td style={{ textAlign: 'center' }}>
                      <span className={rankBadgeClass(row.rank)}>#{row.rank}</span>
                    </td>
                    <td>
                      <div className="reports-item-name">{row.itemName}</div>
                      <div className="reports-item-appearances">
                        {t('reportsAppearances', { count: row.orderAppearances })}
                      </div>
                    </td>
                    <td>
                      <span className="reports-category-pill">
                        {row.categoryName || t('reportsDefaultCategory')}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="reports-qty-value">{row.totalQuantity.toLocaleString()}</span>
                      <span className="reports-qty-unit">{t('portionUnit')}</span>
                    </td>
                    <td className="reports-sales-value">${row.totalSales.toLocaleString()}</td>
                    <td>
                      <div className="reports-ratio-wrap">
                        <div className="reports-ratio-track">
                          <div className="reports-ratio-fill" style={{ width: `${row.barPercent}%` }} />
                        </div>
                        <span className="reports-ratio-label">{row.ratioPercent}%</span>
                      </div>
                    </td>
                    <td>
                      {row.topOptions.length === 0 ? (
                        <span style={{ color: '#cbd5e1' }}>-</span>
                      ) : (
                        <div className="reports-options-list">
                          {row.topOptions.map(opt => (
                            <span key={opt.name} className="reports-option-chip">
                              <span>{opt.name}</span>
                              <span className="reports-option-count">x{opt.count}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
