-- Add support for staff takeaway orders without table binding.
-- When source='staff' and dining_option='takeaway': table_id and table_number are NULL/empty.
-- When source='staff' and dining_option='dine_in': table_id must exist in restaurant_tables and match table_number.

DROP TRIGGER IF EXISTS staff_order_write_guard;
CREATE TRIGGER staff_order_write_guard BEFORE INSERT ON orders WHEN NEW.source='staff'
BEGIN
  SELECT CASE
    WHEN COALESCE(NEW.dining_option, 'dine_in') = 'dine_in' AND NOT EXISTS (
      SELECT 1 FROM restaurant_tables t
      WHERE t.id = NEW.table_id AND t.tenant_id = NEW.tenant_id AND t.is_active = 1 AND t.label = NEW.table_number
    ) THEN RAISE(ABORT, 'TABLE_NOT_AVAILABLE')
    WHEN COALESCE(NEW.dining_option, 'dine_in') = 'takeaway' AND (NEW.table_id IS NOT NULL OR (NEW.table_number IS NOT NULL AND NEW.table_number <> ''))
    THEN RAISE(ABORT, 'INVALID_TAKEAWAY_TABLE')
  END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM tenant_lifecycle WHERE tenant_id=NEW.tenant_id AND state<>'active')
    THEN RAISE(ABORT,'TENANT_DELETED') END;
END;
