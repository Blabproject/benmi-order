import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketplaceTenantDto } from '@shared/contracts/marketplace';
import { MarketplaceApp } from './MarketplaceApp';

const MOCK_TENANTS: MarketplaceTenantDto[] = [
  {
    tenantId: 'store-a',
    brandName: '阿明越式麵包',
    brandSubtitle: '現烤酥脆',
    brandColor: '#059669',
    logoUrl: null,
    storeAddress: '新北市土城區中央路一段10號',
    latitude: 24.985,
    longitude: 121.448,
    operatingHours: '10:00 - 20:00',
    parsedHours: { '1': [{ start: '10:00', end: '20:00' }] },
    cuisineType: 'vietnamese',
    isOpen: true,
    storeStatus: 'open',
    deliveryPolicy: '外送滿 300 免運',
    allowDineIn: true,
    allowScheduledPickup: true,
    categoriesSummary: ['法國麵包', '河粉'],
    locale: 'zh-TW',
    liffUrl: null,
    orderUrl: 'https://blabfood.app/store-a'
  },
  {
    tenantId: 'store-b',
    brandName: '老街肉燥飯',
    brandSubtitle: null,
    brandColor: '#d97706',
    logoUrl: null,
    storeAddress: '台中市南屯區公益路二段50號',
    latitude: 24.15,
    longitude: 120.64,
    operatingHours: '11:00 - 21:00',
    parsedHours: {},
    cuisineType: 'taiwanese',
    isOpen: false,
    storeStatus: 'closed',
    deliveryPolicy: null,
    allowDineIn: false,
    allowScheduledPickup: false,
    categoriesSummary: ['滷肉飯'],
    locale: 'zh-TW',
    liffUrl: null,
    orderUrl: 'https://blabfood.app/store-b'
  }
];

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('MarketplaceApp', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('uses Blab branding and never flashes a hardcoded 9 count while loading', async () => {
    const deferred = createDeferred<MarketplaceTenantDto[]>();
    render(
      <MarketplaceApp
        initialLocale="zh-TW"
        apiBaseOverride="https://platform-worker-dev.thuanmnc.workers.dev"
        loadTenants={() => deferred.promise}
      />
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Blab 美食探索');
    expect(document.title).toContain('Blab');

    const badge = document.getElementById('storesCountBadge');
    expect(badge?.textContent).toBe('載入店家資料中...');
    expect(badge?.textContent).not.toContain('9');

    deferred.resolve(MOCK_TENANTS);

    await waitFor(() => {
      expect(document.getElementById('storesCountBadge')?.textContent).toBe('共找到 2 家店家');
    });
    expect(screen.getByText('阿明越式麵包')).toBeInTheDocument();
    expect(screen.getByText('老街肉燥飯')).toBeInTheDocument();
  });

  it('switches language between zh-TW and vi with Blab title and filters stores', async () => {
    render(
      <MarketplaceApp
        initialLocale="zh-TW"
        apiBaseOverride="https://platform-worker-dev.thuanmnc.workers.dev"
        loadTenants={async () => MOCK_TENANTS}
      />
    );

    await waitFor(() => {
      expect(document.getElementById('storesCountBadge')?.textContent).toBe('共找到 2 家店家');
    });

    fireEvent.click(document.getElementById('langSwitchBtn')!);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Blab Discovery');
    expect(document.title).toContain('Blab Discovery');
    expect(document.getElementById('storesCountBadge')?.textContent).toBe('Tìm thấy 2 quán');

    fireEvent.click(screen.getByRole('button', { name: 'Thổ Thành' }));
    expect(document.getElementById('storesCountBadge')?.textContent).toBe('Tìm thấy 1 quán');
    expect(screen.getByText('阿明越式麵包')).toBeInTheDocument();
    expect(screen.queryByText('老街肉燥飯')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Chỉ quán đang mở' }));
    expect(document.getElementById('storesCountBadge')?.textContent).toBe('Tìm thấy 1 quán');
  });

  it('shows retry error state when loading fails and recovers on retry', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const loader = vi
      .fn<() => Promise<MarketplaceTenantDto[]>>()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(MOCK_TENANTS);

    render(
      <MarketplaceApp
        initialLocale="zh-TW"
        apiBaseOverride="https://platform-worker-dev.thuanmnc.workers.dev"
        loadTenants={loader}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '重新載入' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
    await waitFor(() => {
      expect(document.getElementById('storesCountBadge')?.textContent).toBe('共找到 2 家店家');
    });
    expect(loader).toHaveBeenCalledTimes(2);
    consoleErrorSpy.mockRestore();
  });

  it('opens and closes the store preview dialog', async () => {
    render(
      <MarketplaceApp
        initialLocale="zh-TW"
        apiBaseOverride="https://platform-worker-dev.thuanmnc.workers.dev"
        loadTenants={async () => MOCK_TENANTS}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('阿明越式麵包')).toBeInTheDocument();
    });

    const detailButtons = screen.getAllByRole('button', { name: '店家詳情' });
    fireEvent.click(detailButtons[0]!);

    const dialog = document.getElementById('storePreviewModal') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(screen.getByText('外送滿 300 免運')).toBeInTheDocument();

    fireEvent.click(document.getElementById('modalCloseBtn')!);
    expect(dialog.hasAttribute('open')).toBe(false);
  });
});
