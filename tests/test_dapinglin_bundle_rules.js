const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== Testing Dapinglin Bundle Rules & Side Dish Selection ===\n');

// 1. Check migration 0053 file
const migrationPath = path.resolve(__dirname, '../benmi-worker-official/migrations/0053_seed_dapinglin_bundle_rules.sql');
assert.ok(fs.existsSync(migrationPath), 'Migration 0053 file must exist');
const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

const expectedCombos = [
    { id: 'hjh_combo_v7', qty: 7 },
    { id: 'hjh_combo_v11', qty: 11 },
    { id: 'hjh_combo_v15', qty: 15 },
    { id: 'hjh_combo_a', qty: 5 },
    { id: 'hjh_combo_b', qty: 6 },
    { id: 'hjh_combo_c', qty: 6 },
    { id: 'hjh_combo_d', qty: 10 },
    { id: 'hjh_combo_e', qty: 9 },
    { id: 'hjh_combo_f', qty: 6 },
    { id: 'hjh_combo_g', qty: 4 },
    { id: 'hjh_combo_h', qty: 8 },
    { id: 'hjh_combo_share_1', qty: 10 },
    { id: 'hjh_combo_share_2', qty: 12 },
    { id: 'hjh_combo_share_3', qty: 13 },
    { id: 'hjh_combo_share_4', qty: 17 },
    { id: 'hjh_combo_share_5', qty: 20 },
];

console.log('Test 1: Verify all 16 combo items are seeded in migration 0053...');
for (const combo of expectedCombos) {
    assert.ok(migrationSql.includes(`'${combo.id}'`), `Migration must include parent_item_id ${combo.id}`);
    assert.ok(migrationSql.includes(`"minQuantity":${combo.qty}`), `Combo ${combo.id} must have minQuantity=${combo.qty}`);
    assert.ok(migrationSql.includes(`"maxQuantity":${combo.qty}`), `Combo ${combo.id} must have maxQuantity=${combo.qty}`);
}
console.log('✓ Test 1 Passed: All 16 combo rules defined with exact side dish quantities');

console.log('Test 2: Verify the 4 side dish categories in sources...');
const requiredCategories = [
    'cat_hjh_veggie',    // 蔬菜類
    'cat_hjh_braised',   // 滷味類
    'cat_hjh_offal',     // 內臟類
    'cat_hjh_signature'  // 招牌菜
];
for (const catId of requiredCategories) {
    assert.ok(migrationSql.includes(catId), `Sources must include category ${catId}`);
}
console.log('✓ Test 2 Passed: Sources contain all 4 categories (蔬菜類, 滷味類, 內臟類, 招牌菜)');

console.log('Test 3: Verify client-bundle.js resolves category shortName in renderBundleCategoryTabs...');
const clientBundleJs = fs.readFileSync(path.resolve(__dirname, '../js/client-bundle.js'), 'utf-8');
assert.ok(
    clientBundleJs.includes('let cleanCatName = (cat.shortName || cat.short_name) || (cat.name || \'\')'),
    'client-bundle.js renderBundleCategoryTabs must prioritize shortName'
);
console.log('✓ Test 3 Passed: client-bundle.js prioritizes cat.shortName for clean tabs');

console.log('Test 4: Simulate category tab rendering logic...');
const mockCatalog = [
    { id: 'cat_hjh_veggie', name: '🥦 新鮮蔬菜類 (一律 $30)', shortName: '蔬菜類' },
    { id: 'cat_hjh_braised', name: '🥘 特色滷味類 (一律 $30)', shortName: '滷味類' },
    { id: 'cat_hjh_offal', name: '🍢 內臟類 (一律 $30)', shortName: '內臟類' },
    { id: 'cat_hjh_signature', name: '⭐ 獨家招牌菜 (一律 $30)', shortName: '招牌菜' }
];

const mockEligibleItems = [
    { id: 'hjh_veg_01', categoryId: 'cat_hjh_veggie' },
    { id: 'hjh_brs_01', categoryId: 'cat_hjh_braised' },
    { id: 'hjh_off_01', categoryId: 'cat_hjh_offal' },
    { id: 'hjh_sig_01', categoryId: 'cat_hjh_signature' }
];

const catMap = new Map();
catMap.set('all', { id: 'all', name: '全部' });
mockEligibleItems.forEach(it => {
    const cat = mockCatalog.find(c => c.id === it.categoryId || c.slug === it.categoryId);
    if (cat && !catMap.has(cat.id)) {
        let cleanCatName = (cat.shortName || cat.short_name) || (cat.name || '')
            .replace(/\s*\(一律.*?\)/g, '')
            .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
            .trim();
        catMap.set(cat.id, { id: cat.id, name: cleanCatName });
    }
});

const renderedTabNames = Array.from(catMap.values()).map(c => c.name);
assert.deepStrictEqual(renderedTabNames, ['全部', '蔬菜類', '滷味類', '內臟類', '招牌菜']);
console.log('✓ Test 4 Passed: Rendered tabs are exactly:', renderedTabNames.join(' | '));

console.log('\n✅ All tests passed successfully!');
