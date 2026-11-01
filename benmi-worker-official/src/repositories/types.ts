import type { TenantContext } from '../types/tenant';
import type { CustomerOrderDomain, OrderDomainRow } from '../utils/order-domain';

export interface TenantConfigRow extends OrderDomainRow {
  tenant_id?: string;
  brand_name?: string;
  brand_subtitle?: string | null;
  brand_color?: string | null;
  logo_url?: string | null;
  store_address?: string | null;
  announcement?: string | null;
  operating_hours?: string | null;
  delivery_policy?: string | null;
  allow_scheduled_pickup?: number | boolean | null;
  allow_dine_in?: number | boolean | null;
  store_status?: string | null;
  liff_id?: string | null;
  liff_url?: string | null;
  line_channel_token?: string | null;
  line_channel_secret?: string | null;
  groq_api_key?: string | null;
  groq_model?: string | null;
  openrouter_api_key?: string | null;
  openrouter_model?: string | null;
  staff_ordering_enabled?: boolean | number | null;
  ai_order_redirect_enabled?: number | boolean | null;
  quick_replies?: string | null;
  default_password?: string | null;
  locale?: string | null;
  google_sheets_url?: string | null;
  features?: string | null;
  order_prefix?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  cuisine_type?: string | null;
  is_marketplace_visible?: number | boolean | null;
  is_active?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface TenantAdminSummaryRow {
  id: string;
  name: string;
  brand_name?: string | null;
  brand_color?: string | null;
  liff_id?: string | null;
  liff_url?: string | null;
  staff_ordering_enabled?: boolean | number | null;
  ai_order_redirect_enabled?: number | null;
  is_active?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateTenantConfigInput {
  operatingHours?: string | null;
  allowScheduledPickup?: boolean | number | null;
  allowDineIn?: boolean | number | null;
  storeStatus?: string | null;
  liffId?: string | null;
  logoUrl?: string | null;
  storeAddress?: string | null;
  announcement?: string | null;
  features?: string | string[] | null;
  brandName?: string | null;
}

export interface SaveAdminTenantInput {
  tenant_id: string;
  name?: string | null;
  line_channel_token?: string | null;
  line_channel_secret?: string | null;
  liff_id?: string | null;
  liff_url?: string | null;
  groq_api_key?: string | null;
  groq_model?: string | null;
  openrouter_api_key?: string | null;
  openrouter_model?: string | null;
  staff_ordering_enabled?: boolean | number | null;
  ai_order_redirect_enabled?: boolean | number | null;
  brand_name: string;
  brand_color?: string | null;
  store_address?: string | null;
  operating_hours?: string | null;
  delivery_policy?: string | null;
  quick_replies?: any;
  default_password?: string | null;
  locale?: string | null;
  google_sheets_url?: string | null;
  is_active?: number;
}

export interface MarketplaceTenantConfigRow extends OrderDomainRow {
  tenant_id: string;
  brand_name: string | null;
  announcement: string | null;
  brand_color: string | null;
  logo_url: string | null;
  store_address: string | null;
  operating_hours: string | null;
  delivery_policy: string | null;
  allow_dine_in: number | boolean;
  allow_scheduled_pickup: number | boolean;
  store_status: 'open' | 'busy' | 'paused' | string;
  cuisine_type: string;
  latitude: number | null;
  longitude: number | null;
  locale: string | null;
  liff_url: string | null;
}

export interface MarketplaceCategoryRow {
  tenant_id: string;
  name: string;
  sort_order: number | null;
}

export interface TenantRepository {
  /**
   * Resolve full TenantContext for runtime (reads KV cache with D1 fallback).
   */
  getTenantContext(tenantId: string): Promise<TenantContext | null>;

  /**
   * Read raw tenant configuration from D1 for /api/config.
   */
  getTenantConfigRow(tenantId: string): Promise<TenantConfigRow | null>;

  /**
   * Update tenant store configuration from POS settings (/api/config POST).
   */
  updateTenantConfig(tenantId: string, input: UpdateTenantConfigInput): Promise<void>;

  /**
   * Read order domain information from tenant_config.
   */
  getOrderDomainRow(tenantId: string): Promise<OrderDomainRow | null>;

  /**
   * Perform CAS (compare-and-swap) update of customer order domain.
   */
  updateOrderDomain(
    tenantId: string,
    domain: CustomerOrderDomain,
    legacyEndpoint: string | null,
    expectedDomain: CustomerOrderDomain,
    expectedLiffId: string,
    currentLegacyEndpoint: string | null
  ): Promise<boolean>;

  /**
   * List all tenants for the admin dashboard (/api/admin/tenants GET).
   */
  listAdminTenants(): Promise<TenantAdminSummaryRow[]>;

  /**
   * Retrieve tenant and config records for admin detail (/api/admin/tenants/:id GET).
   */
  getAdminTenantDetail(tenantId: string): Promise<{ tenant: any; config: any } | null>;

  /**
   * Insert or update tenant and config records from admin (/api/admin/tenants POST).
   */
  saveAdminTenant(input: SaveAdminTenantInput): Promise<void>;

  /**
   * Deactivate a tenant (/api/admin/tenants/:id DELETE).
   */
  deactivateTenant(tenantId: string): Promise<void>;

  /**
   * Invalidate tenant KV config cache.
   */
  invalidateCache(tenantId: string): Promise<void>;

  /**
   * Return set of tenant IDs whose lifecycle state is not 'active' (deleted/purging).
   */
  getDeletedTenantIds(): Promise<Set<string>>;

  /**
   * Read cached marketplace catalog payload from KV.
   */
  getCachedMarketplaceCatalog(): Promise<any | null>;

  /**
   * Write marketplace catalog payload to KV cache.
   */
  setCachedMarketplaceCatalog(payload: any): Promise<void>;

  /**
   * Invalidate marketplace catalog KV cache.
   */
  invalidateMarketplaceCache(): Promise<void>;

  /**
   * Query active marketplace-visible tenants and their catalog categories from D1.
   */
  listMarketplaceTenants(): Promise<{
    tenants: MarketplaceTenantConfigRow[];
    categories: MarketplaceCategoryRow[];
  }>;

  /**
   * Read POS store PIN password from KV with fallback to defaultPassword.
   */
  getStorePassword(tenantId: string, defaultPassword?: string): Promise<string>;

  /**
   * Update POS store PIN password in KV.
   */
  setStorePassword(tenantId: string, newPassword: string): Promise<void>;

  /**
   * Store a temporary POS access token in KV with TTL (in seconds).
   */
  createTempLinkToken(tenantId: string, token: string, ttlSeconds: number): Promise<void>;

  /**
   * Verify a temporary POS access token in KV.
   */
  verifyTempLinkToken(tenantId: string, token: string): Promise<boolean>;
}

export interface RawItemAnalyticsRow {
  item_name: string;
  category_name: string | null;
  total_quantity: number;
  total_sales: number;
  order_appearances: number;
  all_options_raw: string | null;
}

export interface ReportItemAnalyticsResult {
  items: import('../types').ItemAnalyticsRow[];
  totalItemsSold: number;
  totalRevenue: number;
  totalOrders: number;
}

export interface ReportRepository {
  /**
   * Query aggregated item sales and order counts for a given tenant within UTC time bounds.
   */
  getItemAnalytics(
    tenantId: string,
    startUtcIso: string,
    endUtcIso: string
  ): Promise<ReportItemAnalyticsResult>;
}

