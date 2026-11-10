-- Menu-only update: 珍寶廚坊 / zhenbaochufang, 2026-11-09.

-- Source: /Users/duccao/Desktop/zhenbaochufang.txt.

-- User confirmed: both meals default to 200g rice.

-- Does not modify tenants, tenant_config, orders, payments, or credentials.

-- Execute as one D1 query batch through scripts/cloudflare-d1.cjs.

DELETE FROM item_modifier_links WHERE tenant_id='zhenbaochufang' AND group_id='mg_zb_topping_add_on';

DELETE FROM category_modifier_links WHERE tenant_id='zhenbaochufang' AND group_id='mg_zb_topping_add_on';

DELETE FROM modifier_options WHERE tenant_id='zhenbaochufang' AND group_id='mg_zb_topping_add_on';

DELETE FROM modifier_groups WHERE tenant_id='zhenbaochufang' AND id='mg_zb_topping_add_on' AND scope='item';

DELETE FROM menu_bundle_rules WHERE tenant_id='zhenbaochufang' AND parent_item_id IN ('zb_item_01','zb_item_02','zhenbaochufang_product_ed3fe427-6813-49af-baf3-c043ff0401fe');

DELETE FROM menu_items WHERE tenant_id='zhenbaochufang' AND id='zhenbaochufang_product_ed3fe427-6813-49af-baf3-c043ff0401fe';

INSERT INTO menu_categories (id, tenant_id, name, short_name, slug, category_type, selection_type, is_required, min_selection, max_selection, sort_order, allow_customization, applied_modifiers, pricing_rules)
VALUES ('cat_zb_main', 'zhenbaochufang', '經典配菜餐', '主餐', 'main-dishes', 'catalog', 'single', 0, 0, 1, 1, 1, '[]', NULL)
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    short_name=excluded.short_name,
    slug=excluded.slug,
    category_type=excluded.category_type,
    selection_type=excluded.selection_type,
    is_required=excluded.is_required,
    min_selection=excluded.min_selection,
    max_selection=excluded.max_selection,
    sort_order=excluded.sort_order,
    allow_customization=excluded.allow_customization,
    applied_modifiers=excluded.applied_modifiers,
    pricing_rules=excluded.pricing_rules
WHERE menu_categories.tenant_id='zhenbaochufang';

INSERT INTO menu_categories (id, tenant_id, name, short_name, slug, category_type, selection_type, is_required, min_selection, max_selection, sort_order, allow_customization, applied_modifiers, pricing_rules)
VALUES ('cat_zb_addon', 'zhenbaochufang', '超值加購', '加購', 'add-ons', 'catalog', 'single', 0, 0, 1, 2, 0, '[]', NULL)
ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,
    short_name=excluded.short_name,
    slug=excluded.slug,
    category_type=excluded.category_type,
    selection_type=excluded.selection_type,
    is_required=excluded.is_required,
    min_selection=excluded.min_selection,
    max_selection=excluded.max_selection,
    sort_order=excluded.sort_order,
    allow_customization=excluded.allow_customization,
    applied_modifiers=excluded.applied_modifiers,
    pricing_rules=excluded.pricing_rules
WHERE menu_categories.tenant_id='zhenbaochufang';

INSERT INTO menu_items (id, tenant_id, category_id, name, price, description, badge_text, is_recommended, sort_order, item_type)
VALUES ('zb_item_01', 'zhenbaochufang', 'cat_zb_main', '85配菜飯 (白飯 200g，附滷蛋)', 85, '附滷蛋', NULL, 1, 1, 'standard')
ON CONFLICT(id) DO UPDATE SET
    category_id=excluded.category_id,
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='zhenbaochufang';

INSERT INTO menu_items (id, tenant_id, category_id, name, price, description, badge_text, is_recommended, sort_order, item_type)
VALUES ('zb_item_02', 'zhenbaochufang', 'cat_zb_main', '60配菜飯 (白飯 100g 量少，附滷蛋)', 60, '附滷蛋', NULL, 0, 2, 'standard')
ON CONFLICT(id) DO UPDATE SET
    category_id=excluded.category_id,
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='zhenbaochufang';

INSERT INTO menu_items (id, tenant_id, category_id, name, price, description, badge_text, is_recommended, sort_order, item_type)
VALUES ('zb_add_01', 'zhenbaochufang', 'cat_zb_addon', '白飯 200g', 10, '原價 20', NULL, 0, 1, 'standard')
ON CONFLICT(id) DO UPDATE SET
    category_id=excluded.category_id,
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='zhenbaochufang';

INSERT INTO menu_items (id, tenant_id, category_id, name, price, description, badge_text, is_recommended, sort_order, item_type)
VALUES ('zb_add_02', 'zhenbaochufang', 'cat_zb_addon', '韓式雞排', 30, '原價 40', NULL, 0, 2, 'standard')
ON CONFLICT(id) DO UPDATE SET
    category_id=excluded.category_id,
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='zhenbaochufang';

INSERT INTO menu_items (id, tenant_id, category_id, name, price, description, badge_text, is_recommended, sort_order, item_type)
VALUES ('zb_add_03', 'zhenbaochufang', 'cat_zb_addon', '照燒雞肉丸 (4顆)', 30, '原價 40', NULL, 0, 3, 'standard')
ON CONFLICT(id) DO UPDATE SET
    category_id=excluded.category_id,
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='zhenbaochufang';

INSERT INTO menu_items (id, tenant_id, category_id, name, price, description, badge_text, is_recommended, sort_order, item_type)
VALUES ('zb_add_04', 'zhenbaochufang', 'cat_zb_addon', '香酥雞排', 30, '原價 40', NULL, 0, 4, 'standard')
ON CONFLICT(id) DO UPDATE SET
    category_id=excluded.category_id,
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='zhenbaochufang';

INSERT INTO menu_items (id, tenant_id, category_id, name, price, description, badge_text, is_recommended, sort_order, item_type)
VALUES ('zb_add_05', 'zhenbaochufang', 'cat_zb_addon', '燒烤棒腿 (原味)', 35, '原價 45', NULL, 0, 5, 'standard')
ON CONFLICT(id) DO UPDATE SET
    category_id=excluded.category_id,
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='zhenbaochufang';

INSERT INTO menu_items (id, tenant_id, category_id, name, price, description, badge_text, is_recommended, sort_order, item_type)
VALUES ('zb_add_06', 'zhenbaochufang', 'cat_zb_addon', '燒烤棒腿 (酥炸)', 35, '原價 45', NULL, 0, 6, 'standard')
ON CONFLICT(id) DO UPDATE SET
    category_id=excluded.category_id,
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='zhenbaochufang';

INSERT INTO menu_items (id, tenant_id, category_id, name, price, description, badge_text, is_recommended, sort_order, item_type)
VALUES ('zb_add_07', 'zhenbaochufang', 'cat_zb_addon', '脆皮雞排', 35, '原價 40', NULL, 0, 7, 'standard')
ON CONFLICT(id) DO UPDATE SET
    category_id=excluded.category_id,
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='zhenbaochufang';

INSERT INTO menu_items (id, tenant_id, category_id, name, price, description, badge_text, is_recommended, sort_order, item_type)
VALUES ('zb_add_08', 'zhenbaochufang', 'cat_zb_addon', '起司豬排', 35, '原價 40', NULL, 0, 8, 'standard')
ON CONFLICT(id) DO UPDATE SET
    category_id=excluded.category_id,
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='zhenbaochufang';

INSERT INTO menu_items (id, tenant_id, category_id, name, price, description, badge_text, is_recommended, sort_order, item_type)
VALUES ('zb_add_09', 'zhenbaochufang', 'cat_zb_addon', '無骨鹽酥雞', 35, '原價 50', NULL, 0, 9, 'standard')
ON CONFLICT(id) DO UPDATE SET
    category_id=excluded.category_id,
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='zhenbaochufang';

INSERT INTO menu_items (id, tenant_id, category_id, name, price, description, badge_text, is_recommended, sort_order, item_type)
VALUES ('zb_add_10', 'zhenbaochufang', 'cat_zb_addon', '蒲燒鯛魚', 35, '原價 40', NULL, 0, 10, 'standard')
ON CONFLICT(id) DO UPDATE SET
    category_id=excluded.category_id,
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='zhenbaochufang';

INSERT INTO menu_items (id, tenant_id, category_id, name, price, description, badge_text, is_recommended, sort_order, item_type)
VALUES ('zb_add_11', 'zhenbaochufang', 'cat_zb_addon', '熱狗 (2支)', 20, '原價 30', NULL, 0, 11, 'standard')
ON CONFLICT(id) DO UPDATE SET
    category_id=excluded.category_id,
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='zhenbaochufang';

INSERT INTO menu_items (id, tenant_id, category_id, name, price, description, badge_text, is_recommended, sort_order, item_type)
VALUES ('zb_add_12', 'zhenbaochufang', 'cat_zb_addon', '細薯', 25, '原價 45', NULL, 0, 12, 'standard')
ON CONFLICT(id) DO UPDATE SET
    category_id=excluded.category_id,
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='zhenbaochufang';

INSERT INTO menu_items (id, tenant_id, category_id, name, price, description, badge_text, is_recommended, sort_order, item_type)
VALUES ('zb_add_13', 'zhenbaochufang', 'cat_zb_addon', '米血', 25, '原價 30', NULL, 0, 13, 'standard')
ON CONFLICT(id) DO UPDATE SET
    category_id=excluded.category_id,
    name=excluded.name,
    price=excluded.price,
    description=excluded.description,
    badge_text=excluded.badge_text,
    is_recommended=excluded.is_recommended,
    sort_order=excluded.sort_order,
    item_type=excluded.item_type,
    menu_revision=menu_items.menu_revision+1,
    updated_at=CURRENT_TIMESTAMP
WHERE menu_items.tenant_id='zhenbaochufang';

INSERT INTO modifier_groups (id, tenant_id, name, scope, selection_type, is_required, min_selection, max_selection, allow_repeats, included, auto_popup, sort_order, sources_json, labels_json, source_metadata_json)
VALUES ('mg_zb_rice_adjustment', 'zhenbaochufang', '白飯與飯量調整', 'item', 'single', 0, 0, 1, 0, 0, 0, 1, '[]', '{}', '{}')
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
WHERE modifier_groups.tenant_id='zhenbaochufang';

INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('opt_zb_rice_normal', 'zhenbaochufang', 'mg_zb_rice_adjustment', '標準白飯 200g', 0, 1, 1, '[]', '[]', NULL, 1)
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
WHERE modifier_options.tenant_id='zhenbaochufang';

INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('opt_zb_rice_less', 'zhenbaochufang', 'mg_zb_rice_adjustment', '飯少 (白飯 100g 菜量一樣)', 0, 0, 2, '[]', '[]', NULL, 1)
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
WHERE modifier_options.tenant_id='zhenbaochufang';

INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('opt_zb_rice_none', 'zhenbaochufang', 'mg_zb_rice_adjustment', '不要白飯', 0, 0, 3, '[]', '[]', NULL, 1)
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
WHERE modifier_options.tenant_id='zhenbaochufang';

INSERT INTO item_modifier_links (tenant_id, item_id, group_id, sort_order, option_ids_json, is_disabled)
VALUES ('zhenbaochufang', 'zb_item_01', 'mg_zb_rice_adjustment', 1, NULL, 0)
ON CONFLICT(tenant_id, item_id, group_id) DO UPDATE SET
    item_id=excluded.item_id,
    group_id=excluded.group_id,
    sort_order=excluded.sort_order,
    option_ids_json=excluded.option_ids_json,
    is_disabled=excluded.is_disabled
WHERE item_modifier_links.tenant_id='zhenbaochufang';

INSERT INTO item_modifier_links (tenant_id, item_id, group_id, sort_order, option_ids_json, is_disabled)
VALUES ('zhenbaochufang', 'zb_item_02', 'mg_zb_rice_adjustment', 1, NULL, 0)
ON CONFLICT(tenant_id, item_id, group_id) DO UPDATE SET
    item_id=excluded.item_id,
    group_id=excluded.group_id,
    sort_order=excluded.sort_order,
    option_ids_json=excluded.option_ids_json,
    is_disabled=excluded.is_disabled
WHERE item_modifier_links.tenant_id='zhenbaochufang';

INSERT INTO modifier_groups (id, tenant_id, name, scope, selection_type, is_required, min_selection, max_selection, allow_repeats, included, auto_popup, sort_order, sources_json, labels_json, source_metadata_json)
VALUES ('mg_zb_addon_items', 'zhenbaochufang', '超值加購 (每個品項限一份)', 'item', 'multiple', 0, 0, 13, 0, 0, 0, 2, '[]', '{}', '{}')
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
WHERE modifier_groups.tenant_id='zhenbaochufang';

INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('opt_zb_add_01', 'zhenbaochufang', 'mg_zb_addon_items', '白飯 200g', 10, 0, 1, '[]', '[]', NULL, 1)
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
WHERE modifier_options.tenant_id='zhenbaochufang';

INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('opt_zb_add_02', 'zhenbaochufang', 'mg_zb_addon_items', '韓式雞排', 30, 0, 2, '[]', '[]', NULL, 1)
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
WHERE modifier_options.tenant_id='zhenbaochufang';

INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('opt_zb_add_03', 'zhenbaochufang', 'mg_zb_addon_items', '照燒雞肉丸 (4顆)', 30, 0, 3, '[]', '[]', NULL, 1)
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
WHERE modifier_options.tenant_id='zhenbaochufang';

INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('opt_zb_add_04', 'zhenbaochufang', 'mg_zb_addon_items', '香酥雞排', 30, 0, 4, '[]', '[]', NULL, 1)
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
WHERE modifier_options.tenant_id='zhenbaochufang';

INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('opt_zb_add_05', 'zhenbaochufang', 'mg_zb_addon_items', '燒烤棒腿 (原味)', 35, 0, 5, '[]', '[]', NULL, 1)
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
WHERE modifier_options.tenant_id='zhenbaochufang';

INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('opt_zb_add_06', 'zhenbaochufang', 'mg_zb_addon_items', '燒烤棒腿 (酥炸)', 35, 0, 6, '[]', '[]', NULL, 1)
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
WHERE modifier_options.tenant_id='zhenbaochufang';

INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('opt_zb_add_07', 'zhenbaochufang', 'mg_zb_addon_items', '脆皮雞排', 35, 0, 7, '[]', '[]', NULL, 1)
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
WHERE modifier_options.tenant_id='zhenbaochufang';

INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('opt_zb_add_08', 'zhenbaochufang', 'mg_zb_addon_items', '起司豬排', 35, 0, 8, '[]', '[]', NULL, 1)
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
WHERE modifier_options.tenant_id='zhenbaochufang';

INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('opt_zb_add_09', 'zhenbaochufang', 'mg_zb_addon_items', '無骨鹽酥雞', 35, 0, 9, '[]', '[]', NULL, 1)
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
WHERE modifier_options.tenant_id='zhenbaochufang';

INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('opt_zb_add_10', 'zhenbaochufang', 'mg_zb_addon_items', '蒲燒鯛魚', 35, 0, 10, '[]', '[]', NULL, 1)
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
WHERE modifier_options.tenant_id='zhenbaochufang';

INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('opt_zb_add_11', 'zhenbaochufang', 'mg_zb_addon_items', '熱狗 (2支)', 20, 0, 11, '[]', '[]', NULL, 1)
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
WHERE modifier_options.tenant_id='zhenbaochufang';

INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('opt_zb_add_12', 'zhenbaochufang', 'mg_zb_addon_items', '細薯', 25, 0, 12, '[]', '[]', NULL, 1)
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
WHERE modifier_options.tenant_id='zhenbaochufang';

INSERT INTO modifier_options (id, tenant_id, group_id, name, price, is_default, sort_order, sub_options_json, eligibility_rules_json, product_id, included_quantity)
VALUES ('opt_zb_add_13', 'zhenbaochufang', 'mg_zb_addon_items', '米血', 25, 0, 13, '[]', '[]', NULL, 1)
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
WHERE modifier_options.tenant_id='zhenbaochufang';

INSERT INTO item_modifier_links (tenant_id, item_id, group_id, sort_order, option_ids_json, is_disabled)
VALUES ('zhenbaochufang', 'zb_item_01', 'mg_zb_addon_items', 2, NULL, 0)
ON CONFLICT(tenant_id, item_id, group_id) DO UPDATE SET
    item_id=excluded.item_id,
    group_id=excluded.group_id,
    sort_order=excluded.sort_order,
    option_ids_json=excluded.option_ids_json,
    is_disabled=excluded.is_disabled
WHERE item_modifier_links.tenant_id='zhenbaochufang';

INSERT INTO item_modifier_links (tenant_id, item_id, group_id, sort_order, option_ids_json, is_disabled)
VALUES ('zhenbaochufang', 'zb_item_02', 'mg_zb_addon_items', 2, NULL, 0)
ON CONFLICT(tenant_id, item_id, group_id) DO UPDATE SET
    item_id=excluded.item_id,
    group_id=excluded.group_id,
    sort_order=excluded.sort_order,
    option_ids_json=excluded.option_ids_json,
    is_disabled=excluded.is_disabled
WHERE item_modifier_links.tenant_id='zhenbaochufang';

INSERT INTO menu_catalog_revisions (tenant_id,revision) VALUES ('zhenbaochufang',1) ON CONFLICT(tenant_id) DO UPDATE SET revision=revision+1;
