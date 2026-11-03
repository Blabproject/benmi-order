-- Match tenant-scoped item hydration and its order_key, round_number, id ordering.
-- id is INTEGER PRIMARY KEY (rowid), already the tie-breaker in this index.
CREATE INDEX IF NOT EXISTS idx_order_items_tenant_key_round
ON order_items (tenant_id, order_key, round_number);
