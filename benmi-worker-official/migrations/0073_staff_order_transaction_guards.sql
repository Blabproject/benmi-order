-- Additive staff runtime foundation. Never enable a tenant or alter historical orders.
ALTER TABLE staff_sessions ADD COLUMN pin_hash TEXT;
DROP TRIGGER IF EXISTS orders_staff_revision_guard;
CREATE TRIGGER orders_staff_revision_guard BEFORE UPDATE OF revision,status,total_amount,order_content,note,round_count,detail_revision,source,table_id,table_number ON orders
WHEN OLD.source='staff' OR NEW.source='staff'
BEGIN
  SELECT CASE WHEN NEW.revision<0 OR NEW.revision<>OLD.revision+1
    THEN RAISE(ABORT,'STAFF_REVISION_CONFLICT') END;
  SELECT CASE WHEN OLD.status IN ('PAID','REJECTED','PICKED_UP','EXPIRED','FORCE_REJECT')
    THEN RAISE(ABORT,'ORDER_LOCKED') END;
END;
-- Keep table occupancy semantics identical for every terminal status.
DROP INDEX idx_orders_active_staff_table;
CREATE UNIQUE INDEX idx_orders_active_staff_table ON orders(tenant_id,table_id)
WHERE source='staff' AND status NOT IN ('PAID','REJECTED','PICKED_UP','EXPIRED','FORCE_REJECT');
CREATE TRIGGER staff_order_write_guard BEFORE INSERT ON orders WHEN NEW.source='staff'
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM restaurant_tables t
    WHERE t.id=NEW.table_id AND t.tenant_id=NEW.tenant_id AND t.is_active=1 AND t.label=NEW.table_number)
    THEN RAISE(ABORT,'TABLE_NOT_AVAILABLE') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM tenant_lifecycle WHERE tenant_id=NEW.tenant_id AND state<>'active')
    THEN RAISE(ABORT,'TENANT_DELETED') END;
END;
CREATE TRIGGER staff_table_occupied_guard BEFORE UPDATE ON restaurant_tables
WHEN (NEW.label<>OLD.label OR NEW.is_active=0) AND EXISTS (
  SELECT 1 FROM orders WHERE tenant_id=OLD.tenant_id AND table_id=OLD.id AND source='staff'
    AND status NOT IN ('PAID','REJECTED','PICKED_UP','EXPIRED','FORCE_REJECT'))
BEGIN SELECT RAISE(ABORT,'TABLE_HAS_ACTIVE_ORDER'); END;
