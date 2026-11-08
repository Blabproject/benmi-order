-- 85. Thêm cột auto_open_before_minutes vào bảng tenant_config (mặc định 60 phút = 1 tiếng)
ALTER TABLE tenant_config ADD COLUMN auto_open_before_minutes INTEGER DEFAULT 60;
UPDATE tenant_config SET auto_open_before_minutes = 60 WHERE auto_open_before_minutes IS NULL;
