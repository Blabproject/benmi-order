// One menu gate shared by developer machines and CI. No suite may silently skip.
export const menuSuites = [
  ['menu-static-contracts', ['--test', ...[
    'menu_sort_button_visibility', 'menu_dirty_detection', 'menu_model', 'modifier_option_name_collision',
    'menu_workspace', 'item_modifier_workspace', 'menu_display_scale',
    'category_linked_products_picker', 'pos_tab_persistence',
    'unified_option_groups', 'unified_option_cutover', 'unified_menu_drawer', 'unified_menu_sections',
    'menu_global_group_order', 'customer_option_presentations', 'option_surcharge_cart',
    'real_tenants_parity', 'pos_option_groups_contract', 'new_menu_deep_verification',
    'new_menu_customer_e2e', 'new_menu_category_inheritance', 'new_menu_pos_lifecycle',
    'order_detail_snapshots', 'order_detail_groups',
  ].map(name => `tests/test_${name}.cjs`)]],
  ['menu-compatibility', ['--test', 'scripts/test-menu-safety.cjs', 'scripts/test-modifier-library.cjs',
    'tests/test_menu_compatibility_regression.cjs', 'tests/test_cluster1_category_item_modifiers.cjs',
    'tests/test_cluster2_combo_bundle_rules.cjs', 'tests/test_cluster3_4_5_full_schema_cutover.cjs']],
  ...['chromium', 'webkit'].map(browser => [`menu-components-${browser}`, ['--test', ...[
    'customer_option_steps', 'customer_option_images', 'customer_option_children',
    'required_option_popup', 'combo_price_recovery', 'order_detail_groups', 'stock_drawer',
  ].map(name => `tests/test_${name}_browser.cjs`)], { MENU_QA_BROWSER: browser }]),
  ['menu-runtime', ['--test', 'tests/menu-qa/runtime.test.mjs']],
  ...['chromium', 'webkit'].map(browser => [`menu-full-pages-${browser}`,
    ['--test', 'tests/menu-qa/full-pages.test.mjs'], { MENU_QA_BROWSER: browser }]),
];

export function testOutcome(result, log, nodeTest = false) {
  if (result.status !== 0 || result.error) return 'failed';
  // TAP is mandatory for node:test suites; no tests, skipped and todo are not success.
  if (nodeTest && (!/^# tests [1-9]\d*$/m.test(log) || !/^# skipped 0$/m.test(log) || !/^# todo 0$/m.test(log))) return 'failed';
  return 'passed';
}
