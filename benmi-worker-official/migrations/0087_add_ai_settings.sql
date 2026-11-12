-- Preserve all existing reply behavior until a store changes its settings in POS.
ALTER TABLE tenant_config ADD COLUMN ai_settings TEXT NOT NULL DEFAULT '{}';
