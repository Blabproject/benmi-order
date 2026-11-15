-- Migration: 0093_repair_item_modifier_links_sort_order.sql
-- Repair item_modifier_links.sort_order rows collapsed to 0 by prior group saves,
-- while leaving valid 0-based contiguous item link orders (0..N-1) untouched.

UPDATE item_modifier_links AS l
SET sort_order = COALESCE(
  (SELECT g.sort_order FROM modifier_groups g WHERE g.id = l.group_id AND g.tenant_id = l.tenant_id),
  l.sort_order
)
WHERE l.sort_order = 0
  AND EXISTS (
    SELECT 1 FROM modifier_groups g
    WHERE g.id = l.group_id
      AND g.tenant_id = l.tenant_id
      AND g.sort_order > 0
  )
  AND (
    (SELECT COUNT(*) FROM item_modifier_links l2
     WHERE l2.tenant_id = l.tenant_id
       AND l2.item_id = l.item_id
       AND l2.sort_order = 0) > 1
    OR (SELECT MAX(l2.sort_order) FROM item_modifier_links l2
        WHERE l2.tenant_id = l.tenant_id
          AND l2.item_id = l.item_id)
       >= (SELECT COUNT(*) FROM item_modifier_links l2
           WHERE l2.tenant_id = l.tenant_id
             AND l2.item_id = l.item_id)
  );
