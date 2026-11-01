-- Additive, disabled until a tenant connection is explicitly provisioned.
CREATE TABLE tenant_payment_connections (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, environment TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('sandbox','production')), channel_id TEXT NOT NULL,
 encrypted_secret TEXT NOT NULL, key_version TEXT NOT NULL, return_url TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)), created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX payment_connection_current ON tenant_payment_connections(tenant_id,environment) WHERE enabled=1;
CREATE TABLE payments (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, order_key TEXT NOT NULL REFERENCES orders(key),
 connection_id TEXT NOT NULL REFERENCES tenant_payment_connections(id),
 operation_id TEXT NOT NULL, request_hash TEXT NOT NULL, capability_hash TEXT NOT NULL,
 provider_order_id TEXT NOT NULL UNIQUE, transaction_id TEXT, amount INTEGER NOT NULL CHECK(amount>0),
 currency TEXT NOT NULL DEFAULT 'TWD' CHECK(currency='TWD'),
 status TEXT NOT NULL CHECK(status IN ('REQUESTING','PENDING','CONFIRMING','UNKNOWN','PAID','CANCELLED','FAILED','REFUND_PENDING','REFUNDED','REFUND_FAILED')),
 payment_url TEXT, app_url TEXT, result_code TEXT, paid_at INTEGER, refunded_at INTEGER,
 lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(tenant_id,operation_id), UNIQUE(tenant_id,order_key), UNIQUE(connection_id,transaction_id)
);
CREATE INDEX payments_due ON payments(status,next_attempt_at);
CREATE TABLE payment_refunds (
 id TEXT PRIMARY KEY, payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id), tenant_id TEXT NOT NULL,
 operation_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), reason TEXT NOT NULL,
 actor TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('PENDING','PROCESSING','UNKNOWN','SUCCEEDED','FAILED')),
 transaction_id TEXT, result_code TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(tenant_id,operation_id)
);
CREATE TABLE payment_events (
 id INTEGER PRIMARY KEY, payment_id TEXT NOT NULL REFERENCES payments(id),
 event TEXT NOT NULL, result_code TEXT, created_at INTEGER NOT NULL
);
-- Protect every legacy, staff and webhook write, including direct SQL paths.
CREATE TRIGGER payment_order_money_guard BEFORE UPDATE ON orders
WHEN EXISTS(SELECT 1 FROM payments p WHERE p.tenant_id=OLD.tenant_id AND p.order_key=OLD.key)
BEGIN
 SELECT CASE WHEN NEW.total_amount IS NOT OLD.total_amount OR NEW.order_content IS NOT OLD.order_content
  OR NEW.detail_revision IS NOT OLD.detail_revision OR NEW.round_count IS NOT OLD.round_count
  OR NEW.dining_option IS NOT OLD.dining_option OR NEW.tenant_id IS NOT OLD.tenant_id
  OR NEW.key IS NOT OLD.key OR NEW.order_id IS NOT OLD.order_id OR NEW.user_id IS NOT OLD.user_id
  THEN RAISE(ABORT,'PAYMENT_ORDER_LOCKED') END;
 SELECT CASE WHEN NEW.status IN ('WAITING_CUSTOMER_CHANGE','PAID')
  THEN RAISE(ABORT,'PAYMENT_ORDER_LOCKED') END;
 SELECT CASE WHEN OLD.status='PENDING_PAYMENT' AND NEW.status<>'PENDING_PAYMENT'
  AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.tenant_id=OLD.tenant_id AND p.order_key=OLD.key AND p.paid_at IS NOT NULL)
  THEN RAISE(ABORT,'PAYMENT_NOT_PAID') END;
END;
CREATE TRIGGER payment_order_delete_guard BEFORE DELETE ON orders
WHEN EXISTS(SELECT 1 FROM payments WHERE tenant_id=OLD.tenant_id AND order_key=OLD.key)
BEGIN SELECT RAISE(ABORT,'PAYMENT_ORDER_LOCKED'); END;
CREATE TRIGGER payment_detail_guard BEFORE INSERT ON order_detail_snapshots
WHEN EXISTS(SELECT 1 FROM payments WHERE tenant_id=NEW.tenant_id AND order_key=NEW.order_key)
BEGIN SELECT RAISE(ABORT,'PAYMENT_ORDER_LOCKED'); END;
CREATE TRIGGER payment_publish_guard BEFORE INSERT ON payment_events
WHEN NEW.event='publish' AND NOT EXISTS(SELECT 1 FROM payments WHERE id=NEW.payment_id
 AND lease_token=NEW.result_code AND lease_until>NEW.created_at AND paid_at IS NULL)
BEGIN SELECT RAISE(ABORT,'PAYMENT_LEASE_LOST'); END;
CREATE TRIGGER payment_items_insert_guard BEFORE INSERT ON order_items
WHEN EXISTS(SELECT 1 FROM payments WHERE tenant_id=NEW.tenant_id AND order_key=NEW.order_key)
BEGIN SELECT RAISE(ABORT,'PAYMENT_ORDER_LOCKED'); END;
CREATE TRIGGER payment_items_update_guard BEFORE UPDATE ON order_items
WHEN EXISTS(SELECT 1 FROM payments WHERE tenant_id=OLD.tenant_id AND order_key=OLD.order_key)
BEGIN SELECT RAISE(ABORT,'PAYMENT_ORDER_LOCKED'); END;
CREATE TRIGGER payment_items_delete_guard BEFORE DELETE ON order_items
WHEN EXISTS(SELECT 1 FROM payments WHERE tenant_id=OLD.tenant_id AND order_key=OLD.order_key)
BEGIN SELECT RAISE(ABORT,'PAYMENT_ORDER_LOCKED'); END;
CREATE TABLE payment_rate_limits(scope TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL);
