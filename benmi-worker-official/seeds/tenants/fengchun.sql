-- ==============================================================================
-- Tenant Seed: fengchun (逢春便當店)
-- Description: Initial menu catalog and store configuration (Unified Menu v2/v3)
-- Source: User onboarding payload, 2026-11-11.
-- User confirmed:
--   - option_groups is empty ([]) — no dish modifiers or order/bag options.
--   - Seed now with operating_hours=NULL and store_address=''; update in POS later.
--   - Target environments: Staging (blab-db-test) and Production (blab-db-production).
-- ONE-TIME LIVE PAYLOAD PER ENVIRONMENT. Do not replay over customer/POS edits.
-- Subsequent changes require a fresh snapshot and a scoped incremental patch.
-- Note: LINE channel access token is intentionally omitted from versioned SQL.
-- Execution (from benmi-worker-official/):
--   node -e "require('./scripts/cloudflare-d1.cjs').executeD1File('<database_name>', 'seeds/tenants/fengchun.sql', true, '<test|production>')"
-- ==============================================================================

-- 1. Tenants Table (Triggers automatically create tenant_lifecycle state='active')
INSERT INTO tenants (id, name)
VALUES ('fengchun', '逢春便當店')
ON CONFLICT(id) DO UPDATE SET
    name = excluded.name
WHERE tenants.id = 'fengchun';

-- 2. Tenant Config Table (Preserves credentials/LIFF/operational flags on conflict)
INSERT INTO tenant_config (
    tenant_id,
    brand_name,
    brand_color,
    store_address,
    operating_hours,
    delivery_policy,
    default_password,
    locale,
    allow_scheduled_pickup,
    allow_dine_in,
    store_status,
    liff_id,
    liff_url,
    order_prefix,
    features,
    cuisine_type,
    is_marketplace_visible,
    is_active,
    latitude,
    longitude,
    groq_model,
    openrouter_model,
    customer_order_domain,
    legacy_liff_endpoint_url
) VALUES (
    'fengchun',
    '逢春便當店',
    '#e11d48',
    '',
    NULL,
    '訂餐 LINE ID: a0968977236 (逢春阿布) 或 harrywendy (宏) | 店內櫃檯專線: 0911638773',
    '12345678',
    'zh-TW',
    1,
    1,
    'open',
    '2012553386-AGPtchCW',
    'https://liff.line.me/2012553386-AGPtchCW',
    'FC',
    '["reports","flex_notifications"]',
    'taiwanese',
    1,
    1,
    NULL,
    NULL,
    'openai/gpt-oss-20b',
    'google/gemma-4-26b-a4b-it:free',
    'blabfood',
    'https://benmi-order.pages.dev/?tenant_id=fengchun'
)
ON CONFLICT(tenant_id) DO UPDATE SET
    brand_name = excluded.brand_name,
    brand_color = excluded.brand_color,
    store_address = excluded.store_address,
    operating_hours = excluded.operating_hours,
    delivery_policy = excluded.delivery_policy,
    locale = excluded.locale,
    allow_scheduled_pickup = excluded.allow_scheduled_pickup,
    allow_dine_in = excluded.allow_dine_in,
    order_prefix = excluded.order_prefix,
    cuisine_type = excluded.cuisine_type
WHERE tenant_config.tenant_id = 'fengchun';

-- 3. Menu Categories (Unified Option Groups schema: applied_modifiers = '[]')
INSERT INTO menu_categories (
    id,
    tenant_id,
    name,
    short_name,
    slug,
    category_type,
    selection_type,
    is_required,
    min_selection,
    max_selection,
    sort_order,
    allow_customization,
    applied_modifiers
) VALUES
('cat_fc_bento',  'fengchun', '外送品項', '便當', 'bento',        'catalog', 'single', 0, 0, 1, 1, 0, '[]'),
('cat_fc_single', 'fengchun', '單點品項', '單點', 'single-items', 'catalog', 'single', 0, 0, 1, 2, 0, '[]')
ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    short_name = excluded.short_name,
    slug = excluded.slug,
    category_type = excluded.category_type,
    selection_type = excluded.selection_type,
    is_required = excluded.is_required,
    min_selection = excluded.min_selection,
    max_selection = excluded.max_selection,
    sort_order = excluded.sort_order,
    allow_customization = excluded.allow_customization,
    applied_modifiers = excluded.applied_modifiers
WHERE menu_categories.tenant_id = excluded.tenant_id;

-- 4. Menu Items
INSERT INTO menu_items (
    id,
    tenant_id,
    category_id,
    name,
    price,
    description,
    badge_text,
    is_recommended,
    sort_order,
    item_type
) VALUES
-- 4.1 外送品項 (bento)
('fc_item_01', 'fengchun', 'cat_fc_bento', '炸雞腿飯', 75, NULL, NULL, 0, 1, 'standard'),
('fc_item_02', 'fengchun', 'cat_fc_bento', '滷雞腿飯', 75, NULL, NULL, 0, 2, 'standard'),
('fc_item_03', 'fengchun', 'cat_fc_bento', '炸排骨飯', 75, NULL, NULL, 0, 3, 'standard'),
('fc_item_04', 'fengchun', 'cat_fc_bento', '滷排骨飯', 75, NULL, NULL, 0, 4, 'standard'),
('fc_item_05', 'fengchun', 'cat_fc_bento', '控肉飯',   75, NULL, NULL, 0, 5, 'standard'),
('fc_item_06', 'fengchun', 'cat_fc_bento', '蒲燒鯛飯', 75, NULL, NULL, 0, 6, 'standard'),
('fc_item_07', 'fengchun', 'cat_fc_bento', '白北魚飯', 75, NULL, NULL, 0, 7, 'standard'),

-- 4.2 單點品項 (single-items)
('fc_sp_01',   'fengchun', 'cat_fc_single', '大雞腿',  45, NULL, NULL, 0, 1, 'standard'),
('fc_sp_02',   'fengchun', 'cat_fc_single', '排骨',    35, NULL, NULL, 0, 2, 'standard'),
('fc_sp_03',   'fengchun', 'cat_fc_single', '控肉',    35, NULL, NULL, 0, 3, 'standard'),
('fc_sp_04',   'fengchun', 'cat_fc_single', '蒲燒鯛',  35, NULL, NULL, 0, 4, 'standard'),
('fc_sp_05',   'fengchun', 'cat_fc_single', '荷包蛋',  15, NULL, NULL, 0, 5, 'standard')
ON CONFLICT(id) DO UPDATE SET
    category_id = excluded.category_id,
    name = excluded.name,
    price = excluded.price,
    description = excluded.description,
    badge_text = excluded.badge_text,
    is_recommended = excluded.is_recommended,
    sort_order = excluded.sort_order,
    item_type = excluded.item_type,
    menu_revision = menu_items.menu_revision + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE menu_items.tenant_id = excluded.tenant_id;

-- 5. Bump Catalog Revision
INSERT INTO menu_catalog_revisions (tenant_id, revision)
VALUES ('fengchun', 1)
ON CONFLICT(tenant_id) DO UPDATE SET revision = revision + 1;
