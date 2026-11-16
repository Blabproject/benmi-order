-- Complete menu & relational shift replacement for: 珍寶廚坊 / zhenbaochufang (2026-11-16)
-- ONE-TIME LIVE PAYLOAD PER ENVIRONMENT. Do not replay an already applied patch.
-- DELETEs and UPSERTs can remove or overwrite later customer/POS edits.
-- Source: zhenbaochufang.xlsx (菜單, 超值選項, 時段)
-- User confirmations:
--   1. Complete replacement of previous menu (經典配菜餐 / old cat_zb_addon removed)
--   2. Category D (卜蜂蛋炒飯) restricted to Dinner (16:30-19:00 Mon-Fri) + Late Night (21:00-22:30 Mon-Thu), hidden completely when unavailable
--   3. All A/B/C/D options & soy sauce choice are optional (is_required=0, min_selection=0, is_default=0)
--   4. Does not delete orders, payments, users, or LINE/credentials.

INSERT OR IGNORE INTO tenants (id, name)
VALUES ('zhenbaochufang', '珍寶廚坊');

INSERT OR IGNORE INTO tenant_config (tenant_id, brand_name, features)
VALUES ('zhenbaochufang', '珍寶廚坊', '["menu_schedule"]');

UPDATE tenant_config
SET features = CASE
    WHEN COALESCE(TRIM(features), '') IN ('', '[]') THEN '["menu_schedule"]'
    WHEN INSTR(features, '"menu_schedule"') > 0 THEN features
    ELSE json_insert(features, '$[#]', 'menu_schedule')
END
WHERE tenant_id = 'zhenbaochufang';

DELETE FROM menu_category_shifts WHERE tenant_id='zhenbaochufang';
DELETE FROM menu_item_shifts WHERE tenant_id='zhenbaochufang';
DELETE FROM tenant_operating_hours WHERE tenant_id='zhenbaochufang';
DELETE FROM tenant_operating_shifts WHERE tenant_id='zhenbaochufang';
DELETE FROM item_modifier_links WHERE tenant_id='zhenbaochufang';
DELETE FROM category_modifier_links WHERE tenant_id='zhenbaochufang';
DELETE FROM modifier_options WHERE tenant_id='zhenbaochufang';
DELETE FROM modifier_groups WHERE tenant_id='zhenbaochufang';
DELETE FROM menu_bundle_rules WHERE tenant_id='zhenbaochufang';
DELETE FROM menu_items WHERE tenant_id='zhenbaochufang';
DELETE FROM menu_categories WHERE tenant_id='zhenbaochufang';

-- 1. Relational Operating Shifts
INSERT INTO tenant_operating_shifts (id, tenant_id, name, i18n_json, shift_type, sort_order, is_active) VALUES
('shift_zb_lunch',  'zhenbaochufang', '午餐時段', '{"zh-TW":{"name":"午餐時段"},"en":{"name":"Lunch"},"vi":{"name":"Ca trưa"}}', 'operating', 1, 1),
('shift_zb_dinner', 'zhenbaochufang', '晚餐時段', '{"zh-TW":{"name":"晚餐時段"},"en":{"name":"Dinner"},"vi":{"name":"Ca tối"}}', 'operating', 2, 1),
('shift_zb_late',   'zhenbaochufang', '宵夜時段', '{"zh-TW":{"name":"宵夜時段"},"en":{"name":"Late Night"},"vi":{"name":"Ca khuya"}}', 'operating', 3, 1);

-- Lunch: Mon-Fri 11:00-13:30; Dinner: Mon-Fri 16:30-19:00; Late Night: Mon-Thu 21:00-22:30
INSERT INTO tenant_operating_hours (id, tenant_id, shift_id, day_of_week, start_time, end_time, is_active) VALUES
('oh_zb_lunch_1',  'zhenbaochufang', 'shift_zb_lunch',  1, '11:00', '13:30', 1),
('oh_zb_lunch_2',  'zhenbaochufang', 'shift_zb_lunch',  2, '11:00', '13:30', 1),
('oh_zb_lunch_3',  'zhenbaochufang', 'shift_zb_lunch',  3, '11:00', '13:30', 1),
('oh_zb_lunch_4',  'zhenbaochufang', 'shift_zb_lunch',  4, '11:00', '13:30', 1),
('oh_zb_lunch_5',  'zhenbaochufang', 'shift_zb_lunch',  5, '11:00', '13:30', 1),
('oh_zb_dinner_1', 'zhenbaochufang', 'shift_zb_dinner', 1, '16:30', '19:00', 1),
('oh_zb_dinner_2', 'zhenbaochufang', 'shift_zb_dinner', 2, '16:30', '19:00', 1),
('oh_zb_dinner_3', 'zhenbaochufang', 'shift_zb_dinner', 3, '16:30', '19:00', 1),
('oh_zb_dinner_4', 'zhenbaochufang', 'shift_zb_dinner', 4, '16:30', '19:00', 1),
('oh_zb_dinner_5', 'zhenbaochufang', 'shift_zb_dinner', 5, '16:30', '19:00', 1),
('oh_zb_late_1',   'zhenbaochufang', 'shift_zb_late',   1, '21:00', '22:30', 1),
('oh_zb_late_2',   'zhenbaochufang', 'shift_zb_late',   2, '21:00', '22:30', 1),
('oh_zb_late_3',   'zhenbaochufang', 'shift_zb_late',   3, '21:00', '22:30', 1),
('oh_zb_late_4',   'zhenbaochufang', 'shift_zb_late',   4, '21:00', '22:30', 1);

-- Synchronize tenant_config.operating_hours derived projection
UPDATE tenant_config
SET operating_hours = '{"0":[],"1":[{"start":"11:00","end":"13:30","shiftId":"shift_zb_lunch","shiftName":"午餐時段"},{"start":"16:30","end":"19:00","shiftId":"shift_zb_dinner","shiftName":"晚餐時段"},{"start":"21:00","end":"22:30","shiftId":"shift_zb_late","shiftName":"宵夜時段"}],"2":[{"start":"11:00","end":"13:30","shiftId":"shift_zb_lunch","shiftName":"午餐時段"},{"start":"16:30","end":"19:00","shiftId":"shift_zb_dinner","shiftName":"晚餐時段"},{"start":"21:00","end":"22:30","shiftId":"shift_zb_late","shiftName":"宵夜時段"}],"3":[{"start":"11:00","end":"13:30","shiftId":"shift_zb_lunch","shiftName":"午餐時段"},{"start":"16:30","end":"19:00","shiftId":"shift_zb_dinner","shiftName":"晚餐時段"},{"start":"21:00","end":"22:30","shiftId":"shift_zb_late","shiftName":"宵夜時段"}],"4":[{"start":"11:00","end":"13:30","shiftId":"shift_zb_lunch","shiftName":"午餐時段"},{"start":"16:30","end":"19:00","shiftId":"shift_zb_dinner","shiftName":"晚餐時段"},{"start":"21:00","end":"22:30","shiftId":"shift_zb_late","shiftName":"宵夜時段"}],"5":[{"start":"11:00","end":"13:30","shiftId":"shift_zb_lunch","shiftName":"午餐時段"},{"start":"16:30","end":"19:00","shiftId":"shift_zb_dinner","shiftName":"晚餐時段"}],"6":[]}'
WHERE tenant_id = 'zhenbaochufang';

-- 2. Categories A-F
INSERT INTO menu_categories (id, tenant_id, name, short_name, slug, category_type, selection_type, is_required, min_selection, max_selection, sort_order, allow_customization, applied_modifiers, pricing_rules, availability_mode, hide_when_unavailable) VALUES
('cat_zb_braised',      'zhenbaochufang', '肉燥飯',         '肉燥',   'braised-pork',  'catalog', 'single', 0, 0, 1, 1, 1, '[]', NULL, 'all_shifts',      0),
('cat_zb_curry',        'zhenbaochufang', '元氣咖哩',       '咖哩',   'curry',         'catalog', 'single', 0, 0, 1, 2, 1, '[]', NULL, 'all_shifts',      0),
('cat_zb_dumplings',    'zhenbaochufang', '高麗菜豬肉水餃', '水餃',   'dumplings',     'catalog', 'single', 0, 0, 1, 3, 1, '[]', NULL, 'all_shifts',      0),
('cat_zb_fried_rice',   'zhenbaochufang', '卜蜂蛋炒飯',     '蛋炒飯', 'fried-rice',    'catalog', 'single', 0, 0, 1, 4, 1, '[]', NULL, 'selected_shifts', 1),
('cat_zb_fried_snacks', 'zhenbaochufang', '炸物類',         '炸物',   'fried-snacks',  'catalog', 'single', 0, 0, 1, 5, 0, '[]', NULL, 'all_shifts',      0),
('cat_zb_drinks',       'zhenbaochufang', '無糖瓶裝飲料',   '飲料',   'drinks',        'catalog', 'single', 0, 0, 1, 6, 0, '[]', NULL, 'all_shifts',      0);

-- Bind Category D (卜蜂蛋炒飯) to Dinner and Late Night shifts
INSERT INTO menu_category_shifts (tenant_id, category_id, shift_id) VALUES
('zhenbaochufang', 'cat_zb_fried_rice', 'shift_zb_dinner'),
('zhenbaochufang', 'cat_zb_fried_rice', 'shift_zb_late');

-- 3. Menu Items (34 items across Categories A-F)
INSERT INTO menu_items (id, tenant_id, category_id, name, price, description, badge_text, is_recommended, sort_order, item_type, availability_mode) VALUES
-- A: 肉燥飯
('zb_a_01', 'zhenbaochufang', 'cat_zb_braised', '肉燥飯',       45, NULL, NULL, 0, 1, 'standard', 'inherit'),
('zb_a_02', 'zhenbaochufang', 'cat_zb_braised', '肉燥麵',       45, NULL, NULL, 0, 2, 'standard', 'inherit'),
('zb_a_03', 'zhenbaochufang', 'cat_zb_braised', '鹽酥雞肉燥飯', 90, NULL, NULL, 1, 3, 'standard', 'inherit'),
-- B: 元氣咖哩
('zb_b_01', 'zhenbaochufang', 'cat_zb_curry', '咖哩飯', 85, NULL, NULL, 1, 1, 'standard', 'inherit'),
('zb_b_02', 'zhenbaochufang', 'cat_zb_curry', '咖哩麵', 85, NULL, NULL, 0, 2, 'standard', 'inherit'),
-- C: 高麗菜豬肉水餃
('zb_c_01', 'zhenbaochufang', 'cat_zb_dumplings', '水餃 15顆', 70, NULL, NULL, 0, 1, 'standard', 'inherit'),
('zb_c_02', 'zhenbaochufang', 'cat_zb_dumplings', '水餃 20顆', 90, NULL, NULL, 0, 2, 'standard', 'inherit'),
('zb_c_03', 'zhenbaochufang', 'cat_zb_dumplings', '水餃 10顆', 50, NULL, NULL, 0, 3, 'standard', 'inherit'),
-- D: 卜蜂蛋炒飯 (Dinner & Late Night only)
('zb_d_01', 'zhenbaochufang', 'cat_zb_fried_rice', '肉絲蛋炒飯 230g',   75,  NULL, NULL, 0, 1, 'standard', 'inherit'),
('zb_d_02', 'zhenbaochufang', 'cat_zb_fried_rice', '培根蛋炒飯 230g',   75,  NULL, NULL, 0, 2, 'standard', 'inherit'),
('zb_d_03', 'zhenbaochufang', 'cat_zb_fried_rice', '雞肉玉米蛋 230g',   75,  NULL, NULL, 0, 3, 'standard', 'inherit'),
('zb_d_04', 'zhenbaochufang', 'cat_zb_fried_rice', '460g 肉絲蛋炒飯',  140,  NULL, NULL, 0, 4, 'standard', 'inherit'),
('zb_d_05', 'zhenbaochufang', 'cat_zb_fried_rice', '460g 培根蛋炒飯',  140,  NULL, NULL, 0, 5, 'standard', 'inherit'),
('zb_d_06', 'zhenbaochufang', 'cat_zb_fried_rice', '460g 雞肉玉米蛋',  140,  NULL, NULL, 0, 6, 'standard', 'inherit'),
-- E: 炸物類
('zb_e_01', 'zhenbaochufang', 'cat_zb_fried_snacks', '脆皮雞排 *1',        40, NULL, NULL, 0,  1, 'standard', 'inherit'),
('zb_e_02', 'zhenbaochufang', 'cat_zb_fried_snacks', '脆皮雞排 *2',        80, NULL, NULL, 0,  2, 'standard', 'inherit'),
('zb_e_03', 'zhenbaochufang', 'cat_zb_fried_snacks', '無骨鹽酥雞 120g',    50, NULL, NULL, 0,  3, 'standard', 'inherit'),
('zb_e_04', 'zhenbaochufang', 'cat_zb_fried_snacks', '240g 無骨鹽酥雞 大', 95, NULL, NULL, 0,  4, 'standard', 'inherit'),
('zb_e_05', 'zhenbaochufang', 'cat_zb_fried_snacks', '細薯 150g',          45, NULL, NULL, 0,  5, 'standard', 'inherit'),
('zb_e_06', 'zhenbaochufang', 'cat_zb_fried_snacks', '甜不辣 150g',        45, NULL, NULL, 0,  6, 'standard', 'inherit'),
('zb_e_07', 'zhenbaochufang', 'cat_zb_fried_snacks', '中華雞蛋豆腐 300g',  60, NULL, NULL, 0,  7, 'standard', 'inherit'),
('zb_e_08', 'zhenbaochufang', 'cat_zb_fried_snacks', '杏鮑菇 150g',        40, NULL, NULL, 0,  8, 'standard', 'inherit'),
('zb_e_09', 'zhenbaochufang', 'cat_zb_fried_snacks', '脆薯 150g',          45, NULL, NULL, 0,  9, 'standard', 'inherit'),
('zb_e_10', 'zhenbaochufang', 'cat_zb_fried_snacks', '洋蔥圈 6',           45, NULL, NULL, 0, 10, 'standard', 'inherit'),
('zb_e_11', 'zhenbaochufang', 'cat_zb_fried_snacks', '米血 150g',          30, NULL, NULL, 0, 11, 'standard', 'inherit'),
('zb_e_12', 'zhenbaochufang', 'cat_zb_fried_snacks', '薯餅 2',             30, NULL, NULL, 0, 12, 'standard', 'inherit'),
('zb_e_13', 'zhenbaochufang', 'cat_zb_fried_snacks', '中熱狗 2',           30, NULL, NULL, 0, 13, 'standard', 'inherit'),
('zb_e_14', 'zhenbaochufang', 'cat_zb_fried_snacks', '雞米花 10',          45, NULL, NULL, 0, 14, 'standard', 'inherit'),
('zb_e_15', 'zhenbaochufang', 'cat_zb_fried_snacks', '照燒雞肉丸 4',       40, NULL, NULL, 0, 15, 'standard', 'inherit'),
('zb_e_16', 'zhenbaochufang', 'cat_zb_fried_snacks', '炸元寶 10',          45, NULL, NULL, 0, 16, 'standard', 'inherit'),
-- F: 無糖瓶裝飲料
('zb_f_01', 'zhenbaochufang', 'cat_zb_drinks', '原脆烏龍茶',   20, NULL, NULL, 0, 1, 'standard', 'inherit'),
('zb_f_02', 'zhenbaochufang', 'cat_zb_drinks', '原脆錫蘭紅茶', 20, NULL, NULL, 0, 2, 'standard', 'inherit'),
('zb_f_03', 'zhenbaochufang', 'cat_zb_drinks', '濃韻日式綠茶', 20, NULL, NULL, 0, 3, 'standard', 'inherit'),
('zb_f_04', 'zhenbaochufang', 'cat_zb_drinks', '四季青茶',     20, NULL, NULL, 0, 4, 'standard', 'inherit');

-- 4. Unified Option Groups (all optional: is_required=0, min_selection=0, auto_popup=0, is_default=0)
INSERT INTO modifier_groups (id, tenant_id, name, scope, selection_type, is_required, min_selection, max_selection, allow_repeats, included, auto_popup, sort_order, sources_json, labels_json, source_metadata_json) VALUES
('mg_zb_braised_rice_extra',   'zhenbaochufang', '加量選購', 'item', 'multiple', 0, 0,  1, 0, 0, 0, 1, '[]', '{}', '{}'),
('mg_zb_braised_noodle_extra', 'zhenbaochufang', '加量選購', 'item', 'multiple', 0, 0,  1, 0, 0, 0, 1, '[]', '{}', '{}'),
('mg_zb_curry_rice_extra',     'zhenbaochufang', '加量選購', 'item', 'multiple', 0, 0,  1, 0, 0, 0, 1, '[]', '{}', '{}'),
('mg_zb_curry_noodle_extra',   'zhenbaochufang', '加量選購', 'item', 'multiple', 0, 0,  1, 0, 0, 0, 1, '[]', '{}', '{}'),
('mg_zb_dumpling_soy',         'zhenbaochufang', '醬油選擇', 'item', 'single',   0, 0,  1, 0, 0, 0, 1, '[]', '{}', '{}'),
('mg_zb_addon_items',          'zhenbaochufang', '超值加購 (每個品項限一份)', 'item', 'multiple', 0, 0, 20, 0, 0, 0, 2, '[]', '{}', '{}');

INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity) VALUES
-- A/B extras
('opt_zb_braised_rice_extra',   'zhenbaochufang', 'mg_zb_braised_rice_extra',   '加白飯200g 加 肉燥', 20, 0, 1, '[]', '[]', NULL, 1),
('opt_zb_braised_noodle_extra', 'zhenbaochufang', 'mg_zb_braised_noodle_extra', '加鐵板麵 加 肉燥',   20, 0, 1, '[]', '[]', NULL, 1),
('opt_zb_curry_rice_extra',     'zhenbaochufang', 'mg_zb_curry_rice_extra',     '加飯咖哩料',         35, 0, 1, '[]', '[]', NULL, 1),
('opt_zb_curry_noodle_extra',   'zhenbaochufang', 'mg_zb_curry_noodle_extra',   '加麵咖哩料',         35, 0, 1, '[]', '[]', NULL, 1),
-- C soy sauce
('opt_zb_soy_yes', 'zhenbaochufang', 'mg_zb_dumpling_soy', '要醬油',   0, 0, 1, '[]', '[]', NULL, 1),
('opt_zb_soy_no',  'zhenbaochufang', 'mg_zb_dumpling_soy', '不要醬油', 0, 0, 2, '[]', '[]', NULL, 1),
-- 超值加購 (20 options, 1 per item)
('opt_zb_addon_01', 'zhenbaochufang', 'mg_zb_addon_items', '白飯200g (原價 20)',          10, 0,  1, '[]', '[]', NULL, 1),
('opt_zb_addon_02', 'zhenbaochufang', 'mg_zb_addon_items', '韓式雞排 (原價 40)',          30, 0,  2, '[]', '[]', NULL, 1),
('opt_zb_addon_03', 'zhenbaochufang', 'mg_zb_addon_items', '照燒雞肉丸4 (原價 40)',       30, 0,  3, '[]', '[]', NULL, 1),
('opt_zb_addon_04', 'zhenbaochufang', 'mg_zb_addon_items', '香酥雞排 (原價 40)',          30, 0,  4, '[]', '[]', NULL, 1),
('opt_zb_addon_05', 'zhenbaochufang', 'mg_zb_addon_items', '燒烤棒腿 原味 (原價 45)',     35, 0,  5, '[]', '[]', NULL, 1),
('opt_zb_addon_06', 'zhenbaochufang', 'mg_zb_addon_items', '燒烤棒腿 酥炸 (原價 45)',     35, 0,  6, '[]', '[]', NULL, 1),
('opt_zb_addon_07', 'zhenbaochufang', 'mg_zb_addon_items', '脆皮雞排 (原價 40)',          35, 0,  7, '[]', '[]', NULL, 1),
('opt_zb_addon_08', 'zhenbaochufang', 'mg_zb_addon_items', '起司豬排 (原價 40)',          35, 0,  8, '[]', '[]', NULL, 1),
('opt_zb_addon_09', 'zhenbaochufang', 'mg_zb_addon_items', '無骨鹽酥雞 (原價 50)',        35, 0,  9, '[]', '[]', NULL, 1),
('opt_zb_addon_10', 'zhenbaochufang', 'mg_zb_addon_items', '蒲燒鯛魚 (原價 40)',          35, 0, 10, '[]', '[]', NULL, 1),
('opt_zb_addon_11', 'zhenbaochufang', 'mg_zb_addon_items', '熱狗 2 (原價 30)',            20, 0, 11, '[]', '[]', NULL, 1),
('opt_zb_addon_12', 'zhenbaochufang', 'mg_zb_addon_items', '細薯 (原價 45)',              25, 0, 12, '[]', '[]', NULL, 1),
('opt_zb_addon_13', 'zhenbaochufang', 'mg_zb_addon_items', '米血 (原價 30)',              25, 0, 13, '[]', '[]', NULL, 1),
('opt_zb_addon_14', 'zhenbaochufang', 'mg_zb_addon_items', '紐奧良骨腿 原味 (原價 70)',   60, 0, 14, '[]', '[]', NULL, 1),
('opt_zb_addon_15', 'zhenbaochufang', 'mg_zb_addon_items', '紐奧良骨腿 酥炸 (原價 70)',   60, 0, 15, '[]', '[]', NULL, 1),
('opt_zb_addon_16', 'zhenbaochufang', 'mg_zb_addon_items', '美式燒烤翅腿 原味 (原價 70)', 60, 0, 16, '[]', '[]', NULL, 1),
('opt_zb_addon_17', 'zhenbaochufang', 'mg_zb_addon_items', '美式燒烤翅腿 酥炸 (原價 70)', 60, 0, 17, '[]', '[]', NULL, 1),
('opt_zb_addon_18', 'zhenbaochufang', 'mg_zb_addon_items', '極品紅茶 (原價 25)',          15, 0, 18, '[]', '[]', NULL, 1),
('opt_zb_addon_19', 'zhenbaochufang', 'mg_zb_addon_items', '水煮蛋 (原價 15)',            10, 0, 19, '[]', '[]', NULL, 1),
('opt_zb_addon_20', 'zhenbaochufang', 'mg_zb_addon_items', '滷蛋 (原價 15)',              10, 0, 20, '[]', '[]', NULL, 1);

-- 5. Item Modifier Links
INSERT INTO item_modifier_links (tenant_id, item_id, group_id, sort_order, option_ids_json, is_disabled) VALUES
-- Item-specific options for A, B, C
('zhenbaochufang', 'zb_a_01', 'mg_zb_braised_rice_extra',   1, NULL, 0),
('zhenbaochufang', 'zb_a_02', 'mg_zb_braised_noodle_extra', 1, NULL, 0),
('zhenbaochufang', 'zb_a_03', 'mg_zb_braised_rice_extra',   1, NULL, 0),
('zhenbaochufang', 'zb_b_01', 'mg_zb_curry_rice_extra',     1, NULL, 0),
('zhenbaochufang', 'zb_b_02', 'mg_zb_curry_noodle_extra',   1, NULL, 0),
('zhenbaochufang', 'zb_c_01', 'mg_zb_dumpling_soy',         1, NULL, 0),
('zhenbaochufang', 'zb_c_02', 'mg_zb_dumpling_soy',         1, NULL, 0),
('zhenbaochufang', 'zb_c_03', 'mg_zb_dumpling_soy',         1, NULL, 0),
-- 超值加購 on all 14 items in A, B, C, D
('zhenbaochufang', 'zb_a_01', 'mg_zb_addon_items', 2, NULL, 0),
('zhenbaochufang', 'zb_a_02', 'mg_zb_addon_items', 2, NULL, 0),
('zhenbaochufang', 'zb_a_03', 'mg_zb_addon_items', 2, NULL, 0),
('zhenbaochufang', 'zb_b_01', 'mg_zb_addon_items', 2, NULL, 0),
('zhenbaochufang', 'zb_b_02', 'mg_zb_addon_items', 2, NULL, 0),
('zhenbaochufang', 'zb_c_01', 'mg_zb_addon_items', 2, NULL, 0),
('zhenbaochufang', 'zb_c_02', 'mg_zb_addon_items', 2, NULL, 0),
('zhenbaochufang', 'zb_c_03', 'mg_zb_addon_items', 2, NULL, 0),
('zhenbaochufang', 'zb_d_01', 'mg_zb_addon_items', 2, NULL, 0),
('zhenbaochufang', 'zb_d_02', 'mg_zb_addon_items', 2, NULL, 0),
('zhenbaochufang', 'zb_d_03', 'mg_zb_addon_items', 2, NULL, 0),
('zhenbaochufang', 'zb_d_04', 'mg_zb_addon_items', 2, NULL, 0),
('zhenbaochufang', 'zb_d_05', 'mg_zb_addon_items', 2, NULL, 0),
('zhenbaochufang', 'zb_d_06', 'mg_zb_addon_items', 2, NULL, 0);

INSERT INTO menu_catalog_revisions (tenant_id, revision)
VALUES ('zhenbaochufang', 1)
ON CONFLICT(tenant_id) DO UPDATE SET revision = revision + 1;
