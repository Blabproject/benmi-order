import type { Env } from '../types/env';
import type { TenantContext } from '../types/tenant';
import type { CustomerOrderDomain, OrderDomainRow } from '../utils/order-domain';
import { resolveSecret } from '../utils/secrets';
import { tenantIsDeleted } from '../utils/tenant-lifecycle';
import type {
  TenantRepository,
  TenantConfigRow,
  TenantAdminSummaryRow,
  UpdateTenantConfigInput,
  SaveAdminTenantInput,
  MarketplaceTenantConfigRow,
  MarketplaceCategoryRow
} from './types';

const TENANT_CACHE_TTL = 300; // 5 minutes
const MARKETPLACE_CACHE_KEY = 'marketplace:tenants_catalog';
const MARKETPLACE_CACHE_TTL = 300; // 5 minutes
const DEFAULT_STORE_PASSWORD = '12345678';

function normalizeMultiline(text: string | null | undefined): string | null {
  if (!text) return null;
  return String(text).replace(/\r\n/g, '\n').replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}

export function createTenantRepository(
  db: D1Database,
  kv?: KVNamespace,
  env?: Env
): TenantRepository {
  async function invalidateCache(tenantId: string): Promise<void> {
    const cacheKey = `tenant:${tenantId}:config_cache`;
    if (kv) {
      try {
        await kv.delete(cacheKey);
      } catch (e) {
        console.error(`[TenantRepository] Failed to invalidate cache for ${tenantId}:`, e);
      }
    }
  }

  return {
    invalidateCache,

    async getTenantContext(tenantId: string): Promise<TenantContext | null> {
      if (await tenantIsDeleted(db, tenantId)) return null;
      const cacheKey = `tenant:${tenantId}:config_cache`;

      // 1. Check KV Cache
      if (kv) {
        try {
          const cached = await kv.get(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed) {
              if (parsed.deliveryPolicy) parsed.deliveryPolicy = normalizeMultiline(parsed.deliveryPolicy);
              if (parsed.operatingHours) parsed.operatingHours = normalizeMultiline(parsed.operatingHours);
              if (parsed.storeAddress) parsed.storeAddress = normalizeMultiline(parsed.storeAddress);
              if (parsed.announcement) parsed.announcement = normalizeMultiline(parsed.announcement);
              if (Array.isArray(parsed.quickReplies)) {
                parsed.quickReplies = parsed.quickReplies.map((qr: any) => ({
                  ...qr,
                  reply: typeof qr.reply === 'string' ? normalizeMultiline(qr.reply) : qr.reply
                }));
              }
            }
            return parsed;
          }
        } catch (e) {
          console.error(`[TenantRepository] KV cache read error for tenant ${tenantId}:`, e);
        }
      }

      // 2. Query D1 Database
      if (db) {
        try {
          const row = await db.prepare(
            "SELECT * FROM tenant_config WHERE tenant_id = ? AND is_active = 1"
          ).bind(tenantId).first<any>();

          if (row) {
            const rawQuickReplies = row.quick_replies ? JSON.parse(row.quick_replies) : [];
            const quickReplies = Array.isArray(rawQuickReplies) ? rawQuickReplies.map((qr: any) => ({
              ...qr,
              reply: typeof qr.reply === 'string' ? normalizeMultiline(qr.reply) : qr.reply
            })) : [];
            let features: string[] = [];
            try {
              if (row.features) {
                features = typeof row.features === 'string' ? JSON.parse(row.features) : row.features;
              }
            } catch {
              features = [];
            }

            const ctx: TenantContext = {
              tenantId,
              lineChannelToken: row.line_channel_token || '',
              lineChannelSecret: row.line_channel_secret || null,
              liffId: row.liff_id || (tenantId === 'benmi' ? (env?.LIFF_ID || '') : ''),
              liffUrl: row.liff_url || (tenantId === 'benmi' ? (env?.LIFF_URL || '') : ''),
              groqApiKey: row.groq_api_key || null,
              groqModel: row.groq_model || 'openai/gpt-oss-20b',
              openrouterApiKey: row.openrouter_api_key || null,
              openrouterModel: row.openrouter_model || 'google/gemma-4-26b-a4b-it:free',
              aiOrderRedirectEnabled: row.ai_order_redirect_enabled === undefined || row.ai_order_redirect_enabled === null
                ? true
                : Boolean(row.ai_order_redirect_enabled),
              brandName: row.brand_name || tenantId,
              brandSubtitle: row.brand_subtitle || null,
              brandColor: row.brand_color || '#00b900',
              logoUrl: row.logo_url || null,
              storeAddress: normalizeMultiline(row.store_address),
              announcement: normalizeMultiline(row.announcement),
              operatingHours: normalizeMultiline(row.operating_hours),
              deliveryPolicy: normalizeMultiline(row.delivery_policy),
              allowScheduledPickup: row.allow_scheduled_pickup !== undefined && row.allow_scheduled_pickup !== null ? Boolean(row.allow_scheduled_pickup) : true,
              allowDineIn: row.allow_dine_in !== undefined && row.allow_dine_in !== null ? Boolean(row.allow_dine_in) : true,
              storeStatus: (row.store_status as any) || 'open',
              quickReplies,
              defaultPassword: row.default_password || '12345678',
              locale: row.locale || 'zh-TW',
              googleSheetsUrl: row.google_sheets_url || null,
              features: Array.isArray(features) ? features : [],
              orderPrefix: row.order_prefix || null,
              latitude: row.latitude !== undefined && row.latitude !== null ? Number(row.latitude) : null,
              longitude: row.longitude !== undefined && row.longitude !== null ? Number(row.longitude) : null,
              cuisineType: row.cuisine_type || 'vietnamese',
              isMarketplaceVisible: row.is_marketplace_visible !== undefined && row.is_marketplace_visible !== null ? Boolean(row.is_marketplace_visible) : true,
            };

            // Cache in KV
            if (kv) {
              try {
                await kv.put(cacheKey, JSON.stringify(ctx), {
                  expirationTtl: TENANT_CACHE_TTL
                });
              } catch (e) {
                console.error(`[TenantRepository] KV cache write error for tenant ${tenantId}:`, e);
              }
            }

            return ctx;
          }
        } catch (e) {
          console.error(`[TenantRepository] D1 lookup error for tenant ${tenantId}:`, e);
        }
      }

      // 3. Fallback for "benmi" tenant using env variables (Backward compatibility)
      if (tenantId === 'benmi' && env) {
        const globalLineToken = (await resolveSecret(env.LINE_CHANNEL_TOKEN)) || env.LINE_CHANNEL_ACCESS_TOKEN || '';
        const globalLiffId = env.LIFF_ID || '';
        const globalLiffUrl = env.LIFF_URL || 'https://liff.line.me/';
        const globalGroqKey = (await resolveSecret(env.GROQ_API_KEY)) || null;
        const globalOpenRouterKey = (await resolveSecret(env.OPENROUTER_API_KEY)) || null;

        const fallbackCtx: TenantContext = {
          tenantId: 'benmi',
          lineChannelToken: globalLineToken,
          lineChannelSecret: null,
          liffId: globalLiffId,
          liffUrl: globalLiffUrl,
          groqApiKey: globalGroqKey,
          groqModel: env.GROQ_MODEL || 'openai/gpt-oss-20b',
          openrouterApiKey: globalOpenRouterKey,
          openrouterModel: env.OPENROUTER_MODEL || 'google/gemma-4-26b-a4b-it:free',
          aiOrderRedirectEnabled: true,
          brandName: 'Benmi 越式法國麵包',
          brandColor: '#00b900',
          storeAddress: '新北市土城區中央路二段135號',
          operatingHours: '11:00-21:00（一到五），7:30-21:00（六日）',
          deliveryPolicy: 'Benmi 最新外送說明如下：\n🛵 滿 2,000 元： 不限距離，土城全區皆享免運！\n🛵 滿 800 元：\n距離店址 2公里內 ➔ 免運 \n距離店址 超過2公里 ➔ 酌收 80元 運費。\n🛵 未滿 800 元： 也別擔心！歡迎直接點擊 UberEats 平台直接下單，美味一樣送到家 👇 👉 https://cutt.ly/Mt9w2fAD',
          allowScheduledPickup: true,
          allowDineIn: false,
          quickReplies: [
            { triggers: ['營業時間'], reply: '我們的營業時間：11:00-21:00（一到五），7:30-21:00（六日）。' },
            { triggers: ['地址', '在哪'], reply: '新北市土城區中央路二段135號' },
            {
              triggers: ['外送嗎'],
              reply: 'Benmi 最新外送說明如下：\n🛵 滿 2,000 元： 不限距離，土城全區皆享免運！\n🛵 滿 800 元：\n距離店址 2公里內 ➔ 免運 \n距離店址 超過2公里 ➔ 酌收 80元 運費。\n🛵 未滿 800 元： 也別擔心！歡迎直接點擊 UberEats 平台直接下單，美味一樣送到家 👇 👉 https://cutt.ly/Mt9w2fAD'
            }
          ],
          defaultPassword: '12345678',
          locale: 'zh-TW',
          googleSheetsUrl: env.GOOGLE_SHEETS_URL || null,
          features: ['reports'],
          orderPrefix: 'B',
          latitude: 24.970220,
          longitude: 121.442880,
          cuisineType: 'vietnamese',
          isMarketplaceVisible: true,
        };

        return fallbackCtx;
      }

      return null;
    },

    async getTenantConfigRow(tenantId: string): Promise<TenantConfigRow | null> {
      if (!db) return null;
      return db.prepare(
        "SELECT operating_hours, allow_scheduled_pickup, allow_dine_in, store_status, liff_id, logo_url, store_address, announcement, features, customer_order_domain, legacy_liff_endpoint_url FROM tenant_config WHERE tenant_id = ? AND is_active = 1"
      ).bind(tenantId).first<TenantConfigRow>();
    },

    async updateTenantConfig(tenantId: string, input: UpdateTenantConfigInput): Promise<void> {
      if (!db) return;

      const opHoursStr = input.operatingHours !== undefined
        ? (typeof input.operatingHours === 'string' ? input.operatingHours : JSON.stringify(input.operatingHours))
        : null;
      const allowPickupInt = input.allowScheduledPickup !== undefined && input.allowScheduledPickup !== null
        ? (input.allowScheduledPickup ? 1 : 0)
        : null;
      const allowDineInInt = input.allowDineIn !== undefined && input.allowDineIn !== null
        ? (input.allowDineIn ? 1 : 0)
        : null;
      const storeStatusVal = input.storeStatus !== undefined ? input.storeStatus : null;
      const liffIdVal = input.liffId !== undefined ? input.liffId : null;
      const logoUrlVal = input.logoUrl !== undefined ? input.logoUrl : null;
      const storeAddressVal = input.storeAddress !== undefined ? input.storeAddress : null;
      const announcementVal = input.announcement !== undefined ? input.announcement : null;
      const featuresVal = input.features !== undefined
        ? (typeof input.features === 'string' ? input.features : JSON.stringify(input.features))
        : null;
      const brandName = input.brandName || (tenantId === 'benmi' ? 'Benmi 越式法國麵包' : tenantId);

      await db.prepare(`
        INSERT INTO tenant_config (tenant_id, brand_name, operating_hours, allow_scheduled_pickup, allow_dine_in, store_status, liff_id, logo_url, store_address, announcement, features, updated_at)
        VALUES (?, ?, ?, COALESCE(?, 1), COALESCE(?, 1), COALESCE(?, 'open'), ?, ?, ?, ?, COALESCE(?, '[]'), CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id) DO UPDATE SET
          operating_hours = CASE WHEN ? IS NOT NULL THEN ? ELSE tenant_config.operating_hours END,
          allow_scheduled_pickup = CASE WHEN ? IS NOT NULL THEN ? ELSE tenant_config.allow_scheduled_pickup END,
          allow_dine_in = CASE WHEN ? IS NOT NULL THEN ? ELSE tenant_config.allow_dine_in END,
          store_status = CASE WHEN ? IS NOT NULL THEN ? ELSE tenant_config.store_status END,
          liff_id = CASE WHEN ? IS NOT NULL THEN ? ELSE tenant_config.liff_id END,
          logo_url = CASE WHEN ? IS NOT NULL THEN ? ELSE tenant_config.logo_url END,
          store_address = CASE WHEN ? IS NOT NULL THEN ? ELSE tenant_config.store_address END,
          announcement = CASE WHEN ? IS NOT NULL THEN ? ELSE tenant_config.announcement END,
          features = CASE WHEN ? IS NOT NULL THEN ? ELSE tenant_config.features END,
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        tenantId,
        brandName,
        opHoursStr,
        allowPickupInt,
        allowDineInInt,
        storeStatusVal,
        liffIdVal,
        logoUrlVal,
        storeAddressVal,
        announcementVal,
        featuresVal,
        opHoursStr, opHoursStr,
        allowPickupInt, allowPickupInt,
        allowDineInInt, allowDineInInt,
        storeStatusVal, storeStatusVal,
        liffIdVal, liffIdVal,
        logoUrlVal, logoUrlVal,
        storeAddressVal, storeAddressVal,
        announcementVal, announcementVal,
        featuresVal, featuresVal
      ).run();

      await invalidateCache(tenantId);
    },

    async getOrderDomainRow(tenantId: string): Promise<OrderDomainRow | null> {
      if (!db) return null;
      return db.prepare(
        'SELECT liff_id, customer_order_domain, legacy_liff_endpoint_url FROM tenant_config WHERE tenant_id = ? AND is_active = 1'
      ).bind(tenantId).first<OrderDomainRow>();
    },

    async updateOrderDomain(
      tenantId: string,
      domain: CustomerOrderDomain,
      legacyEndpoint: string | null,
      expectedDomain: CustomerOrderDomain,
      expectedLiffId: string,
      currentLegacyEndpoint: string | null
    ): Promise<boolean> {
      if (!db) return false;
      const result = await db.prepare(`UPDATE tenant_config SET customer_order_domain = ?, legacy_liff_endpoint_url = ?, updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ? AND customer_order_domain = ? AND liff_id = ?
        AND legacy_liff_endpoint_url IS ? AND is_active = 1`)
        .bind(domain, legacyEndpoint || null, tenantId, expectedDomain, expectedLiffId, currentLegacyEndpoint || null)
        .run();

      return Boolean(result.meta.changes);
    },

    async listAdminTenants(): Promise<TenantAdminSummaryRow[]> {
      if (!db) return [];
      const { results } = await db.prepare(
        `SELECT t.id, t.name, tc.brand_name, tc.brand_color, tc.liff_id, tc.liff_url,
                tc.ai_order_redirect_enabled, tc.staff_ordering_enabled, tc.is_active, tc.created_at, tc.updated_at
         FROM tenants t
         LEFT JOIN tenant_config tc ON t.id = tc.tenant_id
         WHERE NOT EXISTS(SELECT 1 FROM tenant_lifecycle l WHERE l.tenant_id=t.id AND l.state<>'active')
         ORDER BY t.created_at DESC`
      ).all<TenantAdminSummaryRow>();
      return results || [];
    },

    async getAdminTenantDetail(tenantId: string): Promise<{ tenant: any; config: any } | null> {
      if (!db) return null;
      const tenant = await db.prepare(
        "SELECT * FROM tenants WHERE id = ?"
      ).bind(tenantId).first();

      if (!tenant) return null;

      const config = await db.prepare(
        "SELECT * FROM tenant_config WHERE tenant_id = ?"
      ).bind(tenantId).first();

      return { tenant, config };
    },

    async saveAdminTenant(input: SaveAdminTenantInput): Promise<void> {
      if (!db) return;

      const tenantName = input.name || input.brand_name;

      // 1. Insert or update tenants table
      await db.prepare(
        `INSERT INTO tenants (id, name, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = datetime('now')`
      ).bind(input.tenant_id, tenantName).run();

      // 2. Insert or update tenant_config table
      const quickRepliesJson = Array.isArray(input.quick_replies)
        ? JSON.stringify(input.quick_replies)
        : (typeof input.quick_replies === 'string' ? input.quick_replies : null);

      await db.prepare(
        `INSERT INTO tenant_config (
          tenant_id, line_channel_token, line_channel_secret, liff_id, liff_url,
          groq_api_key, groq_model, openrouter_api_key, openrouter_model,
          ai_order_redirect_enabled,
          brand_name, brand_color, store_address, operating_hours, delivery_policy,
          quick_replies, default_password, locale, google_sheets_url, is_active, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(tenant_id) DO UPDATE SET
          line_channel_token = COALESCE(excluded.line_channel_token, tenant_config.line_channel_token),
          line_channel_secret = COALESCE(excluded.line_channel_secret, tenant_config.line_channel_secret),
          liff_id = COALESCE(excluded.liff_id, tenant_config.liff_id),
          liff_url = COALESCE(excluded.liff_url, tenant_config.liff_url),
          groq_api_key = COALESCE(excluded.groq_api_key, tenant_config.groq_api_key),
          groq_model = COALESCE(excluded.groq_model, tenant_config.groq_model),
          openrouter_api_key = COALESCE(excluded.openrouter_api_key, tenant_config.openrouter_api_key),
          openrouter_model = COALESCE(excluded.openrouter_model, tenant_config.openrouter_model),
          ai_order_redirect_enabled = COALESCE(excluded.ai_order_redirect_enabled, tenant_config.ai_order_redirect_enabled),
          brand_name = excluded.brand_name,
          brand_color = COALESCE(excluded.brand_color, tenant_config.brand_color),
          store_address = COALESCE(excluded.store_address, tenant_config.store_address),
          operating_hours = COALESCE(excluded.operating_hours, tenant_config.operating_hours),
          delivery_policy = COALESCE(excluded.delivery_policy, tenant_config.delivery_policy),
          quick_replies = COALESCE(excluded.quick_replies, tenant_config.quick_replies),
          default_password = COALESCE(excluded.default_password, tenant_config.default_password),
          locale = COALESCE(excluded.locale, tenant_config.locale),
          google_sheets_url = COALESCE(excluded.google_sheets_url, tenant_config.google_sheets_url),
          is_active = excluded.is_active,
          updated_at = datetime('now')`
      ).bind(
        input.tenant_id,
        input.line_channel_token || null,
        input.line_channel_secret || null,
        input.liff_id || null,
        input.liff_url || null,
        input.groq_api_key || null,
        input.groq_model || 'openai/gpt-oss-20b',
        input.openrouter_api_key || null,
        input.openrouter_model || 'google/gemma-4-26b-a4b-it:free',
        input.ai_order_redirect_enabled === undefined || input.ai_order_redirect_enabled === null
          ? null
          : (input.ai_order_redirect_enabled ? 1 : 0),
        input.brand_name,
        input.brand_color || '#00b900',
        input.store_address || null,
        input.operating_hours || null,
        input.delivery_policy || null,
        quickRepliesJson,
        input.default_password || '12345678',
        input.locale || 'zh-TW',
        input.google_sheets_url || null,
        input.is_active ?? 1
      ).run();

      if (input.staff_ordering_enabled !== undefined && input.staff_ordering_enabled !== null) {
        await db.prepare('UPDATE tenant_config SET staff_ordering_enabled=? WHERE tenant_id=?')
          .bind(input.staff_ordering_enabled ? 1 : 0, input.tenant_id).run();
      }

      await invalidateCache(input.tenant_id);
    },

    async deactivateTenant(tenantId: string): Promise<void> {
      if (!db) return;
      await db.prepare(
        "UPDATE tenant_config SET is_active = 0, updated_at = datetime('now') WHERE tenant_id = ?"
      ).bind(tenantId).run();

      await invalidateCache(tenantId);
    },

    async getDeletedTenantIds(): Promise<Set<string>> {
      if (!db) return new Set();
      const deleted = await db
        .prepare("SELECT tenant_id FROM tenant_lifecycle WHERE state<>'active'")
        .all<{ tenant_id: string }>();
      return new Set((deleted.results || []).map(row => row.tenant_id));
    },

    async getCachedMarketplaceCatalog(): Promise<any | null> {
      if (!kv) return null;
      try {
        const cached = await kv.get(MARKETPLACE_CACHE_KEY);
        return cached ? JSON.parse(cached) : null;
      } catch (e) {
        console.error('[TenantRepository] Marketplace KV cache read error:', e);
        return null;
      }
    },

    async setCachedMarketplaceCatalog(payload: any): Promise<void> {
      if (!kv) return;
      try {
        await kv.put(MARKETPLACE_CACHE_KEY, JSON.stringify(payload), {
          expirationTtl: MARKETPLACE_CACHE_TTL
        });
      } catch (e) {
        console.error('[TenantRepository] Marketplace KV cache write error:', e);
      }
    },

    async invalidateMarketplaceCache(): Promise<void> {
      if (!kv) return;
      try {
        await kv.delete(MARKETPLACE_CACHE_KEY);
        console.log('[TenantRepository] Invalidated marketplace cache');
      } catch (e) {
        console.error('[TenantRepository] Failed to invalidate marketplace cache:', e);
      }
    },

    async listMarketplaceTenants(): Promise<{
      tenants: MarketplaceTenantConfigRow[];
      categories: MarketplaceCategoryRow[];
    }> {
      if (!db) return { tenants: [], categories: [] };
      const [tenantsRes, categoriesRes] = await db.batch([
        db.prepare(`
          SELECT tenant_id, brand_name, announcement, brand_color, logo_url, store_address,
                 operating_hours, delivery_policy, 
                 COALESCE(allow_dine_in, 1) AS allow_dine_in, 
                 COALESCE(allow_scheduled_pickup, 1) AS allow_scheduled_pickup,
                 COALESCE(store_status, 'open') AS store_status, 
                 COALESCE(cuisine_type, 'vietnamese') AS cuisine_type, 
                 latitude, longitude, locale, liff_url, customer_order_domain, legacy_liff_endpoint_url
          FROM tenant_config
          WHERE is_active = 1 AND COALESCE(is_marketplace_visible, 1) = 1
          ORDER BY rowid ASC
        `),
        db.prepare(`
          SELECT tenant_id, name, sort_order 
          FROM menu_categories 
          WHERE COALESCE(category_type, 'catalog') = 'catalog'
          ORDER BY tenant_id, sort_order ASC
        `)
      ]);

      return {
        tenants: (tenantsRes.results as MarketplaceTenantConfigRow[]) || [],
        categories: (categoriesRes.results as MarketplaceCategoryRow[]) || []
      };
    },

    async getStorePassword(tenantId: string, defaultPassword?: string): Promise<string> {
      if (kv) {
        const cacheKey = `tenant:${tenantId}:password`;
        let stored = await kv.get(cacheKey);
        if (!stored && tenantId === 'benmi') {
          stored = await kv.get('dashboard:password');
          if (stored) {
            await kv.put(cacheKey, stored);
          }
        }
        if (stored) return stored;
      }
      return defaultPassword || DEFAULT_STORE_PASSWORD;
    },

    async setStorePassword(tenantId: string, newPassword: string): Promise<void> {
      if (!kv) return;
      await kv.put(`tenant:${tenantId}:password`, newPassword);
    },

    async createTempLinkToken(tenantId: string, token: string, ttlSeconds: number): Promise<void> {
      if (!kv) return;
      await kv.put(`templink:${tenantId}:${token}`, '1', { expirationTtl: ttlSeconds });
    },

    async verifyTempLinkToken(tenantId: string, token: string): Promise<boolean> {
      if (!kv) return false;
      const val = await kv.get(`templink:${tenantId}:${token}`);
      return val === '1';
    }
  };
}

