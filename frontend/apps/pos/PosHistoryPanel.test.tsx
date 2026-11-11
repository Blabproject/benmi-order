import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PosHistoryPanel } from './PosHistoryPanel';
import { createHistoryBridgeStore } from './history-store';
import { DEFAULT_SANDBOX_ORDERS, SANDBOX_REFERENCE_NOW_MS } from './history-fixtures';

describe('PosHistoryPanel integrated POS component', () => {
  it('maintains legacy IDs, bilingual parity, dine-in visibility, and support/review callbacks', () => {
    const store = createHistoryBridgeStore({
      initialLocale: 'zh-TW',
      initialDineInSupported: true,
      expandMode: 'latest',
      nowMs: SANDBOX_REFERENCE_NOW_MS
    });
    store.renderHistory(DEFAULT_SANDBOX_ORDERS, true);

    const onSelectOrder = vi.fn();
    const onOpenSupport = vi.fn();

    const renderWithSnapshot = () => {
      const snap = store.getSnapshot();
      return (
        <PosHistoryPanel
          orders={snap.orders}
          groups={snap.groups}
          filteredCount={snap.filteredCount}
          locale={snap.locale}
          loading={snap.loading}
          searchQuery={snap.searchQuery}
          filterType={snap.filterType}
          dineInSupported={snap.dineInSupported}
          expandedKeys={snap.expandedKeys}
          isFiltering={snap.isFiltering}
          isAllExpanded={snap.isAllExpanded}
          nowMs={snap.nowMs}
          onSearchChange={value => {
            store.setSearchQuery(value);
            rerender(renderWithSnapshot());
          }}
          onClearSearch={() => {
            store.clearSearch();
            rerender(renderWithSnapshot());
          }}
          onFilterChange={type => {
            store.setFilterType(type);
            rerender(renderWithSnapshot());
          }}
          onClearAllFilters={() => {
            store.clearAllFilters();
            rerender(renderWithSnapshot());
          }}
          onToggleDate={date => {
            store.toggleDateGroup(date);
            rerender(renderWithSnapshot());
          }}
          onToggleAll={() => {
            store.toggleAllGroups();
            rerender(renderWithSnapshot());
          }}
          onSelectOrder={onSelectOrder}
          onOpenSupport={onOpenSupport}
        />
      );
    };

    const { rerender, container } = render(renderWithSnapshot());

    expect(container.querySelector('#history-total-summary-badge')).toHaveTextContent('3 單');
    expect(container.querySelector('#history-group-2026-11-11 .history-date-header')).toHaveClass('expanded');
    expect(container.querySelector('#history-group-2026-11-10 .history-date-header')).not.toHaveClass('expanded');

    // View button forwards canonical key to openReview
    fireEvent.click(screen.getByRole('button', { name: /261111-005/ }));
    expect(onSelectOrder).toHaveBeenCalledWith('ORD-20261111-D05');

    // Support footer triggers BLAB contact modal callback
    fireEvent.click(screen.getByRole('button', { name: '聯繫 BLAB' }));
    expect(onOpenSupport).toHaveBeenCalledTimes(1);

    // Search shows clear button and filters across collapsed dates
    const searchInput = container.querySelector('#history-search-input') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'nguyen' } });
    expect(container.querySelector('#btn-history-search-clear')).toBeVisible();
    expect(container.querySelector('#history-total-summary-badge')).toHaveTextContent('1 / 3 單');

    // Non-matching query displays empty filter state with reset button
    fireEvent.change(searchInput, { target: { value: 'zzzzz' } });
    fireEvent.click(screen.getByRole('button', { name: '清除篩選' }));
    expect(container.querySelector('#history-total-summary-badge')).toHaveTextContent('3 單');

    // Hide dine-in filter group cleanly when tenant disables dine-in
    store.updateFilterVisibility(false);
    rerender(renderWithSnapshot());
    expect(container.querySelector('#history-filter-group')).not.toBeVisible();

    // Switch locale to Vietnamese cleanly without mixed scripts
    store.setLocale('vi');
    store.updateFilterVisibility(true);
    rerender(renderWithSnapshot());
    expect(container.querySelector('#i18n-hist-filter-dinein')).toHaveTextContent('Tại bàn');
    expect(container.querySelector('#i18n-hist-filter-takeaway')).toHaveTextContent('Mang về');
  });
});
