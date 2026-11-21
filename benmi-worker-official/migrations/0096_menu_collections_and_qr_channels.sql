-- Menu Collections, Shift Dining Policies, Counter-Pickup Table Mode & QR Attribution Channels
-- 1. Extend tenant_operating_shifts for Collection switcher visibility & per-shift dining policy
ALTER TABLE tenant_operating_shifts
    ADD COLUMN display_mode TEXT NOT NULL DEFAULT 'switcher'
    CHECK(display_mode IN ('switcher', 'schedule_only', 'qr_only'));

ALTER TABLE tenant_operating_shifts
    ADD COLUMN dining_policy TEXT NOT NULL DEFAULT 'inherit'
    CHECK(dining_policy IN ('inherit', 'both', 'takeaway_only', 'dine_in_only'));

-- 2. Dedicated QR Channels table for customer attribution (Departments / Clubs / Dorms / LINE OA slots)
-- Intentionally separate from restaurant_tables so physical table occupancy guards are never polluted.
CREATE TABLE IF NOT EXISTS tenant_qr_channels (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL,
    label TEXT NOT NULL,
    i18n_json TEXT NOT NULL DEFAULT '{}',
    default_shift_id TEXT DEFAULT NULL,
    default_locale TEXT DEFAULT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (default_shift_id) REFERENCES tenant_operating_shifts(id) ON DELETE SET NULL,
    UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_tenant_qr_channels_tenant
    ON tenant_qr_channels(tenant_id, is_active, sort_order);

CREATE TRIGGER IF NOT EXISTS lifecycle_tenant_qr_channels_insert BEFORE INSERT ON tenant_qr_channels
WHEN EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=NEW.tenant_id AND state<>'active')
BEGIN SELECT RAISE(ABORT,'TENANT_DELETED'); END;

CREATE TRIGGER IF NOT EXISTS lifecycle_tenant_qr_channels_update BEFORE UPDATE ON tenant_qr_channels
WHEN EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=NEW.tenant_id AND state<>'active')
  OR EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=OLD.tenant_id AND state<>'active')
BEGIN SELECT RAISE(ABORT,'TENANT_DELETED'); END;

-- 3. Separate Dine-in toggle from physical table number requirement (counter-pickup stores use 'none')
ALTER TABLE tenant_config
    ADD COLUMN dine_in_table_mode TEXT NOT NULL DEFAULT 'required'
    CHECK(dine_in_table_mode IN ('required', 'optional', 'none'));

-- 4. Order attribution columns for group consumption analytics & shift tracking
ALTER TABLE orders ADD COLUMN channel_id TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN channel_label TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN shift_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_tenant_channel_date
    ON orders(tenant_id, business_date, channel_id);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_shift_date
    ON orders(tenant_id, business_date, shift_id);
