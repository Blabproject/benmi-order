-- Purchase Prerequisite / Conditional Add-On Rules
-- Architecture:
--   1. menu_categories.prerequisite_mode: 'none' (default) | 'require_any'
--   2. menu_items.prerequisite_mode: 'inherit' (default) | 'none' | 'require_any'
--   3. menu_prerequisite_links: Relational junction table linking a category or item
--      to one or more qualifying parent categories or items (e.g. 加點 requires 麻辣鴨血).

ALTER TABLE menu_categories
    ADD COLUMN prerequisite_mode TEXT NOT NULL DEFAULT 'none'
    CHECK(prerequisite_mode IN ('none', 'require_any'));

ALTER TABLE menu_items
    ADD COLUMN prerequisite_mode TEXT NOT NULL DEFAULT 'inherit'
    CHECK(prerequisite_mode IN ('inherit', 'none', 'require_any'));

CREATE TABLE IF NOT EXISTS menu_prerequisite_links (
    tenant_id TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK(source_type IN ('category', 'item')),
    source_id TEXT NOT NULL,
    required_type TEXT NOT NULL CHECK(required_type IN ('category', 'item')),
    required_id TEXT NOT NULL,
    min_quantity INTEGER NOT NULL DEFAULT 1 CHECK(min_quantity >= 1),
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, source_type, source_id, required_type, required_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_menu_prerequisite_links_source
    ON menu_prerequisite_links(tenant_id, source_type, source_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_menu_prerequisite_links_required
    ON menu_prerequisite_links(tenant_id, required_type, required_id);

-- Tenant lifecycle fences (matches 0068_unified_menu_lifecycle_guards.sql & 0094)
CREATE TRIGGER IF NOT EXISTS lifecycle_menu_prerequisite_links_insert BEFORE INSERT ON menu_prerequisite_links
WHEN EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=NEW.tenant_id AND state<>'active')
BEGIN SELECT RAISE(ABORT,'TENANT_DELETED'); END;

CREATE TRIGGER IF NOT EXISTS lifecycle_menu_prerequisite_links_update BEFORE UPDATE ON menu_prerequisite_links
WHEN EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=NEW.tenant_id AND state<>'active')
  OR EXISTS(SELECT 1 FROM tenant_lifecycle WHERE tenant_id=OLD.tenant_id AND state<>'active')
BEGIN SELECT RAISE(ABORT,'TENANT_DELETED'); END;

-- Catalog revision triggers (matches 0065_unified_option_groups.sql & 0094)
CREATE TRIGGER IF NOT EXISTS unified_menu_prerequisite_links_insert AFTER INSERT ON menu_prerequisite_links
BEGIN INSERT INTO menu_catalog_revisions (tenant_id,revision) VALUES (NEW.tenant_id,1) ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS unified_menu_prerequisite_links_update AFTER UPDATE ON menu_prerequisite_links
BEGIN INSERT INTO menu_catalog_revisions (tenant_id,revision) VALUES (NEW.tenant_id,1) ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS unified_menu_prerequisite_links_delete AFTER DELETE ON menu_prerequisite_links
BEGIN INSERT INTO menu_catalog_revisions (tenant_id,revision) VALUES (OLD.tenant_id,1) ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1; END;
