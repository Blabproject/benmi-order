-- 0079_customer_order_history_index.sql
-- Composite index for tenant-scoped customer order history keyset pagination
CREATE INDEX IF NOT EXISTS idx_orders_tenant_user_created ON orders(tenant_id, user_id, created_at DESC, key DESC);
