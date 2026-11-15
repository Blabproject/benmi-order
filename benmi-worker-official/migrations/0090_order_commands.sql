-- Replacement for the withdrawn Dev-only 0088/0089 experiment.
-- Single authoritative orders.status; legacy aliases belong at API boundaries.
-- Deploy only together with the canonical readers/writers (see redesign STATUS).
CREATE TABLE order_state_legacy_baselines (
 tenant_id TEXT NOT NULL,order_key TEXT NOT NULL,legacy_status TEXT NOT NULL,legacy_revision INTEGER NOT NULL,
 observed_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%d %H:%M:%f','now')),PRIMARY KEY(tenant_id,order_key)
);
INSERT INTO order_state_legacy_baselines(tenant_id,order_key,legacy_status,legacy_revision)
 SELECT tenant_id,key,status,revision FROM orders;
CREATE TRIGGER order_state_baseline_immutable BEFORE UPDATE ON order_state_legacy_baselines
BEGIN SELECT RAISE(ABORT,'ORDER_BASELINE_IMMUTABLE'); END;
DROP TRIGGER orders_staff_revision_guard;
UPDATE orders SET status=CASE status
 WHEN 'DONE' THEN 'READY' WHEN 'PICKED_UP' THEN 'COMPLETED' WHEN 'PAID' THEN 'COMPLETED'
 WHEN 'REJECTED' THEN 'CANCELLED' WHEN 'FORCE_REJECT' THEN 'CANCELLED' ELSE status END,
 revision=revision+1
WHERE status IN ('DONE','PICKED_UP','PAID','REJECTED','FORCE_REJECT');
CREATE TRIGGER orders_staff_revision_guard BEFORE UPDATE OF revision,status,total_amount,order_content,note,round_count,detail_revision,source,table_id,table_number ON orders
WHEN OLD.source='staff' OR NEW.source='staff'
BEGIN SELECT CASE WHEN NEW.revision<>OLD.revision+1 THEN RAISE(ABORT,'STAFF_REVISION_CONFLICT') END; END;
DROP INDEX idx_orders_active_staff_table;
CREATE UNIQUE INDEX idx_orders_active_staff_table ON orders(tenant_id,table_id)
WHERE source='staff' AND status NOT IN ('COMPLETED','CANCELLED','EXPIRED');
DROP TRIGGER staff_table_occupied_guard;
CREATE TRIGGER staff_table_occupied_guard BEFORE UPDATE ON restaurant_tables
WHEN (NEW.label<>OLD.label OR NEW.is_active=0) AND EXISTS (
 SELECT 1 FROM orders WHERE tenant_id=OLD.tenant_id AND table_id=OLD.id AND source='staff'
 AND status NOT IN ('COMPLETED','CANCELLED','EXPIRED'))
BEGIN SELECT RAISE(ABORT,'TABLE_HAS_ACTIVE_ORDER'); END;
CREATE UNIQUE INDEX idx_orders_tenant_identity ON orders(tenant_id,key);
CREATE TABLE order_commands (
 tenant_id TEXT NOT NULL, operation_id TEXT NOT NULL, order_key TEXT NOT NULL,
 request_hash TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
 expected_revision INTEGER NOT NULL CHECK(expected_revision>=0),
 previous_status TEXT NOT NULL, next_status TEXT NOT NULL,
 expected_amount REAL NOT NULL, expected_detail_revision INTEGER NOT NULL,
 expected_payment_id TEXT, expected_payment_status TEXT, expected_payment_updated_at INTEGER,
 response_json TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,operation_id),
 FOREIGN KEY(tenant_id,order_key) REFERENCES orders(tenant_id,key)
);
CREATE INDEX idx_order_commands_order ON order_commands(tenant_id,order_key,created_at);
CREATE TRIGGER order_command_revision_guard BEFORE INSERT ON order_commands
WHEN NOT EXISTS(SELECT 1 FROM orders o WHERE o.tenant_id=NEW.tenant_id AND o.key=NEW.order_key
 AND o.revision=NEW.expected_revision AND o.status=NEW.previous_status
 AND o.total_amount=NEW.expected_amount AND o.detail_revision=NEW.expected_detail_revision)
BEGIN SELECT RAISE(ABORT,'ORDER_REVISION_CONFLICT'); END;
CREATE TRIGGER order_command_session_guard BEFORE INSERT ON order_commands
WHEN NOT EXISTS(SELECT 1 FROM staff_sessions WHERE tenant_id=NEW.tenant_id AND token_hash=NEW.actor
 AND revoked_at IS NULL AND datetime(expires_at)>datetime('now'))
BEGIN SELECT RAISE(ABORT,'ORDER_SESSION_EXPIRED'); END;
CREATE TRIGGER order_command_payment_guard BEFORE INSERT ON order_commands
WHEN (NEW.expected_payment_id IS NULL AND EXISTS(SELECT 1 FROM payments WHERE tenant_id=NEW.tenant_id AND order_key=NEW.order_key))
 OR (NEW.expected_payment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payments WHERE tenant_id=NEW.tenant_id AND order_key=NEW.order_key
 AND id=NEW.expected_payment_id AND status=NEW.expected_payment_status AND updated_at=NEW.expected_payment_updated_at))
BEGIN SELECT RAISE(ABORT,'ORDER_PAYMENT_CONFLICT'); END;
CREATE TRIGGER order_command_pending_guard BEFORE INSERT ON order_commands
WHEN NEW.action IN ('complete','accept','mark_ready') AND EXISTS(SELECT 1 FROM pending_actions WHERE tenant_id=NEW.tenant_id AND order_key=NEW.order_key)
BEGIN SELECT RAISE(ABORT,'PENDING_ACTION_UNRESOLVED'); END;
CREATE TRIGGER order_command_immutable BEFORE UPDATE ON order_commands
BEGIN SELECT RAISE(ABORT,'ORDER_COMMAND_IMMUTABLE'); END;
CREATE TABLE order_completions (
 tenant_id TEXT NOT NULL,order_key TEXT NOT NULL,operation_id TEXT,
 amount REAL NOT NULL,detail_revision INTEGER NOT NULL,completed_at TEXT,
 evidence TEXT NOT NULL CHECK(evidence IN ('legacy_status','command')),
 PRIMARY KEY(tenant_id,order_key),
 FOREIGN KEY(tenant_id,order_key) REFERENCES orders(tenant_id,key),
 FOREIGN KEY(tenant_id,operation_id) REFERENCES order_commands(tenant_id,operation_id)
);
-- Historical completion does not prove time, currency or collection.
INSERT INTO order_completions(tenant_id,order_key,amount,detail_revision,evidence)
 SELECT tenant_id,key,total_amount,detail_revision,'legacy_status' FROM orders WHERE status='COMPLETED';
CREATE INDEX idx_order_completions_period ON order_completions(tenant_id,completed_at);
CREATE TRIGGER completion_command_guard BEFORE INSERT ON order_completions
WHEN NEW.evidence<>'command' OR NOT EXISTS(
 SELECT 1 FROM order_commands c JOIN orders o ON o.tenant_id=c.tenant_id AND o.key=c.order_key
 WHERE c.tenant_id=NEW.tenant_id AND c.operation_id=NEW.operation_id AND c.order_key=NEW.order_key
 AND c.action='complete' AND c.next_status='COMPLETED' AND o.status='COMPLETED'
 AND o.revision=c.expected_revision+1 AND NEW.amount=o.total_amount
 AND NEW.detail_revision=o.detail_revision AND NEW.completed_at=c.created_at)
BEGIN SELECT RAISE(ABORT,'COMPLETION_COMMAND_REQUIRED'); END;
CREATE TRIGGER completion_immutable BEFORE UPDATE ON order_completions
BEGIN SELECT RAISE(ABORT,'COMPLETION_IMMUTABLE'); END;
CREATE TABLE manual_payment_entries (
 tenant_id TEXT NOT NULL,order_key TEXT NOT NULL,operation_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('collected','refunded')),
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0),currency TEXT NOT NULL CHECK(currency='TWD'),
 currency_scale INTEGER NOT NULL DEFAULT 100 CHECK(currency_scale=100),
 method TEXT NOT NULL CHECK(method IN ('cash','bank_transfer','other')),
 actor TEXT NOT NULL,occurred_at TEXT NOT NULL,reason TEXT,
 PRIMARY KEY(tenant_id,operation_id), UNIQUE(tenant_id,order_key,kind),
 FOREIGN KEY(tenant_id,order_key) REFERENCES orders(tenant_id,key),
 FOREIGN KEY(tenant_id,operation_id) REFERENCES order_commands(tenant_id,operation_id)
);
CREATE TRIGGER manual_entry_command_guard BEFORE INSERT ON manual_payment_entries
WHEN NOT EXISTS(SELECT 1 FROM order_commands c JOIN orders o ON o.tenant_id=c.tenant_id AND o.key=c.order_key
 WHERE c.tenant_id=NEW.tenant_id AND c.operation_id=NEW.operation_id AND c.order_key=NEW.order_key
 AND c.actor=NEW.actor AND o.revision=c.expected_revision+1
 AND ((NEW.kind='collected' AND c.action='complete' AND NEW.amount_minor=CAST(round(o.total_amount*100) AS INTEGER)) OR (NEW.kind='refunded' AND c.action='refund_manual')))
 OR EXISTS(SELECT 1 FROM payments WHERE tenant_id=NEW.tenant_id AND order_key=NEW.order_key)
BEGIN SELECT RAISE(ABORT,'MANUAL_PAYMENT_COMMAND_REQUIRED'); END;
CREATE TRIGGER manual_refund_guard BEFORE INSERT ON manual_payment_entries WHEN NEW.kind='refunded'
BEGIN SELECT CASE WHEN NEW.reason IS NULL OR length(trim(NEW.reason))=0 OR NOT EXISTS(
 SELECT 1 FROM manual_payment_entries r WHERE r.tenant_id=NEW.tenant_id AND r.order_key=NEW.order_key
 AND r.kind='collected' AND r.amount_minor=NEW.amount_minor AND r.currency=NEW.currency AND r.method=NEW.method)
 THEN RAISE(ABORT,'MANUAL_REFUND_INVALID') END; END;
CREATE TRIGGER manual_entry_immutable BEFORE UPDATE ON manual_payment_entries
BEGIN SELECT RAISE(ABORT,'MANUAL_PAYMENT_IMMUTABLE'); END;
CREATE TRIGGER canonical_order_insert_guard BEFORE INSERT ON orders
WHEN NEW.status NOT IN ('NEW','ACCEPTED','PENDING_PAYMENT')
BEGIN SELECT RAISE(ABORT,'INVALID_INITIAL_ORDER_STATE'); END;
CREATE TRIGGER canonical_order_update_guard BEFORE UPDATE ON orders
BEGIN
 SELECT CASE WHEN NEW.status NOT IN ('PENDING_PAYMENT','NEW','ACCEPTED','READY','COMPLETED','CANCELLED','EXPIRED','WAITING_CUSTOMER_CHANGE','WAITING_CUSTOMER_REJECT')
 THEN RAISE(ABORT,'INVALID_ORDER_STATE') END;
 SELECT CASE WHEN NEW.key IS NOT OLD.key OR NEW.tenant_id IS NOT OLD.tenant_id
 THEN RAISE(ABORT,'ORDER_IDENTITY_IMMUTABLE') END;
 SELECT CASE WHEN OLD.status IN ('COMPLETED','CANCELLED','EXPIRED') AND
 (NEW.status IS NOT OLD.status OR NEW.total_amount IS NOT OLD.total_amount OR NEW.order_content IS NOT OLD.order_content
 OR NEW.detail_revision IS NOT OLD.detail_revision OR NEW.round_count IS NOT OLD.round_count)
 THEN RAISE(ABORT,'ORDER_FINALIZED') END;
 SELECT CASE WHEN NEW.status='COMPLETED' AND OLD.status<>'COMPLETED' AND NOT EXISTS(
 SELECT 1 FROM order_commands c WHERE c.tenant_id=OLD.tenant_id AND c.order_key=OLD.key
 AND c.expected_revision=OLD.revision AND c.previous_status=OLD.status AND c.action='complete'
 AND c.next_status=NEW.status AND NEW.revision=OLD.revision+1)
 THEN RAISE(ABORT,'COMPLETION_COMMAND_REQUIRED') END;
END;
-- Financial/completion evidence is append-only, including direct SQL writers.
CREATE TRIGGER completion_delete_guard BEFORE DELETE ON order_completions
BEGIN SELECT RAISE(ABORT,'COMPLETION_IMMUTABLE'); END;
CREATE TRIGGER manual_entry_delete_guard BEFORE DELETE ON manual_payment_entries
BEGIN SELECT RAISE(ABORT,'MANUAL_PAYMENT_IMMUTABLE'); END;
CREATE TRIGGER command_delete_guard BEFORE DELETE ON order_commands
BEGIN SELECT RAISE(ABORT,'ORDER_COMMAND_IMMUTABLE'); END;
CREATE TRIGGER terminal_detail_guard BEFORE INSERT ON order_detail_snapshots
WHEN EXISTS(SELECT 1 FROM orders WHERE tenant_id=NEW.tenant_id AND key=NEW.order_key AND status IN ('COMPLETED','CANCELLED','EXPIRED'))
BEGIN SELECT RAISE(ABORT,'ORDER_FINALIZED'); END;
CREATE TRIGGER terminal_items_insert BEFORE INSERT ON order_items
WHEN EXISTS(SELECT 1 FROM orders WHERE tenant_id=NEW.tenant_id AND key=NEW.order_key AND status IN ('COMPLETED','CANCELLED','EXPIRED'))
BEGIN SELECT RAISE(ABORT,'ORDER_FINALIZED'); END;
CREATE TRIGGER terminal_items_delete BEFORE DELETE ON order_items
WHEN EXISTS(SELECT 1 FROM orders WHERE tenant_id=OLD.tenant_id AND key=OLD.order_key AND status IN ('COMPLETED','CANCELLED','EXPIRED'))
BEGIN SELECT RAISE(ABORT,'ORDER_FINALIZED'); END;
CREATE TRIGGER terminal_items_update BEFORE UPDATE ON order_items
WHEN (EXISTS(SELECT 1 FROM orders WHERE tenant_id=OLD.tenant_id AND key=OLD.order_key AND status IN ('COMPLETED','CANCELLED','EXPIRED'))
 OR EXISTS(SELECT 1 FROM orders WHERE tenant_id=NEW.tenant_id AND key=NEW.order_key AND status IN ('COMPLETED','CANCELLED','EXPIRED')))
 AND (NEW.tenant_id IS NOT OLD.tenant_id OR NEW.order_key IS NOT OLD.order_key OR NEW.round_number IS NOT OLD.round_number
 OR NEW.item_id IS NOT OLD.item_id OR NEW.item_name IS NOT OLD.item_name OR NEW.category_name IS NOT OLD.category_name
 OR NEW.quantity IS NOT OLD.quantity OR NEW.unit_price IS NOT OLD.unit_price OR NEW.subtotal IS NOT OLD.subtotal
 OR NEW.selected_options IS NOT OLD.selected_options OR NEW.bundle_snapshot_json IS NOT OLD.bundle_snapshot_json)
BEGIN SELECT RAISE(ABORT,'ORDER_FINALIZED'); END;
-- Legacy writers must invalidate an observed command revision as well.
CREATE TRIGGER order_revision_advance AFTER UPDATE OF status,total_amount,order_content,detail_revision,round_count,pickup_time,table_id ON orders
WHEN NEW.revision=OLD.revision AND (NEW.status IS NOT OLD.status OR NEW.total_amount IS NOT OLD.total_amount
 OR NEW.order_content IS NOT OLD.order_content OR NEW.detail_revision IS NOT OLD.detail_revision
 OR NEW.round_count IS NOT OLD.round_count OR NEW.pickup_time IS NOT OLD.pickup_time OR NEW.table_id IS NOT OLD.table_id)
BEGIN UPDATE orders SET revision=revision+1 WHERE tenant_id=NEW.tenant_id AND key=NEW.key; END;
CREATE TRIGGER order_revision_monotonic BEFORE UPDATE OF revision ON orders
WHEN NEW.revision<OLD.revision OR NEW.revision>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'ORDER_REVISION_CONFLICT'); END;
CREATE TABLE pos_session_attempts (
 scope TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL CHECK(attempts>0)
);
-- Provider refund outcome and service cancellation commit behind the same lease fence.
CREATE TRIGGER payment_refund_commit_guard BEFORE INSERT ON payment_events
WHEN NEW.event='refund_commit' AND NOT EXISTS(SELECT 1 FROM payments WHERE id=NEW.payment_id
 AND lease_token=NEW.result_code AND lease_until>NEW.created_at AND status='REFUND_PENDING' AND paid_at IS NOT NULL AND refunded_at IS NULL)
BEGIN SELECT RAISE(ABORT,'PAYMENT_LEASE_LOST'); END;
-- Pending proposals have a concrete identity; old message buttons cannot target a newer proposal.
ALTER TABLE pending_actions ADD COLUMN action_id TEXT;
ALTER TABLE pending_actions ADD COLUMN order_revision INTEGER;
ALTER TABLE pending_actions ADD COLUMN created_ms INTEGER;
ALTER TABLE pending_actions ADD COLUMN expires_ms INTEGER;
CREATE UNIQUE INDEX idx_pending_action_id ON pending_actions(tenant_id,action_id) WHERE action_id IS NOT NULL;
-- Old rows keep null identities and require staff review; no invented historical consent.
CREATE TRIGGER pending_action_identity_insert AFTER INSERT ON pending_actions WHEN NEW.action_id IS NULL
BEGIN UPDATE pending_actions SET action_id=lower(hex(randomblob(16))),
 order_revision=(SELECT revision FROM orders WHERE tenant_id=NEW.tenant_id AND key=NEW.order_key),
 created_ms=CAST(unixepoch('now','subsec')*1000 AS INTEGER),expires_ms=CAST(unixepoch('now','subsec')*1000 AS INTEGER)+86400000
 WHERE tenant_id=NEW.tenant_id AND user_id=NEW.user_id AND order_key=NEW.order_key; END;
CREATE TRIGGER pending_action_identity_replace AFTER UPDATE OF action_type,question_text,reason,note,created_at ON pending_actions
BEGIN UPDATE pending_actions SET action_id=lower(hex(randomblob(16))),
 order_revision=(SELECT revision FROM orders WHERE tenant_id=NEW.tenant_id AND key=NEW.order_key),
 created_ms=CAST(unixepoch('now','subsec')*1000 AS INTEGER),expires_ms=CAST(unixepoch('now','subsec')*1000 AS INTEGER)+86400000
 WHERE tenant_id=NEW.tenant_id AND user_id=NEW.user_id AND order_key=NEW.order_key; END;
CREATE TABLE order_pending_resolutions (
 tenant_id TEXT NOT NULL,action_id TEXT NOT NULL,order_key TEXT NOT NULL,user_id TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('cancel','resume','accept_time','request_items')),
 expected_revision INTEGER NOT NULL,next_status TEXT NOT NULL,reply_text TEXT NOT NULL DEFAULT '',
 resolved_at INTEGER NOT NULL,PRIMARY KEY(tenant_id,action_id),
 FOREIGN KEY(tenant_id,order_key) REFERENCES orders(tenant_id,key)
);
CREATE TRIGGER pending_resolution_guard BEFORE INSERT ON order_pending_resolutions
WHEN NOT EXISTS(SELECT 1 FROM pending_actions p JOIN orders o ON o.tenant_id=p.tenant_id AND o.key=p.order_key
 WHERE p.tenant_id=NEW.tenant_id AND p.action_id=NEW.action_id AND p.order_key=NEW.order_key AND p.user_id=NEW.user_id
 AND o.user_id=NEW.user_id AND o.revision=NEW.expected_revision AND p.order_revision=o.revision
 AND p.expires_ms>NEW.resolved_at AND p.expires_ms>CAST(unixepoch('now','subsec')*1000 AS INTEGER) AND p.created_ms<=NEW.resolved_at
 AND ((NEW.decision='cancel' AND NEW.next_status='CANCELLED')
 OR (NEW.next_status='NEW' AND ((NEW.decision='resume' AND p.action_type='REJECT')
 OR (NEW.decision='accept_time' AND p.action_type='CHANGE' AND p.reason='時間需調整')
 OR (NEW.decision='request_items' AND p.action_type='CHANGE' AND p.reason<>'時間需調整' AND length(trim(NEW.reply_text)) BETWEEN 1 AND 2000))))
 AND o.status IN ('NEW','ACCEPTED','READY','WAITING_CUSTOMER_CHANGE','WAITING_CUSTOMER_REJECT'))
BEGIN SELECT RAISE(ABORT,'PENDING_ACTION_STALE'); END;
CREATE TRIGGER pending_resolution_immutable BEFORE UPDATE ON order_pending_resolutions
BEGIN SELECT RAISE(ABORT,'PENDING_RESOLUTION_IMMUTABLE'); END;

CREATE TRIGGER pending_resolution_delete_guard BEFORE DELETE ON order_pending_resolutions
BEGIN SELECT RAISE(ABORT,'PENDING_RESOLUTION_IMMUTABLE'); END;
