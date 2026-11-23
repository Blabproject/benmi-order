import type { RuntimeEnvironment } from '@shared/infra/http';

export type MarketplaceLocale = 'zh-TW' | 'vi';

export type MarketplaceRegionFilter =
  | 'all'
  | 'tucheng'
  | 'xindian'
  | 'banqiao'
  | 'xinzhuang'
  | 'taichung';

export type MarketplaceCuisineFilter = 'all' | 'vietnamese' | 'taiwanese' | 'snack';

export type MarketplaceViewMode = 'list' | 'map';

export interface OperatingShiftDto {
  start: string;
  end: string;
}

export interface MarketplaceTenantDto {
  tenantId: string;
  brandName: string;
  brandSubtitle: string | null;
  brandColor: string;
  logoUrl: string | null;
  storeAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  operatingHours: string | null;
  parsedHours: Record<string, OperatingShiftDto[]>;
  cuisineType: string;
  isOpen: boolean;
  storeStatus: 'open' | 'busy' | 'paused' | 'closed' | string;
  deliveryPolicy: string | null;
  allowDineIn: boolean;
  allowScheduledPickup: boolean;
  categoriesSummary: string[];
  locale: string;
  liffUrl: string | null;
  orderUrl: string;
  distanceKm?: number | null;
}

export interface MarketplaceTenantsResponseDto {
  success: boolean;
  count?: number;
  data?: MarketplaceTenantDto[];
  error?: string;
}

export interface MarketplaceFilterState {
  search: string;
  region: MarketplaceRegionFilter;
  cuisine: MarketplaceCuisineFilter;
  onlyOpen: boolean;
}

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface WeeklyScheduleRow {
  dayKey: string;
  dayIndex: number;
  isToday: boolean;
  shifts: OperatingShiftDto[];
}

const REGION_ADDRESS_PATTERNS: Record<Exclude<MarketplaceRegionFilter, 'all'>, readonly string[]> = {
  tucheng: ['土城'],
  xindian: ['新店'],
  banqiao: ['板橋'],
  xinzhuang: ['新莊'],
  taichung: ['台中', '南屯']
};

const CUSTOMER_ORIGINS: Record<RuntimeEnvironment, string> = {
  dev: 'https://dev.benmi-order.pages.dev',
  staging: 'https://staging.benmi-order.pages.dev',
  prod: 'https://benmi-order.pages.dev'
};

/** Validates and builds the customer ordering URL for a marketplace tenant. */
export function buildMarketplaceOrderUrl(
  tenantId: string,
  configuredUrl: string | null | undefined,
  apiBase: string
): string {
  if (configuredUrl) {
    try {
      const candidate = new URL(configuredUrl);
      if (candidate.protocol === 'https:' && !candidate.username && !candidate.password) {
        return candidate.toString();
      }
    } catch {
      // Fall back to environment-matched customer origin below.
    }
  }
  const origin = apiBase.includes('-dev.')
    ? CUSTOMER_ORIGINS.dev
    : apiBase.includes('-staging.')
      ? CUSTOMER_ORIGINS.staging
      : CUSTOMER_ORIGINS.prod;
  return `${origin}/?tenant_id=${encodeURIComponent(tenantId)}`;
}

/** Validates an external image URL so only https or safe relative paths are rendered. */
export function resolveSafeLogoUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('./') || trimmed.startsWith('/')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Computes Haversine great-circle distance in kilometers. */
export function calculateDistanceKm(
  lat1: number | null | undefined,
  lon1: number | null | undefined,
  lat2: number | null | undefined,
  lon2: number | null | undefined
): number | null {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

/** Returns Taiwan (UTC+8) day of week string ("0" = Sun .. "6" = Sat). */
export function getTaiwanDayOfWeek(nowMs: number = Date.now()): string {
  const taiwanTime = new Date(nowMs + 8 * 3600000);
  return String(taiwanTime.getUTCDay());
}

/** Resolves card summary operating hours string in Taiwan time (UTC+8). */
export function resolveCardOperatingHours(
  operatingHours: string | null | undefined,
  parsedHours: Record<string, OperatingShiftDto[]> | null | undefined,
  nowMs: number = Date.now()
): { kind: 'hours'; value: string } | { kind: 'rest' } {
  const currentDay = getTaiwanDayOfWeek(nowMs);
  if (parsedHours && typeof parsedHours === 'object') {
    const shifts = parsedHours[currentDay];
    if (Array.isArray(shifts)) {
      if (shifts.length > 0) {
        return { kind: 'hours', value: shifts.map((s) => `${s.start} - ${s.end}`).join(', ') };
      }
      return { kind: 'rest' };
    }
  }
  const isJson = typeof operatingHours === 'string' && operatingHours.trim().startsWith('{');
  if (operatingHours && !isJson) {
    const firstLine = operatingHours.split('\n')[0]?.trim();
    if (firstLine) return { kind: 'hours', value: firstLine };
  }
  return { kind: 'hours', value: '11:00 - 21:00' };
}

/** Builds structured Monday-to-Sunday weekly schedule rows for the detail dialog. */
export function buildWeeklyScheduleRows(
  parsedHours: Record<string, OperatingShiftDto[]> | null | undefined,
  nowMs: number = Date.now()
): WeeklyScheduleRow[] | null {
  if (!parsedHours || typeof parsedHours !== 'object') return null;
  const currentDay = getTaiwanDayOfWeek(nowMs);
  const dayOrder = ['1', '2', '3', '4', '5', '6', '0'];
  return dayOrder.map((dayKey) => ({
    dayKey,
    dayIndex: Number.parseInt(dayKey, 10),
    isToday: dayKey === currentDay,
    shifts: Array.isArray(parsedHours[dayKey]) ? parsedHours[dayKey]! : []
  }));
}

/** Attaches distanceKm and sorts nearest-first when user coordinates are available. */
export function attachAndSortTenantsByDistance(
  tenants: readonly MarketplaceTenantDto[],
  userCoords: Coordinates | null
): MarketplaceTenantDto[] {
  if (!userCoords) {
    return tenants.map((tenant) => ({ ...tenant, distanceKm: null }));
  }
  const withDistance = tenants.map((tenant) => ({
    ...tenant,
    distanceKm:
      tenant.latitude != null && tenant.longitude != null
        ? calculateDistanceKm(userCoords.lat, userCoords.lon, tenant.latitude, tenant.longitude)
        : null
  }));
  withDistance.sort((a, b) => {
    if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
    if (a.distanceKm != null) return -1;
    if (b.distanceKm != null) return 1;
    return 0;
  });
  return withDistance;
}

/** Filters tenants by search query, region, cuisine, and open-only status. */
export function filterMarketplaceTenants(
  tenants: readonly MarketplaceTenantDto[],
  filters: MarketplaceFilterState
): MarketplaceTenantDto[] {
  const search = filters.search.trim().toLowerCase();
  return tenants.filter((tenant) => {
    if (search) {
      const matchName = (tenant.brandName || '').toLowerCase().includes(search);
      const matchSub = (tenant.brandSubtitle || '').toLowerCase().includes(search);
      const matchAddr = (tenant.storeAddress || '').toLowerCase().includes(search);
      const matchCuisine = (tenant.cuisineType || '').toLowerCase().includes(search);
      const matchCats =
        Array.isArray(tenant.categoriesSummary) &&
        tenant.categoriesSummary.some((cat) => cat.toLowerCase().includes(search));
      if (!matchName && !matchSub && !matchAddr && !matchCuisine && !matchCats) {
        return false;
      }
    }

    if (filters.region !== 'all') {
      const addr = tenant.storeAddress || '';
      const patterns = REGION_ADDRESS_PATTERNS[filters.region];
      if (!patterns.some((token) => addr.includes(token))) {
        return false;
      }
    }

    if (filters.cuisine !== 'all' && tenant.cuisineType !== filters.cuisine) {
      return false;
    }

    if (filters.onlyOpen && !tenant.isOpen) {
      return false;
    }

    return true;
  });
}

/** Builds a Google Maps navigation link from store address or coordinates. */
export function buildGoogleMapsDirectionsUrl(tenant: MarketplaceTenantDto): string {
  if (tenant.storeAddress) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(tenant.storeAddress)}`;
  }
  if (tenant.latitude != null && tenant.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${tenant.latitude},${tenant.longitude}`;
  }
  return '#';
}
