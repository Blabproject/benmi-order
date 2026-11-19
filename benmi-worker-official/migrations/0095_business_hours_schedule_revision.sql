-- Opening hours and menu shifts share a revision for cross-device write guards.
-- The existing JSON hours remain canonical; no tenant data is overwritten.
CREATE TRIGGER IF NOT EXISTS schedule_business_hours_update
AFTER UPDATE OF operating_hours ON tenant_config
WHEN NEW.operating_hours IS NOT OLD.operating_hours
BEGIN
  INSERT INTO menu_catalog_revisions (tenant_id, revision) VALUES (NEW.tenant_id, 1)
  ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1;
END;
