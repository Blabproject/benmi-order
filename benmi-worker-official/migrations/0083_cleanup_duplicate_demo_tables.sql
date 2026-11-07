-- Migration: 0083_cleanup_duplicate_demo_tables.sql
-- Description: Clean up duplicate demo tables seeded by 0082 where original tables already exist without active orders.

DELETE FROM restaurant_tables
WHERE tenant_id = 'blab_demo'
  AND id IN ('tbl_demo_01', 'tbl_demo_02', 'tbl_demo_03', 'tbl_demo_05', 'tbl_demo_06')
  AND NOT EXISTS (
    SELECT 1 FROM orders WHERE orders.table_id = restaurant_tables.id
  );
