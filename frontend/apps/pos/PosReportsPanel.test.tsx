import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ItemAnalyticsSummaryDto } from '@shared/contracts/api';
import { PosReportsPanel } from './PosReportsPanel';
import { createReportsBridgeStore } from './reports-store';

const SAMPLE_REPORT: ItemAnalyticsSummaryDto = {
  tenantId: 'demo',
  range: 'today',
  startDate: '2026-11-14',
  endDate: '2026-11-14',
  totalItemsSold: 12,
  totalRevenue: 1120,
  totalOrders: 7,
  topItem: {
    itemName: '香雞排',
    categoryName: '炸物',
    totalQuantity: 8,
    totalSales: 680,
    orderAppearances: 6,
    optionsBreakdown: { 特調胡椒: 5, 小辣: 3 }
  },
  items: [
    {
      itemName: '香雞排',
      categoryName: '炸物',
      totalQuantity: 8,
      totalSales: 680,
      orderAppearances: 6,
      optionsBreakdown: { 特調胡椒: 5, 小辣: 3 }
    },
    {
      itemName: '煉乳銀絲卷',
      categoryName: '',
      totalQuantity: 4,
      totalSales: 440,
      orderAppearances: 4
    }
  ]
};

describe('PosReportsPanel integrated POS component', () => {
  it('renders KPI summary, ranked items, options breakdown, and bilingual zh-TW/vi switches', () => {
    const store = createReportsBridgeStore({ initialLocale: 'zh-TW' });
    store.renderReports(SAMPLE_REPORT);

    const onSelectRange = vi.fn();
    const onRefresh = vi.fn();
    const onBackToSettings = vi.fn();

    const renderWithSnapshot = () => {
      const snap = store.getSnapshot();
      return (
        <PosReportsPanel
          range={snap.range}
          data={snap.data}
          rows={snap.rows}
          dateRangeLabel={snap.dateRangeLabel}
          locale={snap.locale}
          loading={snap.loading}
          error={snap.error}
          onSelectRange={onSelectRange}
          onRefresh={onRefresh}
          onBackToSettings={onBackToSettings}
        />
      );
    };

    const { rerender, container } = render(renderWithSnapshot());

    expect(container.querySelector('#kpi-top-item-name')).toHaveTextContent('香雞排');
    expect(container.querySelector('#kpi-total-sold')).toHaveTextContent('12 份');
    expect(container.querySelector('#kpi-total-revenue')).toHaveTextContent('$1,120');
    expect(container.querySelector('#kpi-total-orders')).toHaveTextContent('7 單');
    expect(container.querySelector('#reports-item-count')).toHaveTextContent('2 品項');
    expect(screen.getByText('出現在 6 單')).toBeVisible();
    expect(screen.getByText('特調胡椒')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '近 7 天' }));
    expect(onSelectRange).toHaveBeenCalledWith('7d');

    fireEvent.click(screen.getByRole('button', { name: '重新整理報表' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '返回設定' }));
    expect(onBackToSettings).toHaveBeenCalledTimes(1);

    store.setLocale('vi');
    rerender(renderWithSnapshot());
    expect(container.querySelector('#i18n-reports-title')).toHaveTextContent('Phân tích doanh số & Doanh thu món');
    expect(container.querySelector('#i18n-range-7d')).toHaveTextContent('7 ngày qua');
    expect(screen.getByText('Xuất hiện trong 6 đơn')).toBeVisible();
    expect(screen.getByText('Món chính')).toBeVisible();
  });

  it('renders clean empty and retryable error states', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(
      <PosReportsPanel
        range="today"
        data={{
          tenantId: 'demo',
          range: 'today',
          startDate: '2026-11-14',
          endDate: '2026-11-14',
          totalItemsSold: 0,
          totalRevenue: 0,
          totalOrders: 0,
          topItem: null,
          items: []
        }}
        rows={[]}
        dateRangeLabel="2026-11-14"
        locale="vi"
        loading={false}
        error={false}
        onSelectRange={vi.fn()}
        onRefresh={onRefresh}
        onBackToSettings={vi.fn()}
      />
    );

    expect(screen.getByText('Không có dữ liệu bán hàng trong khoảng thời gian này')).toBeVisible();

    rerender(
      <PosReportsPanel
        range="today"
        data={null}
        rows={[]}
        dateRangeLabel="-"
        locale="vi"
        loading={false}
        error={true}
        onSelectRange={vi.fn()}
        onRefresh={onRefresh}
        onBackToSettings={vi.fn()}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Tải báo cáo thất bại, vui lòng thử lại sau.');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
