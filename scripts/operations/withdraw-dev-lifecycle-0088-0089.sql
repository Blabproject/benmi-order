-- DEV ONLY: withdrawal of unpublished lifecycle 0088/0089.
-- Archive is detached from orders so future deletions cannot erase the evidence.
CREATE TABLE withdrawn_lifecycle_events_20261114 AS SELECT * FROM order_lifecycle_events;
DROP TRIGGER order_lifecycle_created;
DROP TRIGGER order_lifecycle_status;
DROP TRIGGER order_lifecycle_detail;
DROP TRIGGER order_lifecycle_manual_collection;
DROP TRIGGER order_lifecycle_payment_status;
DROP TRIGGER order_lifecycle_payment_collection;
DROP TRIGGER order_lifecycle_payment_refund;
DROP TRIGGER order_lifecycle_event_immutable;
DROP TRIGGER manual_settlement_order_guard;
DROP TRIGGER manual_settlement_delete_guard;
DROP TRIGGER manual_settlement_items_insert;
DROP TRIGGER manual_settlement_items_delete;
DROP TRIGGER manual_settlement_items_update;
DROP TRIGGER manual_settlement_detail_guard;
DROP VIEW order_lifecycle_summary;
DROP TABLE order_lifecycle_events;
DELETE FROM d1_migrations WHERE name IN ('0088_order_lifecycle_events.sql','0089_manual_settlement_guards.sql');
