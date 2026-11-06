-- Preserve existing option IDs, selections, prices and product links.
-- Apply this targeted patch to the existing tenant; do not reseed its catalog.
UPDATE modifier_groups
SET name = CASE
        WHEN id = 'mg_df_rice_type' THEN '選米'
        WHEN id = 'mg_df_size' THEN '分量'
        WHEN name = '辣度選擇' THEN '辣度'
        ELSE name END,
    sort_order = CASE
        WHEN id = 'mg_df_rice_type' THEN 1
        WHEN id = 'mg_df_size' THEN 2
        WHEN name IN ('辣度選擇', '辣度') THEN 3
        WHEN name = '不加配料' THEN 4
        WHEN name = '加料 10元' THEN 5
        WHEN name = '加料 15元' THEN 6
        WHEN name = '加料 25元' THEN 7 END,
    revision = revision + 1
WHERE tenant_id = 'dafobenwan' AND scope = 'item'
  AND (id IN ('mg_df_rice_type', 'mg_df_size')
       OR name IN ('辣度選擇', '辣度', '不加配料', '加料 10元', '加料 15元', '加料 25元'));

UPDATE item_modifier_links
SET sort_order = (SELECT g.sort_order FROM modifier_groups g
                  WHERE g.tenant_id = item_modifier_links.tenant_id
                    AND g.id = item_modifier_links.group_id)
WHERE tenant_id = 'dafobenwan'
  AND group_id IN (SELECT id FROM modifier_groups WHERE tenant_id = 'dafobenwan'
                  AND scope = 'item'
                  AND name IN ('選米', '分量', '辣度', '不加配料', '加料 10元', '加料 15元', '加料 25元'));

UPDATE modifier_options
SET sort_order = CASE name
    WHEN '不加菜脯' THEN 0 WHEN '不加酸菜' THEN 1
    WHEN '不加肉鬆' THEN 2 WHEN '不加油條' THEN 3
    WHEN '飯少一點' THEN 4 WHEN '菜脯少一點' THEN 5
    WHEN '酸菜少一點' THEN 6 WHEN '肉鬆少一點' THEN 7
    WHEN '油條少一點' THEN 8 END
WHERE tenant_id = 'dafobenwan'
  AND group_id IN (SELECT id FROM modifier_groups WHERE tenant_id = 'dafobenwan' AND name = '不加配料')
  AND name IN ('不加菜脯', '不加酸菜', '不加肉鬆', '不加油條', '飯少一點',
               '菜脯少一點', '酸菜少一點', '肉鬆少一點', '油條少一點');

INSERT INTO menu_catalog_revisions (tenant_id, revision)
VALUES ('dafobenwan', 1)
ON CONFLICT(tenant_id) DO UPDATE SET revision = revision + 1;
