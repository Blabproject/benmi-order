-- Migration: 0082_enable_table_qr_ordering_demo.sql
-- Description: Enable table QR code ordering capability for blab_demo and seed demo tables

-- 1. Enable table_qr_ordering feature and table management capabilities for blab_demo
UPDATE tenant_config
SET features = (
    CASE 
        WHEN features IS NULL OR features = '' THEN '["table_qr_ordering"]'
        WHEN json_valid(features) AND NOT EXISTS (
            SELECT 1 FROM json_each(features) WHERE value = 'table_qr_ordering'
        ) THEN json_insert(features, '$[#]', 'table_qr_ordering')
        ELSE features
    END
),
staff_ordering_capabilities = (
    CASE 
        WHEN staff_ordering_capabilities IS NULL OR staff_ordering_capabilities = '' THEN '{"tables_read":true,"tables_write":true}'
        ELSE json_set(staff_ordering_capabilities, '$.tables_read', json('true'), '$.tables_write', json('true'))
    END
)
WHERE tenant_id = 'blab_demo';

-- 2. Seed initial demo tables for blab_demo if none exist
INSERT OR IGNORE INTO restaurant_tables (id, tenant_id, label, sort_order, is_active, created_at, updated_at)
VALUES 
    ('tbl_demo_01', 'blab_demo', '01號桌', 1, 1, datetime('now'), datetime('now')),
    ('tbl_demo_02', 'blab_demo', '02號桌', 2, 1, datetime('now'), datetime('now')),
    ('tbl_demo_03', 'blab_demo', '03號桌', 3, 1, datetime('now'), datetime('now')),
    ('tbl_demo_05', 'blab_demo', '05號桌', 5, 1, datetime('now'), datetime('now')),
    ('tbl_demo_06', 'blab_demo', '06號桌', 6, 1, datetime('now'), datetime('now'));
