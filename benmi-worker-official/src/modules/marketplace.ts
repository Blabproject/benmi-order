import { customerOrderConfig } from '../utils/order-domain';
import { Env } from '../types/env';
import { json } from '../utils/http';
import { parseOperatingHours } from './bootstrap';
import { createTenantRepository } from '../repositories';

export interface MarketplaceTenantItem {
  tenantId: string;
  brandName: string;
  brandSubtitle: string | null;
  brandColor: string;
  logoUrl: string | null;
  storeAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  operatingHours: string | null;
  parsedHours: Record<string, Array<{ start: string; end: string }>>;
  cuisineType: string;
  isOpen: boolean;
  storeStatus: 'open' | 'busy' | 'paused' | 'closed';
  deliveryPolicy: string | null;
  allowDineIn: boolean;
  allowScheduledPickup: boolean;
  categoriesSummary: string[];
  locale: string;
  liffUrl: string | null;
  orderUrl: string;
}

/**
 * Checks if a restaurant is currently open based on store_status, parsed operating hours, and Taiwan time (UTC+8).
 */
export function isStoreCurrentlyOpen(
  storeStatus: string | undefined | null,
  parsedHours: Record<string, Array<{ start: string; end: string }>>,
  dateObj: Date = new Date()
): boolean {
  if (storeStatus === 'paused' || storeStatus === 'closed') {
    return false;
  }

  // Calculate current Taiwan time (UTC+8)
  const taiwanTime = new Date(dateObj.getTime() + 8 * 3600000);
  const dayOfWeek = String(taiwanTime.getUTCDay()); // 0 = Sun, 1 = Mon ... 6 = Sat
  const currentHours = String(taiwanTime.getUTCHours()).padStart(2, '0');
  const currentMinutes = String(taiwanTime.getUTCMinutes()).padStart(2, '0');
  const currentTimeStr = `${currentHours}:${currentMinutes}`;

  const shifts = parsedHours[dayOfWeek];
  const timeValue = taiwanTime.getUTCHours() + taiwanTime.getUTCMinutes() / 60;

  if (!shifts || !Array.isArray(shifts) || shifts.length === 0) {
    // If no specific shifts defined, fallback to 11:00 - 21:00
    return currentTimeStr >= '11:00' && currentTimeStr <= '21:00';
  }

  // 1. Check shifts starting today
  for (const shift of shifts) {
    if (shift && shift.start && shift.end) {
      const [sH, sM] = shift.start.split(':').map(Number);
      const [eH, eM] = shift.end.split(':').map(Number);
      const startVal = sH + sM / 60;
      let endVal = eH + eM / 60;

      if (shift.end === '00:00' || shift.end === '24:00' || (eH === 0 && eM === 0) || (startVal >= 12 && eH === 12 && eM === 0)) {
        endVal = 24.0;
      }

      if (endVal > startVal) {
        if (timeValue >= startVal && timeValue < endVal) {
          return true;
        }
      } else {
        if (timeValue >= startVal) {
          return true;
        }
      }
    }
  }

  // 2. Check overnight shifts from yesterday spilling into early morning today
  const yesterday = String((taiwanTime.getUTCDay() + 6) % 7);
  const yesterdayShifts = parsedHours[yesterday];
  if (yesterdayShifts && Array.isArray(yesterdayShifts)) {
    for (const shift of yesterdayShifts) {
      if (shift && shift.start && shift.end) {
        const [sH, sM] = shift.start.split(':').map(Number);
        const [eH, eM] = shift.end.split(':').map(Number);
        const startVal = sH + sM / 60;
        let endVal = eH + eM / 60;

        if (shift.end === '00:00' || shift.end === '24:00' || (eH === 0 && eM === 0) || (startVal >= 12 && eH === 12 && eM === 0)) {
          endVal = 24.0;
        }

        if (endVal < startVal && timeValue < endVal) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Endpoint GET /api/marketplace/tenants
 * Returns all active, marketplace-visible restaurants with their public metadata.
 */
export async function getMarketplaceTenants(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const noCache = url.searchParams.has('nocache') || url.searchParams.has('_t');
  const repo = createTenantRepository(env.DB, env.ORDER_STATE, env);
  const deletedIds = await repo.getDeletedTenantIds();

  // 1. Check KV Edge Cache
  if (!noCache) {
    const parsed = await repo.getCachedMarketplaceCatalog();
    if (parsed) {
      // Refresh isOpen flag on cached response dynamically based on real-time Taiwan clock
      const now = new Date();
      const refreshedData = (parsed.data || [])
        .filter((t: MarketplaceTenantItem) => !deletedIds.has(t.tenantId))
        .map((t: MarketplaceTenantItem) => ({
          ...t,
          isOpen: isStoreCurrentlyOpen(t.storeStatus, t.parsedHours, now)
        }));

      return json({
        success: true,
        count: refreshedData.length,
        data: refreshedData
      }, 200, {
        'X-Cache': 'HIT',
        'Cache-Control': 'no-store'
      });
    }
  }

  // 2. Fetch from D1 Database
  if (!env.DB) {
    return json({ error: 'Database binding unavailable' }, 500);
  }

  try {
    const { tenants: allTenants, categories: rawCategories } = await repo.listMarketplaceTenants();
    const rawTenants = allTenants.filter(t => !deletedIds.has(t.tenant_id));

    // Group categories summary by tenant
    const catMap = new Map<string, string[]>();
    for (const c of rawCategories) {
      if (!catMap.has(c.tenant_id)) {
        catMap.set(c.tenant_id, []);
      }
      const list = catMap.get(c.tenant_id)!;
      if (list.length < 5 && c.name && !list.includes(c.name)) {
        list.push(c.name);
      }
    }

    const now = new Date();
    const tenants: MarketplaceTenantItem[] = [];

    for (const row of rawTenants) {
      const tenantId = row.tenant_id;
      const parsedHours = parseOperatingHours(row.operating_hours, tenantId);
      const storeStatus = (row.store_status as 'open' | 'busy' | 'paused' | 'closed') || 'open';
      const isOpen = isStoreCurrentlyOpen(storeStatus, parsedHours, now);

      let logoUrl = row.logo_url || null;
      if (!logoUrl && tenantId === 'benmi') {
        logoUrl = './benmi_logo.png';
      }

      tenants.push({
        tenantId,
        brandName: row.brand_name || tenantId,
        brandSubtitle: row.announcement || null,
        brandColor: row.brand_color || '#00b900',
        logoUrl,
        storeAddress: row.store_address || null,
        latitude: row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null,
        longitude: row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null,
        operatingHours: row.operating_hours || null,
        parsedHours,
        cuisineType: row.cuisine_type || 'vietnamese',
        isOpen,
        storeStatus,
        deliveryPolicy: row.delivery_policy || null,
        allowDineIn: Boolean(row.allow_dine_in),
        allowScheduledPickup: Boolean(row.allow_scheduled_pickup),
        categoriesSummary: catMap.get(tenantId) || [],
        locale: row.locale || 'zh-TW',
        liffUrl: row.liff_url || null,
        orderUrl: customerOrderConfig(row.tenant_id, row, request.url).orderUrl
      });
    }

    const payload = {
      success: true,
      count: tenants.length,
      data: tenants
    };

    // 3. Cache in KV
    await repo.setCachedMarketplaceCatalog(payload);

    return json(payload, 200, {
      'X-Cache': 'MISS',
      'Cache-Control': 'no-store'
    });

  } catch (err: any) {
    console.error('[Marketplace] Error fetching tenants:', err);
    return json({ error: err.message || 'Internal Server Error' }, 500);
  }
}

/**
 * Invalidates the Marketplace KV Cache across edge nodes.
 */
export async function invalidateMarketplaceCache(env: Env): Promise<void> {
  const repo = createTenantRepository(env.DB, env.ORDER_STATE, env);
  await repo.invalidateMarketplaceCache();
}

