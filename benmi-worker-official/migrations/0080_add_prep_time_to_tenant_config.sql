-- 80. Thêm cột prep_time_minutes vào bảng tenant_config (mặc định 5 phút)
ALTER TABLE tenant_config ADD COLUMN prep_time_minutes INTEGER DEFAULT 5;
UPDATE tenant_config SET prep_time_minutes = 5 WHERE prep_time_minutes IS NULL;
