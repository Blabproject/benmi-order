-- 86. Popup notice shown to customers when they open the ordering page.
-- JSON: {"enabled":bool,"title":string,"body":string,"version":string}; '' or NULL = no notice.
ALTER TABLE tenant_config ADD COLUMN store_notice TEXT DEFAULT NULL;
