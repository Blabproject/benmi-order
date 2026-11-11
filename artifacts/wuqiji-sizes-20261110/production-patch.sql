-- One-time incremental size patch for wuqiji; do not replay over later customer edits.

-- Adds size groups/options/links only. Does not update existing menu rows, flavors, drinks or tenant configuration.

-- Small/large prices are verified against the corrected photo; existing base prices and revisions are preconditions.

WITH size_groups (id,tenant_id,name,selection_type,is_required,min_selection,max_selection,sort_order,scope,allow_repeats,included,auto_popup,sources_json,labels_json,source_metadata_json) AS (VALUES
('mg_wqj_size_fs_01','wuqiji','份量選擇','single',1,1,1,0,'item',0,0,1,'[]','{"zh-TW":"份量選擇","vi":"Chọn kích cỡ"}','{"purpose":"size","source":"corrected_menu_20261110"}'),
('mg_wqj_size_fs_02','wuqiji','份量選擇','single',1,1,1,0,'item',0,0,1,'[]','{"zh-TW":"份量選擇","vi":"Chọn kích cỡ"}','{"purpose":"size","source":"corrected_menu_20261110"}'),
('mg_wqj_size_fs_04','wuqiji','份量選擇','single',1,1,1,0,'item',0,0,1,'[]','{"zh-TW":"份量選擇","vi":"Chọn kích cỡ"}','{"purpose":"size","source":"corrected_menu_20261110"}'),
('mg_wqj_size_fs_05','wuqiji','份量選擇','single',1,1,1,0,'item',0,0,1,'[]','{"zh-TW":"份量選擇","vi":"Chọn kích cỡ"}','{"purpose":"size","source":"corrected_menu_20261110"}'),
('mg_wqj_size_fs_06','wuqiji','份量選擇','single',1,1,1,0,'item',0,0,1,'[]','{"zh-TW":"份量選擇","vi":"Chọn kích cỡ"}','{"purpose":"size","source":"corrected_menu_20261110"}'),
('mg_wqj_size_fs_07','wuqiji','份量選擇','single',1,1,1,0,'item',0,0,1,'[]','{"zh-TW":"份量選擇","vi":"Chọn kích cỡ"}','{"purpose":"size","source":"corrected_menu_20261110"}'),
('mg_wqj_size_fs_08','wuqiji','份量選擇','single',1,1,1,0,'item',0,0,1,'[]','{"zh-TW":"份量選擇","vi":"Chọn kích cỡ"}','{"purpose":"size","source":"corrected_menu_20261110"}'))
INSERT INTO modifier_groups (id,tenant_id,name,selection_type,is_required,min_selection,max_selection,sort_order,scope,allow_repeats,included,auto_popup,sources_json,labels_json,source_metadata_json) SELECT id,tenant_id,name,selection_type,is_required,min_selection,max_selection,sort_order,scope,allow_repeats,included,auto_popup,sources_json,labels_json,source_metadata_json FROM size_groups WHERE (SELECT count(*) FROM menu_items WHERE tenant_id='wuqiji' AND ((id='wqj_fs_01' AND price=65 AND menu_revision=0) OR (id='wqj_fs_02' AND price=70 AND menu_revision=0) OR (id='wqj_fs_04' AND price=65 AND menu_revision=0) OR (id='wqj_fs_05' AND price=60 AND menu_revision=1) OR (id='wqj_fs_06' AND price=60 AND menu_revision=0) OR (id='wqj_fs_07' AND price=45 AND menu_revision=1) OR (id='wqj_fs_08' AND price=45 AND menu_revision=0)))=7;

INSERT INTO modifier_options (id,tenant_id,group_id,name,price,is_default,sort_order) VALUES
('opt_wqj_size_fs_01_small','wuqiji','mg_wqj_size_fs_01','小份',0,0,0),
('opt_wqj_size_fs_01_large','wuqiji','mg_wqj_size_fs_01','大份',45,0,1),
('opt_wqj_size_fs_02_small','wuqiji','mg_wqj_size_fs_02','小份',0,0,0),
('opt_wqj_size_fs_02_large','wuqiji','mg_wqj_size_fs_02','大份',45,0,1),
('opt_wqj_size_fs_04_small','wuqiji','mg_wqj_size_fs_04','小份',0,0,0),
('opt_wqj_size_fs_04_large','wuqiji','mg_wqj_size_fs_04','大份',40,0,1),
('opt_wqj_size_fs_05_small','wuqiji','mg_wqj_size_fs_05','小份',0,0,0),
('opt_wqj_size_fs_05_large','wuqiji','mg_wqj_size_fs_05','大份',40,0,1),
('opt_wqj_size_fs_06_small','wuqiji','mg_wqj_size_fs_06','小份',0,0,0),
('opt_wqj_size_fs_06_large','wuqiji','mg_wqj_size_fs_06','大份',40,0,1),
('opt_wqj_size_fs_07_small','wuqiji','mg_wqj_size_fs_07','小份',0,0,0),
('opt_wqj_size_fs_07_large','wuqiji','mg_wqj_size_fs_07','大份',15,0,1),
('opt_wqj_size_fs_08_small','wuqiji','mg_wqj_size_fs_08','小份',0,0,0),
('opt_wqj_size_fs_08_large','wuqiji','mg_wqj_size_fs_08','大份',20,0,1);

INSERT INTO item_modifier_links (tenant_id,item_id,group_id,sort_order,option_ids_json,is_disabled) VALUES
('wuqiji','wqj_fs_01','mg_wqj_size_fs_01',0,NULL,0),
('wuqiji','wqj_fs_02','mg_wqj_size_fs_02',0,NULL,0),
('wuqiji','wqj_fs_04','mg_wqj_size_fs_04',0,NULL,0),
('wuqiji','wqj_fs_05','mg_wqj_size_fs_05',0,NULL,0),
('wuqiji','wqj_fs_06','mg_wqj_size_fs_06',0,NULL,0),
('wuqiji','wqj_fs_07','mg_wqj_size_fs_07',0,NULL,0),
('wuqiji','wqj_fs_08','mg_wqj_size_fs_08',0,NULL,0);

INSERT INTO menu_catalog_revisions (tenant_id,revision) VALUES ('wuqiji',1) ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1;
