import { describe, expect, it } from 'vitest';
import {
  attachAndSortTenantsByDistance,
  buildGoogleMapsDirectionsUrl,
  buildMarketplaceOrderUrl,
  buildWeeklyScheduleRows,
  calculateDistanceKm,
  filterMarketplaceTenants,
  resolveCardOperatingHours,
  resolveSafeLogoUrl,
  type MarketplaceTenantDto
} from './marketplace';

const SAMPLE_TENANTS: MarketplaceTenantDto[] = [
  {
    tenantId: 'benmi',
    brandName: 'Benmi 越式法國麵包',
    brandSubtitle: '酥脆手作麵包',
    brandColor: '#059669',
    logoUrl: 'https://example.com/benmi.png',
    storeAddress: '新北市土城區學府路一段100號',
    latitude: 24.985,
    longitude: 121.448,
    operatingHours: null,
    parsedHours: {
      '1': [{ start: '10:30', end: '20:00' }],
      '2': []
    },
    cuisineType: 'vietnamese',
    isOpen: true,
    storeStatus: 'open',
    deliveryPolicy: '滿 500 外送',
    allowDineIn: true,
    allowScheduledPickup: true,
    categoriesSummary: ['法國麵包', '越式咖啡'],
    locale: 'zh-TW',
    liffUrl: null,
    orderUrl: 'https://blabfood.app/benmi'
  },
  {
    tenantId: 'taichung-noodle',
    brandName: '南屯老街麵館',
    brandSubtitle: null,
    brandColor: '#d97706',
    logoUrl: null,
    storeAddress: '台中市南屯區大墩路88號',
    latitude: 24.145,
    longitude: 120.648,
    operatingHours: '09:00 - 19:00',
    parsedHours: {},
    cuisineType: 'taiwanese',
    isOpen: false,
    storeStatus: 'closed',
    deliveryPolicy: null,
    allowDineIn: false,
    allowScheduledPickup: false,
    categoriesSummary: ['乾拌麵'],
    locale: 'zh-TW',
    liffUrl: null,
    orderUrl: ''
  }
];

describe('marketplace contracts', () => {
  it('validates configured HTTPS order URLs and falls back to environment origin', () => {
    expect(buildMarketplaceOrderUrl('benmi', 'https://blabfood.app/benmi', 'https://benmi-worker-official.thuanmnc.workers.dev')).toBe(
      'https://blabfood.app/benmi'
    );
    expect(buildMarketplaceOrderUrl('demo', 'javascript:alert(1)', 'https://platform-worker-dev.thuanmnc.workers.dev')).toBe(
      'https://dev.benmi-order.pages.dev/?tenant_id=demo'
    );
    expect(buildMarketplaceOrderUrl('demo', null, 'https://platform-worker-staging.thuanmnc.workers.dev')).toBe(
      'https://staging.benmi-order.pages.dev/?tenant_id=demo'
    );
  });

  it('allows only https or safe relative logo URLs', () => {
    expect(resolveSafeLogoUrl('https://cdn.example.com/logo.png')).toBe('https://cdn.example.com/logo.png');
    expect(resolveSafeLogoUrl('./benmi_logo.png')).toBe('./benmi_logo.png');
    expect(resolveSafeLogoUrl('javascript:alert(1)')).toBeNull();
    expect(resolveSafeLogoUrl('http://insecure.example.com/a.png')).toBeNull();
  });

  it('computes Haversine distance and sorts nearest stores first', () => {
    const dist = calculateDistanceKm(24.985, 121.448, 24.145, 120.648);
    expect(dist).not.toBeNull();
    expect(dist!).toBeGreaterThan(100);

    const sorted = attachAndSortTenantsByDistance(
      [SAMPLE_TENANTS[1]!, SAMPLE_TENANTS[0]!],
      { lat: 24.984, lon: 121.447 }
    );
    expect(sorted[0]?.tenantId).toBe('benmi');
    expect(sorted[0]?.distanceKm!).toBeLessThan(1);
    expect(sorted[1]?.tenantId).toBe('taichung-noodle');
  });

  it('filters by search, region, cuisine, and onlyOpen', () => {
    expect(
      filterMarketplaceTenants(SAMPLE_TENANTS, {
        search: '咖啡',
        region: 'all',
        cuisine: 'all',
        onlyOpen: false
      }).map((t) => t.tenantId)
    ).toEqual(['benmi']);

    expect(
      filterMarketplaceTenants(SAMPLE_TENANTS, {
        search: '',
        region: 'taichung',
        cuisine: 'taiwanese',
        onlyOpen: false
      }).map((t) => t.tenantId)
    ).toEqual(['taichung-noodle']);

    expect(
      filterMarketplaceTenants(SAMPLE_TENANTS, {
        search: '',
        region: 'all',
        cuisine: 'all',
        onlyOpen: true
      }).map((t) => t.tenantId)
    ).toEqual(['benmi']);
  });

  it('resolves Taiwan (UTC+8) operating hours and weekly schedule', () => {
    // 2026-11-23T04:00:00Z = Monday 12:00 in Taiwan (dayKey = "1")
    const mondayUtcMs = Date.UTC(2026, 10, 23, 4, 0, 0);
    expect(resolveCardOperatingHours(null, SAMPLE_TENANTS[0]!.parsedHours, mondayUtcMs)).toEqual({
      kind: 'hours',
      value: '10:30 - 20:00'
    });

    // Tuesday (dayKey = "2") is empty shifts => rest
    const tuesdayUtcMs = Date.UTC(2026, 10, 24, 4, 0, 0);
    expect(resolveCardOperatingHours(null, SAMPLE_TENANTS[0]!.parsedHours, tuesdayUtcMs)).toEqual({
      kind: 'rest'
    });

    const weekly = buildWeeklyScheduleRows(SAMPLE_TENANTS[0]!.parsedHours, mondayUtcMs);
    expect(weekly?.[0]?.dayKey).toBe('1');
    expect(weekly?.[0]?.isToday).toBe(true);
    expect(weekly?.[1]?.dayKey).toBe('2');
    expect(weekly?.[1]?.shifts).toEqual([]);
  });

  it('builds Google Maps directions URLs safely', () => {
    expect(buildGoogleMapsDirectionsUrl(SAMPLE_TENANTS[0]!)).toContain(
      encodeURIComponent('新北市土城區學府路一段100號')
    );
  });
});
