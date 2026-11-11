-- Correct wuqiji item-level flavor and combo drink choices; confirmed from reference menu.
-- Historical one-time patch, already applied to all three environments.
-- Do not replay over later customer/POS edits; prepare a fresh scoped patch.

-- Latest reference image supersedes the first image. Tenant configuration, credentials and LIFF are preserved.

-- Correct combo E to 340 and normalize the two fries names to match the latest reference.

UPDATE menu_items SET name='加購升級E (雞腿塊翅組合餐 (6塊))',description='內含：雞腿塊翅組合餐 (6塊)',price=340,updated_at=CURRENT_TIMESTAMP WHERE tenant_id='wuqiji' AND id='wqj_cb_05';

UPDATE menu_items SET name='脆薯條',updated_at=CURRENT_TIMESTAMP WHERE tenant_id='wuqiji' AND id='wqj_fs_05';

UPDATE menu_items SET name='細薯條',updated_at=CURRENT_TIMESTAMP WHERE tenant_id='wuqiji' AND id='wqj_fs_07';

DELETE FROM item_modifier_links WHERE tenant_id='wuqiji' AND group_id IN ('mg_wqj_flavor','mg_wqj_combo_drink');

DELETE FROM category_modifier_links WHERE tenant_id='wuqiji' AND group_id IN ('mg_wqj_flavor','mg_wqj_combo_drink');

DELETE FROM modifier_options WHERE tenant_id='wuqiji' AND group_id='mg_wqj_flavor' AND id NOT IN ('opt_wqj_fl_pepper','opt_wqj_fl_plum','opt_wqj_fl_lemon','opt_wqj_fl_cheese','opt_wqj_fl_spicy');

INSERT INTO modifier_groups (id,tenant_id,name,scope,selection_type,is_required,min_selection,max_selection,allow_repeats,included,auto_popup,sort_order,sources_json,labels_json,source_metadata_json) VALUES ('mg_wqj_flavor','wuqiji','口味選擇','item','single',1,1,1,0,0,1,1,'[]','{"zh-TW":"口味選擇","vi":"Chọn 1 vị"}','{}')
ON CONFLICT(id) DO UPDATE SET name=excluded.name,scope=excluded.scope,selection_type=excluded.selection_type,is_required=excluded.is_required,min_selection=excluded.min_selection,max_selection=excluded.max_selection,allow_repeats=excluded.allow_repeats,included=excluded.included,auto_popup=excluded.auto_popup,sort_order=excluded.sort_order,sources_json=excluded.sources_json,labels_json=excluded.labels_json,source_metadata_json=excluded.source_metadata_json,revision=modifier_groups.revision+1,updated_at=CURRENT_TIMESTAMP WHERE modifier_groups.tenant_id='wuqiji';

INSERT INTO modifier_options (id,tenant_id,group_id,name,price,is_default,sort_order,product_id,included_quantity,sub_options_json,eligibility_rules_json,source_metadata_json) VALUES ('opt_wqj_fl_pepper','wuqiji','mg_wqj_flavor','原味',0,0,1,NULL,1,'[]','[]','{}')
ON CONFLICT(id) DO UPDATE SET group_id=excluded.group_id,name=excluded.name,price=excluded.price,is_default=excluded.is_default,sort_order=excluded.sort_order,product_id=excluded.product_id,included_quantity=excluded.included_quantity,sub_options_json=excluded.sub_options_json,eligibility_rules_json=excluded.eligibility_rules_json,source_metadata_json=excluded.source_metadata_json,updated_at=CURRENT_TIMESTAMP WHERE modifier_options.tenant_id='wuqiji';

INSERT INTO modifier_options (id,tenant_id,group_id,name,price,is_default,sort_order,product_id,included_quantity,sub_options_json,eligibility_rules_json,source_metadata_json) VALUES ('opt_wqj_fl_plum','wuqiji','mg_wqj_flavor','甘梅',0,0,2,NULL,1,'[]','[]','{}')
ON CONFLICT(id) DO UPDATE SET group_id=excluded.group_id,name=excluded.name,price=excluded.price,is_default=excluded.is_default,sort_order=excluded.sort_order,product_id=excluded.product_id,included_quantity=excluded.included_quantity,sub_options_json=excluded.sub_options_json,eligibility_rules_json=excluded.eligibility_rules_json,source_metadata_json=excluded.source_metadata_json,updated_at=CURRENT_TIMESTAMP WHERE modifier_options.tenant_id='wuqiji';

INSERT INTO modifier_options (id,tenant_id,group_id,name,price,is_default,sort_order,product_id,included_quantity,sub_options_json,eligibility_rules_json,source_metadata_json) VALUES ('opt_wqj_fl_lemon','wuqiji','mg_wqj_flavor','檸檬',0,0,3,NULL,1,'[]','[]','{}')
ON CONFLICT(id) DO UPDATE SET group_id=excluded.group_id,name=excluded.name,price=excluded.price,is_default=excluded.is_default,sort_order=excluded.sort_order,product_id=excluded.product_id,included_quantity=excluded.included_quantity,sub_options_json=excluded.sub_options_json,eligibility_rules_json=excluded.eligibility_rules_json,source_metadata_json=excluded.source_metadata_json,updated_at=CURRENT_TIMESTAMP WHERE modifier_options.tenant_id='wuqiji';

INSERT INTO modifier_options (id,tenant_id,group_id,name,price,is_default,sort_order,product_id,included_quantity,sub_options_json,eligibility_rules_json,source_metadata_json) VALUES ('opt_wqj_fl_cheese','wuqiji','mg_wqj_flavor','起司',0,0,4,NULL,1,'[]','[]','{}')
ON CONFLICT(id) DO UPDATE SET group_id=excluded.group_id,name=excluded.name,price=excluded.price,is_default=excluded.is_default,sort_order=excluded.sort_order,product_id=excluded.product_id,included_quantity=excluded.included_quantity,sub_options_json=excluded.sub_options_json,eligibility_rules_json=excluded.eligibility_rules_json,source_metadata_json=excluded.source_metadata_json,updated_at=CURRENT_TIMESTAMP WHERE modifier_options.tenant_id='wuqiji';

INSERT INTO modifier_options (id,tenant_id,group_id,name,price,is_default,sort_order,product_id,included_quantity,sub_options_json,eligibility_rules_json,source_metadata_json) VALUES ('opt_wqj_fl_spicy','wuqiji','mg_wqj_flavor','辣味',0,0,5,NULL,1,'[]','[]','{}')
ON CONFLICT(id) DO UPDATE SET group_id=excluded.group_id,name=excluded.name,price=excluded.price,is_default=excluded.is_default,sort_order=excluded.sort_order,product_id=excluded.product_id,included_quantity=excluded.included_quantity,sub_options_json=excluded.sub_options_json,eligibility_rules_json=excluded.eligibility_rules_json,source_metadata_json=excluded.source_metadata_json,updated_at=CURRENT_TIMESTAMP WHERE modifier_options.tenant_id='wuqiji';

INSERT INTO item_modifier_links (tenant_id,item_id,group_id,sort_order,option_ids_json,is_disabled) VALUES ('wuqiji','wqj_cc_01','mg_wqj_flavor',1,NULL,0)
ON CONFLICT(tenant_id,item_id,group_id) DO UPDATE SET item_id=excluded.item_id,group_id=excluded.group_id,sort_order=excluded.sort_order,option_ids_json=excluded.option_ids_json,is_disabled=excluded.is_disabled WHERE item_modifier_links.tenant_id='wuqiji';

INSERT INTO item_modifier_links (tenant_id,item_id,group_id,sort_order,option_ids_json,is_disabled) VALUES ('wuqiji','wqj_cc_02','mg_wqj_flavor',1,NULL,0)
ON CONFLICT(tenant_id,item_id,group_id) DO UPDATE SET item_id=excluded.item_id,group_id=excluded.group_id,sort_order=excluded.sort_order,option_ids_json=excluded.option_ids_json,is_disabled=excluded.is_disabled WHERE item_modifier_links.tenant_id='wuqiji';

INSERT INTO item_modifier_links (tenant_id,item_id,group_id,sort_order,option_ids_json,is_disabled) VALUES ('wuqiji','wqj_fs_05','mg_wqj_flavor',1,'["opt_wqj_fl_pepper","opt_wqj_fl_plum","opt_wqj_fl_cheese","opt_wqj_fl_spicy"]',0)
ON CONFLICT(tenant_id,item_id,group_id) DO UPDATE SET item_id=excluded.item_id,group_id=excluded.group_id,sort_order=excluded.sort_order,option_ids_json=excluded.option_ids_json,is_disabled=excluded.is_disabled WHERE item_modifier_links.tenant_id='wuqiji';

INSERT INTO item_modifier_links (tenant_id,item_id,group_id,sort_order,option_ids_json,is_disabled) VALUES ('wuqiji','wqj_fs_06','mg_wqj_flavor',1,'["opt_wqj_fl_pepper","opt_wqj_fl_plum","opt_wqj_fl_cheese","opt_wqj_fl_spicy"]',0)
ON CONFLICT(tenant_id,item_id,group_id) DO UPDATE SET item_id=excluded.item_id,group_id=excluded.group_id,sort_order=excluded.sort_order,option_ids_json=excluded.option_ids_json,is_disabled=excluded.is_disabled WHERE item_modifier_links.tenant_id='wuqiji';

INSERT INTO item_modifier_links (tenant_id,item_id,group_id,sort_order,option_ids_json,is_disabled) VALUES ('wuqiji','wqj_fs_07','mg_wqj_flavor',1,'["opt_wqj_fl_pepper","opt_wqj_fl_plum","opt_wqj_fl_cheese","opt_wqj_fl_spicy"]',0)
ON CONFLICT(tenant_id,item_id,group_id) DO UPDATE SET item_id=excluded.item_id,group_id=excluded.group_id,sort_order=excluded.sort_order,option_ids_json=excluded.option_ids_json,is_disabled=excluded.is_disabled WHERE item_modifier_links.tenant_id='wuqiji';

DELETE FROM modifier_options WHERE tenant_id='wuqiji' AND group_id='mg_wqj_combo_drink' AND id NOT IN ('opt_wqj_tea_01','opt_wqj_tea_02','opt_wqj_tea_03','opt_wqj_tea_04','opt_wqj_tea_05');

INSERT INTO modifier_groups (id,tenant_id,name,scope,selection_type,is_required,min_selection,max_selection,allow_repeats,included,auto_popup,sort_order,sources_json,labels_json,source_metadata_json) VALUES ('mg_wqj_combo_drink','wuqiji','冷泡茶選擇','item','single',1,1,1,0,0,1,2,'[]','{"zh-TW":"冷泡茶選擇","vi":"Chọn 1 trà ủ lạnh"}','{}')
ON CONFLICT(id) DO UPDATE SET name=excluded.name,scope=excluded.scope,selection_type=excluded.selection_type,is_required=excluded.is_required,min_selection=excluded.min_selection,max_selection=excluded.max_selection,allow_repeats=excluded.allow_repeats,included=excluded.included,auto_popup=excluded.auto_popup,sort_order=excluded.sort_order,sources_json=excluded.sources_json,labels_json=excluded.labels_json,source_metadata_json=excluded.source_metadata_json,revision=modifier_groups.revision+1,updated_at=CURRENT_TIMESTAMP WHERE modifier_groups.tenant_id='wuqiji';

INSERT INTO modifier_options (id,tenant_id,group_id,name,price,is_default,sort_order,product_id,included_quantity,sub_options_json,eligibility_rules_json,source_metadata_json) VALUES ('opt_wqj_tea_01','wuqiji','mg_wqj_combo_drink','高山青冷泡茶',0,0,1,'wqj_dr_01',1,'[]','[]','{}')
ON CONFLICT(id) DO UPDATE SET group_id=excluded.group_id,name=excluded.name,price=excluded.price,is_default=excluded.is_default,sort_order=excluded.sort_order,product_id=excluded.product_id,included_quantity=excluded.included_quantity,sub_options_json=excluded.sub_options_json,eligibility_rules_json=excluded.eligibility_rules_json,source_metadata_json=excluded.source_metadata_json,updated_at=CURRENT_TIMESTAMP WHERE modifier_options.tenant_id='wuqiji';

INSERT INTO modifier_options (id,tenant_id,group_id,name,price,is_default,sort_order,product_id,included_quantity,sub_options_json,eligibility_rules_json,source_metadata_json) VALUES ('opt_wqj_tea_02','wuqiji','mg_wqj_combo_drink','黃金烏龍冷泡茶',0,0,2,'wqj_dr_02',1,'[]','[]','{}')
ON CONFLICT(id) DO UPDATE SET group_id=excluded.group_id,name=excluded.name,price=excluded.price,is_default=excluded.is_default,sort_order=excluded.sort_order,product_id=excluded.product_id,included_quantity=excluded.included_quantity,sub_options_json=excluded.sub_options_json,eligibility_rules_json=excluded.eligibility_rules_json,source_metadata_json=excluded.source_metadata_json,updated_at=CURRENT_TIMESTAMP WHERE modifier_options.tenant_id='wuqiji';

INSERT INTO modifier_options (id,tenant_id,group_id,name,price,is_default,sort_order,product_id,included_quantity,sub_options_json,eligibility_rules_json,source_metadata_json) VALUES ('opt_wqj_tea_03','wuqiji','mg_wqj_combo_drink','烏龍綠冷泡茶',0,0,3,'wqj_dr_03',1,'[]','[]','{}')
ON CONFLICT(id) DO UPDATE SET group_id=excluded.group_id,name=excluded.name,price=excluded.price,is_default=excluded.is_default,sort_order=excluded.sort_order,product_id=excluded.product_id,included_quantity=excluded.included_quantity,sub_options_json=excluded.sub_options_json,eligibility_rules_json=excluded.eligibility_rules_json,source_metadata_json=excluded.source_metadata_json,updated_at=CURRENT_TIMESTAMP WHERE modifier_options.tenant_id='wuqiji';

INSERT INTO modifier_options (id,tenant_id,group_id,name,price,is_default,sort_order,product_id,included_quantity,sub_options_json,eligibility_rules_json,source_metadata_json) VALUES ('opt_wqj_tea_04','wuqiji','mg_wqj_combo_drink','阿里山冰茶',0,0,4,'wqj_dr_04',1,'[]','[]','{}')
ON CONFLICT(id) DO UPDATE SET group_id=excluded.group_id,name=excluded.name,price=excluded.price,is_default=excluded.is_default,sort_order=excluded.sort_order,product_id=excluded.product_id,included_quantity=excluded.included_quantity,sub_options_json=excluded.sub_options_json,eligibility_rules_json=excluded.eligibility_rules_json,source_metadata_json=excluded.source_metadata_json,updated_at=CURRENT_TIMESTAMP WHERE modifier_options.tenant_id='wuqiji';

INSERT INTO modifier_options (id,tenant_id,group_id,name,price,is_default,sort_order,product_id,included_quantity,sub_options_json,eligibility_rules_json,source_metadata_json) VALUES ('opt_wqj_tea_05','wuqiji','mg_wqj_combo_drink','日月潭魚池紅茶',0,0,5,'wqj_dr_05',1,'[]','[]','{}')
ON CONFLICT(id) DO UPDATE SET group_id=excluded.group_id,name=excluded.name,price=excluded.price,is_default=excluded.is_default,sort_order=excluded.sort_order,product_id=excluded.product_id,included_quantity=excluded.included_quantity,sub_options_json=excluded.sub_options_json,eligibility_rules_json=excluded.eligibility_rules_json,source_metadata_json=excluded.source_metadata_json,updated_at=CURRENT_TIMESTAMP WHERE modifier_options.tenant_id='wuqiji';

INSERT INTO item_modifier_links (tenant_id,item_id,group_id,sort_order,option_ids_json,is_disabled) VALUES ('wuqiji','wqj_cb_01','mg_wqj_combo_drink',2,NULL,0)
ON CONFLICT(tenant_id,item_id,group_id) DO UPDATE SET item_id=excluded.item_id,group_id=excluded.group_id,sort_order=excluded.sort_order,option_ids_json=excluded.option_ids_json,is_disabled=excluded.is_disabled WHERE item_modifier_links.tenant_id='wuqiji';

INSERT INTO item_modifier_links (tenant_id,item_id,group_id,sort_order,option_ids_json,is_disabled) VALUES ('wuqiji','wqj_cb_02','mg_wqj_combo_drink',2,NULL,0)
ON CONFLICT(tenant_id,item_id,group_id) DO UPDATE SET item_id=excluded.item_id,group_id=excluded.group_id,sort_order=excluded.sort_order,option_ids_json=excluded.option_ids_json,is_disabled=excluded.is_disabled WHERE item_modifier_links.tenant_id='wuqiji';

INSERT INTO item_modifier_links (tenant_id,item_id,group_id,sort_order,option_ids_json,is_disabled) VALUES ('wuqiji','wqj_cb_03','mg_wqj_combo_drink',2,NULL,0)
ON CONFLICT(tenant_id,item_id,group_id) DO UPDATE SET item_id=excluded.item_id,group_id=excluded.group_id,sort_order=excluded.sort_order,option_ids_json=excluded.option_ids_json,is_disabled=excluded.is_disabled WHERE item_modifier_links.tenant_id='wuqiji';

INSERT INTO item_modifier_links (tenant_id,item_id,group_id,sort_order,option_ids_json,is_disabled) VALUES ('wuqiji','wqj_cb_04','mg_wqj_combo_drink',2,NULL,0)
ON CONFLICT(tenant_id,item_id,group_id) DO UPDATE SET item_id=excluded.item_id,group_id=excluded.group_id,sort_order=excluded.sort_order,option_ids_json=excluded.option_ids_json,is_disabled=excluded.is_disabled WHERE item_modifier_links.tenant_id='wuqiji';

UPDATE menu_categories SET applied_modifiers='[]',allow_customization=CASE WHEN EXISTS (SELECT 1 FROM menu_items i JOIN item_modifier_links l ON l.tenant_id=i.tenant_id AND l.item_id=i.id WHERE i.tenant_id=menu_categories.tenant_id AND i.category_id=menu_categories.id AND l.is_disabled=0) THEN 1 ELSE 0 END WHERE tenant_id='wuqiji' AND category_type='catalog';

INSERT INTO menu_catalog_revisions (tenant_id,revision) VALUES ('wuqiji',1) ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1;
