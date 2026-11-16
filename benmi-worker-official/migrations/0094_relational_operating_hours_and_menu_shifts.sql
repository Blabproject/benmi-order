-- Relational Operating Shifts, Operating Hours & Time-Based Menu Links
-- Architecture:
--   1. tenant_operating_shifts: Named service shifts/dayparts per tenant (e.g. Lunch, Dinner, Late Night, or menu_window)
--   2. tenant_operating_hours: Concrete weekly (day_of_week, start_time, end_time) windows belonging to each shift
--   3. menu_category_shifts & menu_item_shifts: Junction tables linking categories/items to operating shifts
--   4. menu_categories.availability_mode / hide_when_unavailable & menu_items.availability_mode for unambiguous 3-tier inheritance

CREATE TABLE IF NOT EXISTS tenant_operating_shifts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    i18n_json TEXT NOT NULL DEFAULT '{}',
    shift_type TEXT NOT NULL DEFAULT 'operating' CHECK(shift_type IN ('operating', 'menu_window')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_operating_shifts_tenant
    ON tenant_operating_shifts(tenant_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS tenant_operating_hours (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    shift_id TEXT NOT NULL,
    day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (shift_id) REFERENCES tenant_operating_shifts(id) ON DELETE CASCADE,
    UNIQUE(tenant_id, shift_id, day_of_week, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS idx_tenant_operating_hours_lookup
    ON tenant_operating_hours(tenant_id, day_of_week, is_active);

CREATE INDEX IF NOT EXISTS idx_tenant_operating_hours_shift
    ON tenant_operating_hours(tenant_id, shift_id);

ALTER TABLE menu_categories
    ADD COLUMN availability_mode TEXT NOT NULL DEFAULT 'all_shifts'
    CHECK(availability_mode IN ('all_shifts', 'selected_shifts'));

ALTER TABLE menu_categories
    ADD COLUMN hide_when_unavailable INTEGER NOT NULL DEFAULT 0;

ALTER TABLE menu_items
    ADD COLUMN availability_mode TEXT NOT NULL DEFAULT 'inherit'
    CHECK(availability_mode IN ('inherit', 'all_shifts', 'selected_shifts'));

CREATE TABLE IF NOT EXISTS menu_category_shifts (
    tenant_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    shift_id TEXT NOT NULL,
    PRIMARY KEY (tenant_id, category_id, shift_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE,
    FOREIGN KEY (shift_id) REFERENCES tenant_operating_shifts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_menu_category_shifts_shift
    ON menu_category_shifts(tenant_id, shift_id);

CREATE TABLE IF NOT EXISTS menu_item_shifts (
    tenant_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    shift_id TEXT NOT NULL,
    PRIMARY KEY (tenant_id, item_id, shift_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
    FOREIGN KEY (shift_id) REFERENCES tenant_operating_shifts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_menu_item_shifts_shift
    ON menu_item_shifts(tenant_id, shift_id);

-- Tenant lifecycle fences (matches 0068_unified_menu_lifecycle_guards.sql)
CREATE TRIGGER IF NOT EXISTS lifecycle_tenant_operating_shifts_insert BEFORE INSERT ON tenant_operating_shifts
WHEN EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=NEW.tenant_id AND state<>'active')
BEGIN SELECT RAISE(ABORT,'TENANT_DELETED'); END;

CREATE TRIGGER IF NOT EXISTS lifecycle_tenant_operating_shifts_update BEFORE UPDATE ON tenant_operating_shifts
WHEN EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=NEW.tenant_id AND state<>'active')
  OR EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=OLD.tenant_id AND state<>'active')
BEGIN SELECT RAISE(ABORT,'TENANT_DELETED'); END;

CREATE TRIGGER IF NOT EXISTS lifecycle_tenant_operating_hours_insert BEFORE INSERT ON tenant_operating_hours
WHEN EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=NEW.tenant_id AND state<>'active')
BEGIN SELECT RAISE(ABORT,'TENANT_DELETED'); END;

CREATE TRIGGER IF NOT EXISTS lifecycle_tenant_operating_hours_update BEFORE UPDATE ON tenant_operating_hours
WHEN EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=NEW.tenant_id AND state<>'active')
  OR EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=OLD.tenant_id AND state<>'active')
BEGIN SELECT RAISE(ABORT,'TENANT_DELETED'); END;

CREATE TRIGGER IF NOT EXISTS lifecycle_menu_category_shifts_insert BEFORE INSERT ON menu_category_shifts
WHEN EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=NEW.tenant_id AND state<>'active')
BEGIN SELECT RAISE(ABORT,'TENANT_DELETED'); END;

CREATE TRIGGER IF NOT EXISTS lifecycle_menu_category_shifts_update BEFORE UPDATE ON menu_category_shifts
WHEN EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=NEW.tenant_id AND state<>'active')
  OR EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=OLD.tenant_id AND state<>'active')
BEGIN SELECT RAISE(ABORT,'TENANT_DELETED'); END;

CREATE TRIGGER IF NOT EXISTS lifecycle_menu_item_shifts_insert BEFORE INSERT ON menu_item_shifts
WHEN EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=NEW.tenant_id AND state<>'active')
BEGIN SELECT RAISE(ABORT,'TENANT_DELETED'); END;

CREATE TRIGGER IF NOT EXISTS lifecycle_menu_item_shifts_update BEFORE UPDATE ON menu_item_shifts
WHEN EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=NEW.tenant_id AND state<>'active')
  OR EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=OLD.tenant_id AND state<>'active')
BEGIN SELECT RAISE(ABORT,'TENANT_DELETED'); END;

-- Revision triggers (matches 0065_unified_option_groups.sql)
CREATE TRIGGER IF NOT EXISTS unified_tenant_operating_shifts_insert AFTER INSERT ON tenant_operating_shifts
BEGIN INSERT INTO menu_catalog_revisions (tenant_id,revision) VALUES (NEW.tenant_id,1) ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS unified_tenant_operating_shifts_update AFTER UPDATE ON tenant_operating_shifts
BEGIN INSERT INTO menu_catalog_revisions (tenant_id,revision) VALUES (NEW.tenant_id,1) ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS unified_tenant_operating_shifts_delete AFTER DELETE ON tenant_operating_shifts
BEGIN INSERT INTO menu_catalog_revisions (tenant_id,revision) VALUES (OLD.tenant_id,1) ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS unified_tenant_operating_hours_insert AFTER INSERT ON tenant_operating_hours
BEGIN INSERT INTO menu_catalog_revisions (tenant_id,revision) VALUES (NEW.tenant_id,1) ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS unified_tenant_operating_hours_update AFTER UPDATE ON tenant_operating_hours
BEGIN INSERT INTO menu_catalog_revisions (tenant_id,revision) VALUES (NEW.tenant_id,1) ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS unified_tenant_operating_hours_delete AFTER DELETE ON tenant_operating_hours
BEGIN INSERT INTO menu_catalog_revisions (tenant_id,revision) VALUES (OLD.tenant_id,1) ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS unified_menu_category_shifts_insert AFTER INSERT ON menu_category_shifts
BEGIN INSERT INTO menu_catalog_revisions (tenant_id,revision) VALUES (NEW.tenant_id,1) ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS unified_menu_category_shifts_delete AFTER DELETE ON menu_category_shifts
BEGIN INSERT INTO menu_catalog_revisions (tenant_id,revision) VALUES (OLD.tenant_id,1) ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS unified_menu_item_shifts_insert AFTER INSERT ON menu_item_shifts
BEGIN INSERT INTO menu_catalog_revisions (tenant_id,revision) VALUES (NEW.tenant_id,1) ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS unified_menu_item_shifts_delete AFTER DELETE ON menu_item_shifts
BEGIN INSERT INTO menu_catalog_revisions (tenant_id,revision) VALUES (OLD.tenant_id,1) ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1; END;
