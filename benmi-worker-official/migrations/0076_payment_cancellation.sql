-- Legacy rows cannot prove whether a Confirm was ever sent.
ALTER TABLE payments ADD COLUMN confirmation_guard_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN confirmation_started_at INTEGER;
ALTER TABLE payments ADD COLUMN cancel_requested_at INTEGER;
-- Preserve uncertainty from legacy Confirm attempts; null is not evidence of no capture.
UPDATE payments SET confirmation_started_at=created_at
WHERE status IN ('CONFIRMING','UNKNOWN') OR EXISTS
 (SELECT 1 FROM payment_events e WHERE e.payment_id=payments.id AND e.event IN ('CONFIRMING','UNKNOWN'));
-- Also fence older Worker instances during a rolling deployment.
CREATE TRIGGER payment_cancel_terminal_guard BEFORE UPDATE ON payments
WHEN OLD.status='CANCELLED' AND NEW.status<>'CANCELLED'
BEGIN SELECT RAISE(ABORT,'PAYMENT_CANCELLED'); END;
CREATE TRIGGER payment_confirm_cancel_guard BEFORE UPDATE ON payments
WHEN NEW.status='CONFIRMING' AND (NEW.cancel_requested_at IS NOT NULL OR
 (NEW.confirmation_guard_version=1 AND NEW.confirmation_started_at IS NULL))
BEGIN SELECT RAISE(ABORT,'PAYMENT_CONFIRM_BLOCKED'); END;
CREATE TRIGGER payment_confirm_intent_immutable BEFORE UPDATE ON payments
WHEN OLD.confirmation_started_at IS NOT NULL AND NEW.confirmation_started_at IS NOT OLD.confirmation_started_at
BEGIN SELECT RAISE(ABORT,'PAYMENT_CONFIRM_INTENT_IMMUTABLE'); END;
