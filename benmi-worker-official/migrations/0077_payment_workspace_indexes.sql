-- Additive indexes only; payment amounts, statuses and guards stay untouched.
CREATE INDEX IF NOT EXISTS payments_tenant_created ON payments(tenant_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS payments_tenant_status_created ON payments(tenant_id, status, created_at);
