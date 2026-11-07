-- 81. Thêm cột payment_methods vào bảng tenant_config (JSON array các phương thức thanh toán)
ALTER TABLE tenant_config ADD COLUMN payment_methods TEXT DEFAULT '["line_pay"]';
UPDATE tenant_config SET payment_methods = '["line_pay"]' WHERE payment_methods IS NULL;
