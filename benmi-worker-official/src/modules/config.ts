import { Env } from '../types/env';
import { json } from '../utils/http';
import { getTenantId } from './menu';
import { TenantContext, tenantHasFeature, normalizeStoreStatus, parseStoreNotice, STORE_NOTICE_TITLE_MAX, STORE_NOTICE_BODY_MAX } from '../types/tenant';
import { invalidateBootstrapCache, parseOperatingHours } from './bootstrap';
import { invalidateMarketplaceCache } from './marketplace';
import { customerOrderConfig } from '../utils/order-domain';
import { createTenantRepository } from '../repositories/tenant.repository';
import { parseAISettings, validAISettingsPatch } from './ai-settings';
import { isMultilingualCanaryEnabled, parseSupportedLocales } from './menu-i18n';
import {
  loadTenantOperatingShifts,
  saveTenantOperatingShifts,
  stripOperatingHoursProjection,
  syncShiftsFromLegacyOperatingHours,
  parseFeaturesArray,
} from './operating-shifts';

async function resolveConfigFeatures(
  tenantCtx: TenantContext | null | undefined,
  tenantRepo: ReturnType<typeof createTenantRepository>,
  tenantId: string
): Promise<string[]> {
  if (Array.isArray(tenantCtx?.features)) return tenantCtx.features;
  const cur = await tenantRepo.getTenantConfigRow(tenantId);
  return parseFeaturesArray(cur?.features);
}

export async function getConfig(
  request: Request,
  env: Env,
  tenantCtx?: TenantContext | null
): Promise<Response> {
  const tenantId = tenantCtx?.tenantId || getTenantId(request);
  const tenantRepo = createTenantRepository(env.DB, env.ORDER_STATE, env);

  let domainRow;
  try {
    domainRow = await tenantRepo.getTenantConfigRow(tenantId);
  } catch (e) {
    console.error('[getConfig] D1 configuration unavailable');
    return json({ error: 'Tenant configuration unavailable' }, 503, { 'Cache-Control': 'no-store' });
  }

  if (!domainRow) {
    return json({ error: 'Tenant not found' }, 404, { 'Cache-Control': 'no-store' });
  }

  const finalFeatures = parseFeaturesArray(domainRow.features).length > 0
    ? parseFeaturesArray(domainRow.features)
    : (tenantCtx?.features || []);
  const hasMenuSchedule = finalFeatures.includes('menu_schedule');

  const operatingShifts = hasMenuSchedule ? await loadTenantOperatingShifts(env.DB, tenantId) : [];
  const hasRelationalOperating = hasMenuSchedule && operatingShifts.some((s) => s.shiftType === 'operating' && s.isActive);
  let operatingHours = hasRelationalOperating
    ? stripOperatingHoursProjection(operatingShifts)
    : parseOperatingHours(domainRow.operating_hours, tenantId);
  if (!operatingHours) {
    operatingHours = parseOperatingHours(null, tenantId);
  }

  let allowScheduledPickup = true;
  if (domainRow.allow_scheduled_pickup !== undefined && domainRow.allow_scheduled_pickup !== null) {
    allowScheduledPickup = Boolean(domainRow.allow_scheduled_pickup);
  }

  let allowDineIn = true;
  if (domainRow.allow_dine_in !== undefined && domainRow.allow_dine_in !== null) {
    allowDineIn = Boolean(domainRow.allow_dine_in);
  }

  let orderConfig;
  try {
    orderConfig = customerOrderConfig(tenantId, domainRow, request.url);
  } catch {
    return json({ error: 'Invalid tenant endpoint configuration' }, 503, { 'Cache-Control': 'no-store' });
  }

  const autoOpenBeforeMinutes = (domainRow.auto_open_before_minutes !== undefined && domainRow.auto_open_before_minutes !== null)
    ? Number(domainRow.auto_open_before_minutes)
    : (tenantCtx?.autoOpenBeforeMinutes ?? 60);

  const primaryLocale = domainRow.locale || tenantCtx?.locale || 'zh-TW';
  const i18nEnabled = isMultilingualCanaryEnabled(tenantId, env, {
    features: finalFeatures
  });
  const defaultLocales = i18nEnabled
    ? (primaryLocale === 'vi' ? ['vi', 'en'] : ['zh-TW', 'en'])
    : [primaryLocale];
  const rawSupportedLocales =
    domainRow.supported_locales !== undefined && domainRow.supported_locales !== null
      ? domainRow.supported_locales
      : tenantCtx?.supportedLocales;
  const parsedSupported = parseSupportedLocales(rawSupportedLocales, defaultLocales);
  const supportedLocales = i18nEnabled
    ? (parsedSupported.includes(primaryLocale)
        ? parsedSupported
        : [primaryLocale, ...parsedSupported])
    : [primaryLocale];

  return json({
    tenantId,
    aiSettings: parseAISettings(domainRow.ai_settings, domainRow.ai_order_redirect_enabled),
    liffId: domainRow.liff_id || null,
    ...orderConfig,
    operatingHours,
    operatingShifts,
    allowScheduledPickup,
    allowDineIn,
    features: finalFeatures,
    locale: primaryLocale,
    supportedLocales,
    i18nEnabled,
    storeStatus: normalizeStoreStatus(domainRow.store_status || tenantCtx?.storeStatus, new Date(), domainRow.operating_hours || tenantCtx?.operatingHours, autoOpenBeforeMinutes),
    autoOpenBeforeMinutes,
    prepTimeMinutes: (domainRow.prep_time_minutes !== undefined && domainRow.prep_time_minutes !== null) ? Number(domainRow.prep_time_minutes) : (tenantCtx?.prepTimeMinutes ?? 5),
    paymentMethods: domainRow.payment_methods ? (typeof domainRow.payment_methods === 'string' ? JSON.parse(domainRow.payment_methods) : domainRow.payment_methods) : (tenantCtx?.paymentMethods || ['line_pay']),
    logoUrl: domainRow.logo_url || tenantCtx?.logoUrl || null,
    storeAddress: domainRow.store_address || tenantCtx?.storeAddress || null,
    announcement: domainRow.announcement !== undefined && domainRow.announcement !== null ? domainRow.announcement : (tenantCtx?.announcement || null),
    storeNotice: parseStoreNotice(domainRow.store_notice)
  }, 200, { 'Cache-Control': 'no-store' });
}

/**
 * Normalize a POS-submitted notice into its stored string form.
 * Returns undefined when absent, '' to clear, or JSON. The version is kept when
 * title/body are unchanged so customers who dismissed it are not shown it again.
 */
export function serializeStoreNotice(input: unknown, existingRaw: string | null | undefined): string | undefined {
  if (input === undefined) return undefined;
  if (input === null || typeof input !== 'object') return '';
  const raw = input as Record<string, unknown>;
  const title = (typeof raw.title === 'string' ? raw.title : '').replace(/\r\n/g, '\n').trim();
  const body = (typeof raw.body === 'string' ? raw.body : '').replace(/\r\n/g, '\n').trim();
  if (title.length > STORE_NOTICE_TITLE_MAX || body.length > STORE_NOTICE_BODY_MAX) {
    throw new HttpError(400, 'STORE_NOTICE_TOO_LONG');
  }
  if (!title && !body) return '';
  const existing = parseStoreNotice(existingRaw);
  const unchanged = existing && existing.title === title && existing.body === body && existing.version;
  return JSON.stringify({
    enabled: raw.enabled !== false,
    title,
    body,
    version: unchanged ? existing!.version : new Date().toISOString()
  });
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function updateConfig(
  request: Request,
  env: Env,
  tenantCtx?: TenantContext | null
): Promise<Response> {
  try {
    const tenantId = tenantCtx?.tenantId || getTenantId(request);
    const payload: any = await request.json();
    if (payload.storeStatus !== undefined) {
      const rawStatus = typeof payload.storeStatus === 'string' ? payload.storeStatus.split(':')[0].trim() : '';
      if (!['open', 'busy', 'paused', 'closed'].includes(rawStatus)) {
        return json({ error: 'INVALID_STORE_STATUS' }, 400);
      }
    }
    const tenantRepo = createTenantRepository(env.DB, env.ORDER_STATE, env);

    let aiSettings: string | undefined;
    let aiOrderRedirectEnabled: boolean | undefined;
    if (payload.aiSettings !== undefined) {
      if (!validAISettingsPatch(payload.aiSettings)) return json({ error: 'INVALID_AI_SETTINGS' }, 400);
      const current = await tenantRepo.getTenantConfigRow(tenantId);
      if (!current) return json({ error: 'Tenant not found' }, 404);
      // Persist only changed keys; JSON patch in D1 preserves switches changed by another POS.
      const { orderRedirect, ...settingsPatch } = payload.aiSettings;
      aiSettings = JSON.stringify(settingsPatch);
      aiOrderRedirectEnabled = orderRedirect;
    }

    const hasDineInFeature = tenantCtx ? tenantHasFeature(tenantCtx, 'dine_in') : true;
    let allowDineInVal = payload.allowDineIn !== undefined ? payload.allowDineIn : null;
    if (allowDineInVal && !hasDineInFeature) {
      console.warn(`[updateConfig] Tenant ${tenantId} tried to enable allowDineIn without 'dine_in' feature.`);
      allowDineInVal = false;
    }

    const brandName = tenantCtx?.brandName || (tenantId === 'benmi' ? 'Benmi 越式法國麵包' : tenantId);

    let storeNotice: string | undefined;
    if (payload.storeNotice !== undefined) {
      const current = await tenantRepo.getTenantConfigRow(tenantId);
      storeNotice = serializeStoreNotice(payload.storeNotice, current?.store_notice);
    }

    const needsFeatureCheck =
      payload.supportedLocales !== undefined ||
      payload.i18n !== undefined ||
      payload.operatingShifts !== undefined ||
      payload.operatingHours !== undefined;
    const existingFeatures = needsFeatureCheck
      ? await resolveConfigFeatures(tenantCtx, tenantRepo, tenantId)
      : [];
    const hasMenuSchedule = existingFeatures.includes('menu_schedule');

    if (payload.supportedLocales !== undefined || payload.i18n !== undefined) {
      if (!isMultilingualCanaryEnabled(tenantId, env, { features: existingFeatures })) {
        return json({ error: 'FEATURE_LOCKED', feature: 'multilingual' }, 403);
      }
    }

    if (payload.operatingShifts !== undefined && !hasMenuSchedule) {
      return json({ error: 'FEATURE_LOCKED', feature: 'menu_schedule' }, 403);
    }

    let normalizedSupportedLocales: string[] | undefined;
    if (payload.supportedLocales !== undefined) {
      if (!Array.isArray(payload.supportedLocales)) {
        return json({ error: 'INVALID_SUPPORTED_LOCALES' }, 400);
      }
      const primaryLocale = tenantCtx?.locale || 'zh-TW';
      const cleaned = Array.from(
        new Set(
          payload.supportedLocales
            .map((loc: unknown) => (typeof loc === 'string' ? loc.trim() : ''))
            .filter((loc: string) => /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(loc))
        )
      ) as string[];
      if (cleaned.length === 0 && payload.supportedLocales.length > 0) {
        return json({ error: 'INVALID_SUPPORTED_LOCALES' }, 400);
      }
      normalizedSupportedLocales = cleaned.includes(primaryLocale)
        ? [primaryLocale, ...cleaned.filter((l) => l !== primaryLocale)]
        : [primaryLocale, ...cleaned];
    }

    let normalizedTenantI18n: Record<string, any> | undefined;
    if (payload.i18n !== undefined) {
      if (!payload.i18n || typeof payload.i18n !== 'object' || Array.isArray(payload.i18n)) {
        return json({ error: 'INVALID_TENANT_I18N' }, 400);
      }
      normalizedTenantI18n = payload.i18n;
    }

    let savedShiftsResult: Awaited<ReturnType<typeof saveTenantOperatingShifts>> | null = null;
    if (payload.operatingShifts !== undefined) {
      try {
        savedShiftsResult = await saveTenantOperatingShifts(env.DB, tenantId, payload.operatingShifts);
      } catch (shiftErr: any) {
        return json({ error: shiftErr?.message || 'INVALID_OPERATING_SHIFTS' }, 400);
      }
    }

    await tenantRepo.updateTenantConfig(tenantId, {
      operatingHours: savedShiftsResult ? savedShiftsResult.projectedOperatingHours : payload.operatingHours,
      allowScheduledPickup: payload.allowScheduledPickup,
      allowDineIn: allowDineInVal,
      storeStatus: payload.storeStatus,
      autoOpenBeforeMinutes: payload.autoOpenBeforeMinutes !== undefined ? Number(payload.autoOpenBeforeMinutes) : undefined,
      prepTimeMinutes: payload.prepTimeMinutes !== undefined ? Number(payload.prepTimeMinutes) : undefined,
      paymentMethods: payload.paymentMethods !== undefined ? payload.paymentMethods : undefined,
      liffId: payload.liffId,
      logoUrl: payload.logoUrl,
      storeAddress: payload.storeAddress,
      announcement: payload.announcement,
      storeNotice,
      aiSettings,
      aiOrderRedirectEnabled,
      features: payload.features,
      ...(normalizedSupportedLocales !== undefined ? { supportedLocales: normalizedSupportedLocales } : {}),
      ...(normalizedTenantI18n !== undefined ? { i18n: normalizedTenantI18n } : {}),
      brandName
    });

    if (!savedShiftsResult && payload.operatingHours !== undefined && hasMenuSchedule) {
      await syncShiftsFromLegacyOperatingHours(env.DB, tenantId, payload.operatingHours);
    }

    await invalidateBootstrapCache(tenantId, env);
    await invalidateMarketplaceCache(env);

    const responseBody: Record<string, any> = { success: true };
    if (savedShiftsResult) {
      responseBody.operatingShifts = savedShiftsResult.shifts;
      responseBody.operatingHours = savedShiftsResult.projectedOperatingHours;
    } else if (payload.operatingHours !== undefined && hasMenuSchedule) {
      responseBody.operatingShifts = await loadTenantOperatingShifts(env.DB, tenantId);
    }
    if (normalizedSupportedLocales !== undefined) {
      responseBody.supportedLocales = normalizedSupportedLocales;
    }
    if (aiSettings) {
      const current = await tenantRepo.getTenantConfigRow(tenantId);
      responseBody.aiSettings = parseAISettings(current?.ai_settings, current?.ai_order_redirect_enabled);
    }
    return json(responseBody);
  } catch (e: any) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error('[updateConfig] Error:', e);
    return json({ error: e.message }, 500);
  }
}
