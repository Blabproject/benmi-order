-- Remove staff_order_write_guard trigger.
-- 100% of order validation logic (tables, dining option, tenant lifecycle) is handled in application code (TypeScript).
DROP TRIGGER IF EXISTS staff_order_write_guard;
