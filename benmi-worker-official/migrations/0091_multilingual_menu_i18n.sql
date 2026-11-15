-- Migration 0091: Multilingual Menu I18N Architecture & Canary Seed for blab_demo
-- Adds extensible i18n_json storage across tenant_config, menu_categories, menu_items,
-- modifier_groups, and modifier_options. Legacy tenants default to '{}' and gracefully
-- fall back to their canonical primary name/description/title fields.

ALTER TABLE tenant_config ADD COLUMN supported_locales TEXT DEFAULT '["zh-TW","en"]';
ALTER TABLE tenant_config ADD COLUMN i18n_json TEXT DEFAULT '{}';

ALTER TABLE menu_categories ADD COLUMN i18n_json TEXT DEFAULT '{}';
ALTER TABLE menu_items ADD COLUMN i18n_json TEXT DEFAULT '{}';
ALTER TABLE modifier_groups ADD COLUMN i18n_json TEXT DEFAULT '{}';
ALTER TABLE modifier_options ADD COLUMN i18n_json TEXT DEFAULT '{}';

-- =====================================================================
-- Canary Tenant Seed: blab_demo (Preserves all live prices & test rows)
-- =====================================================================

UPDATE tenant_config
SET
  supported_locales = '["zh-TW","en","vi"]',
  i18n_json = '{"en":{"brand_name":"BLAB Demo - Gancheng Salted Chicken","store_address":"No. 302, Gancheng St., Nantun Dist., Taichung City (Demo Showroom)","delivery_policy":"Official Demo Store: Walk-in, scheduled pickup, and dine-in QR ordering supported."},"vi":{"brand_name":"BLAB Demo - Gà Nước Muối Gancheng","store_address":"Số 302, Đ. Gancheng, Q. Nantun, TP. Đài Trung (Demo Showroom)","delivery_policy":"Cửa hàng Demo: Hỗ trợ đặt tại quầy, hẹn giờ mang về và gọi món QR tại bàn."}}'
WHERE tenant_id = 'blab_demo';

-- Categories
UPDATE menu_categories
SET i18n_json = '{"en":{"name":"Meats","short_name":"Meats"},"vi":{"name":"Các loại thịt","short_name":"Thịt"}}'
WHERE tenant_id = 'blab_demo' AND id = 'cat_demo_meat';

UPDATE menu_categories
SET i18n_json = '{"en":{"name":"Signature Sides ($50)","short_name":"Sides $50"},"vi":{"name":"Món kèm chọn lọc ($50)","short_name":"Món $50"}}'
WHERE tenant_id = 'blab_demo' AND id = 'cat_demo_side50';

UPDATE menu_categories
SET i18n_json = '{"en":{"name":"Specialty Sides ($30)","short_name":"Sides $30"},"vi":{"name":"Món kèm đặc sắc ($30)","short_name":"Món $30"}}'
WHERE tenant_id = 'blab_demo' AND id = 'cat_demo_side30';

UPDATE menu_categories
SET i18n_json = '{"en":{"name":"Classic Sides ($25)","short_name":"Sides $25"},"vi":{"name":"Món kèm truyền thống ($25)","short_name":"Món $25"}}'
WHERE tenant_id = 'blab_demo' AND id = 'cat_demo_side25';

UPDATE menu_categories
SET i18n_json = '{"en":{"name":"Vegetables & Sides (1 for $35 / 3 for $100)","short_name":"Veggies","promo_label":"3 for $100"},"vi":{"name":"Rau củ & Món phụ (1 phần $35 / 3 phần $100)","short_name":"Rau củ","promo_label":"3 phần $100"}}'
WHERE tenant_id = 'blab_demo' AND id = 'cat_demo_veggie';

-- Items: Meats
UPDATE menu_items
SET i18n_json = '{"en":{"name":"Chicken Breast","badge_text":"Recommended"},"vi":{"name":"Ức gà","badge_text":"Gợi ý"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_meat_01';

UPDATE menu_items
SET i18n_json = '{"en":{"name":"Chicken Thigh","badge_text":"Best Seller"},"vi":{"name":"Đùi gà","badge_text":"Bán chạy"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_meat_02';

UPDATE menu_items
SET i18n_json = '{"en":{"name":"Matsusaka Pork Neck"},"vi":{"name":"Thịt nọng heo (Matsusaka)"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_meat_03';

-- Items: $50 Sides
UPDATE menu_items
SET i18n_json = '{"en":{"name":"Boneless Chicken Feet","badge_text":"Signature"},"vi":{"name":"Chân gà rút xương","badge_text":"Đặc trưng"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_s50_01';

UPDATE menu_items
SET i18n_json = '{"en":{"name":"Japanese Yam"},"vi":{"name":"Củ mài Nhật"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_s50_02';

-- Items: $30 Sides
UPDATE menu_items
SET i18n_json = '{"en":{"name":"Smoked Bean Curd Skin"},"vi":{"name":"Váng đậu xông khói"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_s30_01';

UPDATE menu_items
SET i18n_json = '{"en":{"name":"Tea-Smoked Tofu Sheets"},"vi":{"name":"Đậu hũ lá xông trà"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_s30_02';

UPDATE menu_items
SET i18n_json = '{"en":{"name":"Quail Eggs (5 pcs)"},"vi":{"name":"Trứng cút (5 quả)"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_s30_03';

UPDATE menu_items
SET i18n_json = '{"en":{"name":"Duck Blood Rice Cake"},"vi":{"name":"Bánh nếp tiết vịt"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_s30_04';

UPDATE menu_items
SET i18n_json = '{"en":{"name":"Zucchini"},"vi":{"name":"Bí ngòi"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_s30_05';

UPDATE menu_items
SET i18n_json = '{"en":{"name":"Black Wood Ear Mushroom"},"vi":{"name":"Mộc nhĩ (Nấm mèo)"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_s30_06';

UPDATE menu_items
SET i18n_json = '{"en":{"name":"Fresh Apple"},"vi":{"name":"Táo tươi"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_s30_07';

UPDATE menu_items
SET i18n_json = '{"en":{"name":"Bamboo Shoots"},"vi":{"name":"Măng lát"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_s30_08';

-- Items: $25 Sides
UPDATE menu_items
SET i18n_json = '{"en":{"name":"Poached Shrimp (1 pc)"},"vi":{"name":"Tôm luộc (1 con)"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_s25_01';

UPDATE menu_items
SET i18n_json = '{"en":{"name":"Braised Black Dried Tofu"},"vi":{"name":"Đậu phụ khô đen kho"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_s25_02';

UPDATE menu_items
SET i18n_json = '{"en":{"name":"Chikuwa Fish Cake"},"vi":{"name":"Chả cá ống Chikuwa"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_s25_03';

UPDATE menu_items
SET i18n_json = '{"en":{"name":"Century Egg"},"vi":{"name":"Trứng bắc thảo"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_s25_04';

UPDATE menu_items
SET i18n_json = '{"en":{"name":"Taiwanese Tempura Fish Cake"},"vi":{"name":"Chả cá Tempura Đài Loan"}}'
WHERE tenant_id = 'blab_demo' AND id = 'item_demo_s25_05';

-- Items: Veggies
UPDATE menu_items SET i18n_json = '{"en":{"name":"Cabbage"},"vi":{"name":"Bắp cải"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_01';
UPDATE menu_items SET i18n_json = '{"en":{"name":"Cucumber"},"vi":{"name":"Dưa chuột"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_02';
UPDATE menu_items SET i18n_json = '{"en":{"name":"Broccoli"},"vi":{"name":"Bông cải xanh"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_03';
UPDATE menu_items SET i18n_json = '{"en":{"name":"White Water Snowflake"},"vi":{"name":"Rau thủy liên"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_04';
UPDATE menu_items SET i18n_json = '{"en":{"name":"Baby Corn"},"vi":{"name":"Ngô bao tử"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_05';
UPDATE menu_items SET i18n_json = '{"en":{"name":"Baby Napa Cabbage"},"vi":{"name":"Cải thảo non"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_06';
UPDATE menu_items SET i18n_json = '{"en":{"name":"Enoki Mushroom"},"vi":{"name":"Nấm kim châm"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_07';
UPDATE menu_items SET i18n_json = '{"en":{"name":"King Oyster Mushroom"},"vi":{"name":"Nấm đùi gà"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_08';
UPDATE menu_items SET i18n_json = '{"en":{"name":"Okra"},"vi":{"name":"Đậu bắp"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_09';
UPDATE menu_items SET i18n_json = '{"en":{"name":"Lotus Root Slices"},"vi":{"name":"Củ sen lát"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_10';
UPDATE menu_items SET i18n_json = '{"en":{"name":"Bell Pepper"},"vi":{"name":"Ớt chuông"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_11';
UPDATE menu_items SET i18n_json = '{"en":{"name":"Boiled Peanuts"},"vi":{"name":"Lạc luộc"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_12';
UPDATE menu_items SET i18n_json = '{"en":{"name":"Braised Shiitake Mushroom"},"vi":{"name":"Nấm hương kho"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_13';
UPDATE menu_items SET i18n_json = '{"en":{"name":"Pig Ear"},"vi":{"name":"Tai heo"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_14';
UPDATE menu_items SET i18n_json = '{"en":{"name":"Chicken Cartilage"},"vi":{"name":"Sụn gà"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_15';
UPDATE menu_items SET i18n_json = '{"en":{"name":"Roasted Potato"},"vi":{"name":"Khoai tây nướng"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_16';
UPDATE menu_items SET i18n_json = '{"en":{"name":"Yuba Tofu Skin"},"vi":{"name":"Phù trúc (Váng đậu)"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_17';
UPDATE menu_items SET i18n_json = '{"en":{"name":"Asparagus"},"vi":{"name":"Măng tây"}}' WHERE tenant_id = 'blab_demo' AND id = 'item_demo_veg_18';

-- Modifier Groups
UPDATE modifier_groups SET i18n_json = '{"en":{"title":"Flavor Selection"},"vi":{"title":"Chọn hương vị"}}'
WHERE tenant_id = 'blab_demo' AND id = 'demo_flavor';

UPDATE modifier_groups SET i18n_json = '{"en":{"title":"Saltiness"},"vi":{"title":"Độ mặn"}}'
WHERE tenant_id = 'blab_demo' AND id = 'demo_salt';

UPDATE modifier_groups SET i18n_json = '{"en":{"title":"Spice Level (Bird''s Eye Chili)"},"vi":{"title":"Mức độ cay (Ớt chỉ thiên)"}}'
WHERE tenant_id = 'blab_demo' AND id = 'demo_spicy';

UPDATE modifier_groups SET i18n_json = '{"en":{"title":"Toppings Adjustment"},"vi":{"title":"Điều chỉnh gia vị kèm"}}'
WHERE tenant_id = 'blab_demo' AND id = 'demo_ingredients';

UPDATE modifier_groups SET i18n_json = '{"en":{"title":"Extra Add-ons (Optional)"},"vi":{"title":"Topping thêm (Tùy chọn)"}}'
WHERE tenant_id = 'blab_demo' AND id = 'demo_addons';

-- Modifier Options: Flavor (id match covers both legacy & prefixed IDs, name match ensures safety)
UPDATE modifier_options
SET i18n_json = '{"en":{"name":"House Special Pepper"},"vi":{"name":"Tiêu đặc chế"}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_flavor' AND (id = 'demo_flavor_特調胡椒' OR id = '特調胡椒' OR name = '特調胡椒');

UPDATE modifier_options
SET i18n_json = '{"en":{"name":"Thai Sweet & Spicy"},"vi":{"name":"Chua cay kiểu Thái"}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_flavor' AND (id = 'demo_flavor_泰式酸辣' OR id = '泰式酸辣' OR name = '泰式酸辣');

UPDATE modifier_options
SET i18n_json = '{"en":{"name":"Refreshing Lemon","sub_options":{"不加香油":"No Sesame Oil","不加鹽巴":"No Salt"}},"vi":{"name":"Chanh thanh mát","sub_options":{"不加香油":"Không dầu mè","不加鹽巴":"Không muối"}}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_flavor' AND (id = 'demo_flavor_清爽檸檬' OR id = '清爽檸檬' OR name = '清爽檸檬');

UPDATE modifier_options
SET i18n_json = '{"en":{"name":"Lemon & Cilantro","sub_options":{"不加香油":"No Sesame Oil","不加鹽巴":"No Salt"}},"vi":{"name":"Chanh & Rau mùi","sub_options":{"不加香油":"Không dầu mè","不加鹽巴":"Không muối"}}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_flavor' AND (id = 'demo_flavor_檸檬香菜' OR id = '檸檬香菜' OR name = '檸檬香菜');

UPDATE modifier_options
SET i18n_json = '{"en":{"name":"Original (Custom)","sub_options":{"不加香油":"No Sesame Oil","不加胡椒":"No Pepper","不加胡椒加鹽巴":"No Pepper & No Salt"}},"vi":{"name":"Vị nguyên bản (Tùy chỉnh)","sub_options":{"不加香油":"Không dầu mè","不加胡椒":"Không tiêu","不加胡椒加鹽巴":"Không tiêu & không muối"}}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_flavor' AND (id = 'demo_flavor_原味客製' OR id = '原味客製' OR name = '原味客製');

-- Modifier Options: Salt
UPDATE modifier_options
SET i18n_json = '{"en":{"name":"Normal"},"vi":{"name":"Vừa ăn"}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_salt' AND (id = 'demo_salt_正常' OR id = '正常' OR name = '正常');

UPDATE modifier_options
SET i18n_json = '{"en":{"name":"Extra Seasoning"},"vi":{"name":"Đậm vị"}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_salt' AND (id = 'demo_salt_調味重' OR id = '調味重' OR name = '調味重');

UPDATE modifier_options
SET i18n_json = '{"en":{"name":"Light Seasoning"},"vi":{"name":"Thanh đạm (ít mặn)"}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_salt' AND (id = 'demo_salt_調味清淡' OR id = '調味清淡' OR name = '調味清淡');

-- Modifier Options: Spicy
UPDATE modifier_options
SET i18n_json = '{"en":{"name":"No Spice"},"vi":{"name":"Không cay"}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_spicy' AND (id = 'demo_spicy_不辣' OR id = '不辣' OR name = '不辣');

UPDATE modifier_options
SET i18n_json = '{"en":{"name":"Mild"},"vi":{"name":"Cay nhẹ"}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_spicy' AND (id = 'demo_spicy_微辣' OR id = '微辣' OR name = '微辣');

UPDATE modifier_options
SET i18n_json = '{"en":{"name":"Low-Medium"},"vi":{"name":"Cay ít"}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_spicy' AND (id = 'demo_spicy_小辣' OR id = '小辣' OR name = '小辣');

UPDATE modifier_options
SET i18n_json = '{"en":{"name":"Medium"},"vi":{"name":"Cay vừa"}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_spicy' AND (id = 'demo_spicy_中辣' OR id = '中辣' OR name = '中辣');

UPDATE modifier_options
SET i18n_json = '{"en":{"name":"Extra Spicy"},"vi":{"name":"Cay nhiều"}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_spicy' AND (id = 'demo_spicy_大辣' OR id = '大辣' OR name = '大辣');

UPDATE modifier_options
SET i18n_json = '{"en":{"name":"Chili on the Side"},"vi":{"name":"Để ớt riêng góc hộp"}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_spicy' AND (id = 'demo_spicy_辣椒放餐盒角落' OR id = '辣椒放餐盒角落' OR name = '辣椒放餐盒角落');

-- Modifier Options: Ingredients
UPDATE modifier_options
SET i18n_json = '{"en":{"name":"No Scallions"},"vi":{"name":"Không hành lá"}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_ingredients' AND (id = 'demo_ingredients_不加蔥花' OR id = '不加蔥花' OR name = '不加蔥花');

UPDATE modifier_options
SET i18n_json = '{"en":{"name":"No Garlic"},"vi":{"name":"Không tỏi"}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_ingredients' AND (id = 'demo_ingredients_不加蒜頭' OR id = '不加蒜頭' OR name = '不加蒜頭');

UPDATE modifier_options
SET i18n_json = '{"en":{"name":"No Onion"},"vi":{"name":"Không hành tây"}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_ingredients' AND (id = 'demo_ingredients_不加洋蔥' OR id = '不加洋蔥' OR name = '不加洋蔥');

-- Modifier Options: Addons
UPDATE modifier_options
SET i18n_json = '{"en":{"name":"Extra Cilantro"},"vi":{"name":"Thêm rau mùi"}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_addons' AND (id = 'demo_addons_加香菜' OR id = '加香菜' OR name = '加香菜');

UPDATE modifier_options
SET i18n_json = '{"en":{"name":"Extra Lemon Juice"},"vi":{"name":"Thêm nước cốt chanh"}}'
WHERE tenant_id = 'blab_demo' AND group_id = 'demo_addons' AND (id = 'demo_addons_加檸檬汁' OR id = '加檸檬汁' OR name = '加檸檬汁');
