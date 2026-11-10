-- Tenant seed: wuqiji / 舞奇雞. Source: user JSON, 2026-11-10.

-- Default LIFF applies only to initial creation; upserts preserve the configured tenant LIFF.

-- Execute the full seed as one cf D1 query batch via scripts/cloudflare-d1.cjs with an explicit mode.

-- On conflict, preserve credentials, LIFF configuration, features and operational settings not supplied by the user.

INSERT INTO tenants (id, name)
VALUES ('wuqiji', '舞奇雞')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name
WHERE tenants.id='wuqiji';

INSERT INTO tenant_config (tenant_id, brand_name, brand_color, order_prefix, cuisine_type, store_address, operating_hours, allow_scheduled_pickup, allow_dine_in, locale, delivery_policy, default_password, store_status, liff_id, liff_url, features, is_marketplace_visible, is_active, latitude, longitude, groq_model, openrouter_model, customer_order_domain, legacy_liff_endpoint_url)
VALUES ('wuqiji', '舞奇雞', '#e11d48', 'WQJ', 'snack', '', '週一至週日', 1, 0, 'zh-TW', '掃Line訂餐另有優惠', '12345678', 'open', '2012516664-7V17JM1u', 'https://liff.line.me/2012516664-7V17JM1u', '["reports","flex_notifications"]', 1, 1, NULL, NULL, 'openai/gpt-oss-20b', 'google/gemma-4-26b-a4b-it:free', 'blabfood', 'https://benmi-order.pages.dev/?tenant_id=wuqiji')
ON CONFLICT(tenant_id) DO UPDATE SET
    brand_name=excluded.brand_name,
    brand_color=excluded.brand_color,
    order_prefix=excluded.order_prefix,
    cuisine_type=excluded.cuisine_type,
    store_address=excluded.store_address,
    operating_hours=excluded.operating_hours,
    allow_scheduled_pickup=excluded.allow_scheduled_pickup,
    allow_dine_in=excluded.allow_dine_in,
    locale=excluded.locale,
    delivery_policy=excluded.delivery_policy
WHERE tenant_config.tenant_id='wuqiji';

INSERT INTO menu_categories (id, tenant_id, name, short_name, slug, category_type, sort_order, selection_type, is_required, min_selection, max_selection, allow_customization, applied_modifiers)
VALUES ('cat_wqj_chicken_chop', 'wuqiji', '雞排', '雞排', 'chicken-chop', 'catalog', 1, 'single', 0, 0, 1, 1, '[]')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    short_name=excluded.short_name,
    slug=excluded.slug,
    category_type=excluded.category_type,
    sort_order=excluded.sort_order,
    selection_type=excluded.selection_type,
    is_required=excluded.is_required,
    min_selection=excluded.min_selection,
    max_selection=excluded.max_selection,
    allow_customization=excluded.allow_customization,
    applied_modifiers=excluded.applied_modifiers
WHERE menu_categories.tenant_id='wuqiji';

INSERT INTO menu_categories (id, tenant_id, name, short_name, slug, category_type, sort_order, selection_type, is_required, min_selection, max_selection, allow_customization, applied_modifiers)
VALUES ('cat_wqj_combos', 'wuqiji', '套餐', '套餐', 'combos', 'catalog', 2, 'single', 0, 0, 1, 0, '[]')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    short_name=excluded.short_name,
    slug=excluded.slug,
    category_type=excluded.category_type,
    sort_order=excluded.sort_order,
    selection_type=excluded.selection_type,
    is_required=excluded.is_required,
    min_selection=excluded.min_selection,
    max_selection=excluded.max_selection,
    allow_customization=excluded.allow_customization,
    applied_modifiers=excluded.applied_modifiers
WHERE menu_categories.tenant_id='wuqiji';

INSERT INTO menu_categories (id, tenant_id, name, short_name, slug, category_type, sort_order, selection_type, is_required, min_selection, max_selection, allow_customization, applied_modifiers)
VALUES ('cat_wqj_drinks', 'wuqiji', '飲料', '飲料', 'drinks', 'catalog', 3, 'single', 0, 0, 1, 0, '[]')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    short_name=excluded.short_name,
    slug=excluded.slug,
    category_type=excluded.category_type,
    sort_order=excluded.sort_order,
    selection_type=excluded.selection_type,
    is_required=excluded.is_required,
    min_selection=excluded.min_selection,
    max_selection=excluded.max_selection,
    allow_customization=excluded.allow_customization,
    applied_modifiers=excluded.applied_modifiers
WHERE menu_categories.tenant_id='wuqiji';

INSERT INTO menu_categories (id, tenant_id, name, short_name, slug, category_type, sort_order, selection_type, is_required, min_selection, max_selection, allow_customization, applied_modifiers)
VALUES ('cat_wqj_fried_snacks', 'wuqiji', '奇雞小品', '小品', 'fried-snacks', 'catalog', 4, 'single', 0, 0, 1, 1, '[]')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    short_name=excluded.short_name,
    slug=excluded.slug,
    category_type=excluded.category_type,
    sort_order=excluded.sort_order,
    selection_type=excluded.selection_type,
    is_required=excluded.is_required,
    min_selection=excluded.min_selection,
    max_selection=excluded.max_selection,
    allow_customization=excluded.allow_customization,
    applied_modifiers=excluded.applied_modifiers
WHERE menu_categories.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_cc_01', '酥皮雞排', 105, NULL, NULL, 1, 1, 'cat_wqj_chicken_chop', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_cc_02', '脆皮雞排', 105, NULL, NULL, 0, 2, 'cat_wqj_chicken_chop', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_cc_03', '桔醬炭烤雞排', 115, NULL, NULL, 0, 3, 'cat_wqj_chicken_chop', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_cc_04', '蜜汁雞排', 115, NULL, NULL, 0, 4, 'cat_wqj_chicken_chop', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_cc_05', '泰式雞排', 115, NULL, NULL, 0, 5, 'cat_wqj_chicken_chop', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_cb_01', '加購升級A (細薯條(小) + 冷泡茶)', 60, '內含：細薯條(小)、冷泡茶', NULL, 0, 1, 'cat_wqj_combos', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_cb_02', '加購升級B (甜不辣(大) + 冷泡茶)', 75, '內含：甜不辣(大)、冷泡茶', NULL, 0, 2, 'cat_wqj_combos', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_cb_03', '加購升級C (鹽酥雞(小) + 冷泡茶)', 85, '內含：鹽酥雞(小)、冷泡茶', NULL, 0, 3, 'cat_wqj_combos', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_cb_04', '加購升級D (雞腿塊/塊、麥克雞塊 + 冷泡茶)', 130, '內含：雞腿塊/塊、麥克雞塊、冷泡茶', NULL, 0, 4, 'cat_wqj_combos', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_cb_05', '加購升級E (雞腿塊燒組合餐 (6塊))', 240, '內含：雞腿塊燒組合餐 (6塊)', NULL, 0, 5, 'cat_wqj_combos', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_dr_01', '高山青冷泡茶', 45, NULL, NULL, 0, 1, 'cat_wqj_drinks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_dr_02', '黃金烏龍冷泡茶', 45, NULL, NULL, 0, 2, 'cat_wqj_drinks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_dr_03', '烏龍綠冷泡茶', 45, NULL, NULL, 0, 3, 'cat_wqj_drinks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_dr_04', '阿里山冰茶', 45, NULL, NULL, 0, 4, 'cat_wqj_drinks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_dr_05', '日月潭魚池紅茶', 45, NULL, NULL, 0, 5, 'cat_wqj_drinks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_01', '酥炸炸雞', 65, '大份 110 元，小份 65 元', NULL, 0, 1, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_02', '咔滋脆米花', 70, '大份 115 元，小份 70 元', NULL, 0, 2, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_03', '非嗑泰魷魚', 125, NULL, NULL, 0, 3, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_04', '甘梅地瓜', 65, '大份 105 元，小份 65 元', NULL, 0, 4, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_05', '脆薯棒', 60, '大份 100 元，小份 60 元', NULL, 0, 5, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_06', '波浪薯條', 60, '大份 100 元，小份 60 元', NULL, 0, 6, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_07', '細薯棒', 45, '大份 60 元，小份 45 元', NULL, 0, 7, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_08', '甜不辣', 45, '大份 65 元，小份 45 元', NULL, 0, 8, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_09', '咔啦雞腿翅', 70, NULL, NULL, 0, 9, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_10', '咔啦雞腿塊', 70, NULL, NULL, 0, 10, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_11', '咔啦雞翅', 50, NULL, NULL, 0, 11, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_12', '七里香', 48, NULL, NULL, 0, 12, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_13', '雞皮', 48, NULL, NULL, 0, 13, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_14', '三角骨', 65, NULL, NULL, 0, 14, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_15', '米血', 48, NULL, NULL, 0, 15, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_16', '炸餃子', 65, NULL, NULL, 0, 16, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_17', '小熱狗', 48, NULL, NULL, 0, 17, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_18', '洋蔥圈', 48, NULL, NULL, 0, 18, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_19', '百頁豆腐', 48, NULL, NULL, 0, 19, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_20', '花枝丸', 48, NULL, NULL, 0, 20, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_21', 'QQ球', 48, NULL, NULL, 0, 21, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_22', '杏鮑菇', 48, NULL, NULL, 0, 22, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_23', '麥克雞塊', 55, NULL, NULL, 0, 23, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO menu_items (tenant_id, id, name, price, description, badge_text, is_recommended, sort_order, category_id, item_type)
VALUES ('wuqiji', 'wqj_fs_24', '薯餅', 50, NULL, NULL, 0, 24, 'cat_wqj_fried_snacks', 'standard')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    category_id=excluded.category_id,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='wuqiji';

INSERT INTO modifier_groups (id, tenant_id, name, scope, selection_type, is_required, min_selection, max_selection, allow_repeats, included, auto_popup, sort_order, sources_json, labels_json, source_metadata_json)
VALUES ('mg_wqj_flavor', 'wuqiji', '口味選擇', 'item', 'single', 0, 0, 1, 0, 0, 0, 1, '[]', '{}', '{}')
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    scope=excluded.scope,
    selection_type=excluded.selection_type,
    is_required=excluded.is_required,
    min_selection=excluded.min_selection,
    max_selection=excluded.max_selection,
    allow_repeats=excluded.allow_repeats,
    included=excluded.included,
    auto_popup=excluded.auto_popup,
    sort_order=excluded.sort_order,
    sources_json=excluded.sources_json,
    labels_json=excluded.labels_json,
    source_metadata_json=excluded.source_metadata_json,
    revision=modifier_groups.revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE modifier_groups.tenant_id='wuqiji';

INSERT INTO modifier_options (tenant_id, group_id, id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('wuqiji', 'mg_wqj_flavor', 'opt_wqj_fl_pepper', '原味/胡椒', 0, 1, 1, '[]', '[]', NULL, 1)
ON CONFLICT(id) DO UPDATE SET
    group_id=excluded.group_id,
    name=excluded.name,
    price=excluded.price,
    is_default=excluded.is_default,
    sort_order=excluded.sort_order,
    sub_options_json=excluded.sub_options_json,
    eligibility_rules_json=excluded.eligibility_rules_json,
    product_id=excluded.product_id,
    included_quantity=excluded.included_quantity,
    updated_at=CURRENT_TIMESTAMP
WHERE modifier_options.tenant_id='wuqiji';

INSERT INTO modifier_options (tenant_id, group_id, id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('wuqiji', 'mg_wqj_flavor', 'opt_wqj_fl_spicy', '辣粉', 0, 0, 2, '[]', '[]', NULL, 1)
ON CONFLICT(id) DO UPDATE SET
    group_id=excluded.group_id,
    name=excluded.name,
    price=excluded.price,
    is_default=excluded.is_default,
    sort_order=excluded.sort_order,
    sub_options_json=excluded.sub_options_json,
    eligibility_rules_json=excluded.eligibility_rules_json,
    product_id=excluded.product_id,
    included_quantity=excluded.included_quantity,
    updated_at=CURRENT_TIMESTAMP
WHERE modifier_options.tenant_id='wuqiji';

INSERT INTO modifier_options (tenant_id, group_id, id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('wuqiji', 'mg_wqj_flavor', 'opt_wqj_fl_plum', '梅粉', 0, 0, 3, '[]', '[]', NULL, 1)
ON CONFLICT(id) DO UPDATE SET
    group_id=excluded.group_id,
    name=excluded.name,
    price=excluded.price,
    is_default=excluded.is_default,
    sort_order=excluded.sort_order,
    sub_options_json=excluded.sub_options_json,
    eligibility_rules_json=excluded.eligibility_rules_json,
    product_id=excluded.product_id,
    included_quantity=excluded.included_quantity,
    updated_at=CURRENT_TIMESTAMP
WHERE modifier_options.tenant_id='wuqiji';

INSERT INTO modifier_options (tenant_id, group_id, id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('wuqiji', 'mg_wqj_flavor', 'opt_wqj_fl_lemon', '檸檬', 0, 0, 4, '[]', '[]', NULL, 1)
ON CONFLICT(id) DO UPDATE SET
    group_id=excluded.group_id,
    name=excluded.name,
    price=excluded.price,
    is_default=excluded.is_default,
    sort_order=excluded.sort_order,
    sub_options_json=excluded.sub_options_json,
    eligibility_rules_json=excluded.eligibility_rules_json,
    product_id=excluded.product_id,
    included_quantity=excluded.included_quantity,
    updated_at=CURRENT_TIMESTAMP
WHERE modifier_options.tenant_id='wuqiji';

INSERT INTO modifier_options (tenant_id, group_id, id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('wuqiji', 'mg_wqj_flavor', 'opt_wqj_fl_curry', '咖哩', 0, 0, 5, '[]', '[]', NULL, 1)
ON CONFLICT(id) DO UPDATE SET
    group_id=excluded.group_id,
    name=excluded.name,
    price=excluded.price,
    is_default=excluded.is_default,
    sort_order=excluded.sort_order,
    sub_options_json=excluded.sub_options_json,
    eligibility_rules_json=excluded.eligibility_rules_json,
    product_id=excluded.product_id,
    included_quantity=excluded.included_quantity,
    updated_at=CURRENT_TIMESTAMP
WHERE modifier_options.tenant_id='wuqiji';

INSERT INTO modifier_options (tenant_id, group_id, id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('wuqiji', 'mg_wqj_flavor', 'opt_wqj_fl_seaweed', '海苔', 0, 0, 6, '[]', '[]', NULL, 1)
ON CONFLICT(id) DO UPDATE SET
    group_id=excluded.group_id,
    name=excluded.name,
    price=excluded.price,
    is_default=excluded.is_default,
    sort_order=excluded.sort_order,
    sub_options_json=excluded.sub_options_json,
    eligibility_rules_json=excluded.eligibility_rules_json,
    product_id=excluded.product_id,
    included_quantity=excluded.included_quantity,
    updated_at=CURRENT_TIMESTAMP
WHERE modifier_options.tenant_id='wuqiji';

INSERT INTO modifier_options (tenant_id, group_id, id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('wuqiji', 'mg_wqj_flavor', 'opt_wqj_fl_garlic', '蒜味', 0, 0, 7, '[]', '[]', NULL, 1)
ON CONFLICT(id) DO UPDATE SET
    group_id=excluded.group_id,
    name=excluded.name,
    price=excluded.price,
    is_default=excluded.is_default,
    sort_order=excluded.sort_order,
    sub_options_json=excluded.sub_options_json,
    eligibility_rules_json=excluded.eligibility_rules_json,
    product_id=excluded.product_id,
    included_quantity=excluded.included_quantity,
    updated_at=CURRENT_TIMESTAMP
WHERE modifier_options.tenant_id='wuqiji';

INSERT INTO item_modifier_links (tenant_id,item_id,group_id,sort_order,option_ids_json,is_disabled)
SELECT tenant_id,id,'mg_wqj_flavor',1,NULL,0 FROM menu_items
WHERE tenant_id='wuqiji' AND category_id IN ('cat_wqj_chicken_chop', 'cat_wqj_fried_snacks')
ON CONFLICT(tenant_id,item_id,group_id) DO UPDATE SET sort_order=excluded.sort_order,option_ids_json=NULL,is_disabled=0;

INSERT INTO menu_catalog_revisions (tenant_id,revision) VALUES ('wuqiji',1) ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1;

-- BEGIN WUQIJI OPTION CORRECTION 20261110

-- Correct wuqiji item-level flavor and combo drink choices; confirmed from reference menu.

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
