const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function run() {
    console.log('🧪 Testing calculatePortionPrice in PricingWasm...\n');

    // 1. Load WASM module
    const wasmModule = await import('../wasm/pricing-engine/pricing_wasm.js');
    const wasmBytes = fs.readFileSync(path.resolve(__dirname, '../wasm/pricing-engine/pricing_wasm_bg.wasm'));
    await wasmModule.default(wasmBytes);
    assert.strictEqual(wasmModule.is_wasm_ready(), true);

    // 2. Setup mock environment & sample bootstrap data
    const sampleBootstrap = {
        revision: 1,
        catalog: [
            {
                id: 'cat_food',
                slug: 'food',
                name: 'Món ăn',
                items: [
                    {
                        id: 'item_noodles',
                        name: 'Mì Trộn Xá Xíu',
                        price: 90
                    },
                    {
                        id: 'item_combo',
                        name: 'Combo Ăn Trưa',
                        price: 150,
                        bundleRule: {
                            groups: [
                                {
                                    id: 'grp_main',
                                    name: 'Chọn món chính',
                                    minQuantity: 1,
                                    maxQuantity: 1,
                                    eligibleItems: [
                                        { id: 'opt_chicken', name: 'Cơm Gà Giòn', price: 0 },
                                        { id: 'opt_beef', name: 'Cơm Bò Nướng', price: 20 }
                                    ]
                                },
                                {
                                    id: 'grp_drink',
                                    name: 'Chọn nước',
                                    minQuantity: 1,
                                    maxQuantity: 1,
                                    eligibleItems: [
                                        { id: 'opt_tea', name: 'Trà tắc', price: 0 },
                                        { id: 'opt_milktea', name: 'Trà sữa trân châu', price: 15 }
                                    ]
                                }
                            ]
                        }
                    }
                ]
            }
        ],
        modifiers: [
            {
                id: 'mod_spicy',
                slug: 'spiciness',
                name: 'Độ cay',
                selectionType: 'single',
                isRequired: true,
                options: [
                    { id: 'opt_no_spicy', name: 'Không cay', price: 0, isDefault: true },
                    { id: 'opt_extra_spicy', name: 'Cay nhiều', price: 5 }
                ]
            },
            {
                id: 'mod_topping',
                slug: 'topping',
                name: 'Topping thêm',
                selectionType: 'multiple',
                isRequired: false,
                options: [
                    {
                        id: 'opt_egg',
                        name: 'Trứng lòng đào',
                        price: 15,
                        sub_options: [
                            { id: 'sub_soft', name: 'Lòng đào mềm', price: 0 },
                            { id: 'sub_hard', name: 'Chín kỹ', price: 0 }
                        ]
                    },
                    {
                        id: 'opt_pork',
                        name: 'Thịt xá xíu thêm',
                        price: 30,
                        sub_options: [
                            { id: 'sub_reg', name: 'Thịt nạc', price: 0 },
                            { id: 'sub_fat', name: 'Nhiều mỡ', price: 5 }
                        ]
                    }
                ]
            }
        ]
    };

    // 3. Test normalizePortionGroups & calculatePortionPrice in sandbox
    const vm = require('vm');
    const wasmClientCode = fs.readFileSync(path.resolve(__dirname, '../js/client-pricing-wasm.js'), 'utf8');
    const sandbox = {
        window: { bootstrapData: sampleBootstrap },
        process: { versions: {} },
        WebAssembly: {},
        console: console
    };
    vm.createContext(sandbox);
    vm.runInContext(wasmClientCode, sandbox);

    const PricingWasm = sandbox.window.PricingWasm;
    PricingWasm.isReady = true;
    PricingWasm.calculateRoundTotal = wasmModule.calculate_round_total;
    PricingWasm.calculateCategoryBundle = wasmModule.calculate_category_bundle;
    PricingWasm.validateOptionSelection = wasmModule.validate_option_selection;

    // Test Case 1: Single item draft with default option (no extra)
    {
        const draft = {
            single: { 'spiciness': 'Không cay' },
            multiple: {}
        };
        const res = PricingWasm.calculatePortionPrice('food_Mì Trộn Xá Xíu', draft);
        assert.ok(res, 'Must return result');
        assert.strictEqual(res.basePrice, 90);
        assert.strictEqual(res.extra, 0);
        assert.strictEqual(res.subtotal, 90);
        assert.strictEqual(PricingWasm.calculatePortionExtra('food_Mì Trộn Xá Xíu', draft), 0);
        console.log('  ✓ Case 1: Default option returns $90 (extra = $0)');
    }

    // Test Case 2: Single item draft with Cay nhiều (+5) and Trứng lòng đào (+15)
    {
        const draft = {
            single: { 'spiciness': 'Cay nhiều' },
            multiple: { 'Trứng lòng đào': true }
        };
        const res = PricingWasm.calculatePortionPrice('food_Mì Trộn Xá Xíu', draft);
        assert.ok(res);
        assert.strictEqual(res.basePrice, 90);
        assert.strictEqual(res.extra, 20); // 5 + 15
        assert.strictEqual(res.subtotal, 110);
        assert.strictEqual(PricingWasm.calculatePortionExtra('food_Mì Trộn Xá Xíu', draft), 20);
        console.log('  ✓ Case 2: Cay nhiều (+5) + Trứng lòng đào (+15) returns $110 (extra = $20)');
    }

    // Test Case 3: Single item with subOption (Thịt xá xíu +30, Nhiều mỡ +5)
    {
        const draft = {
            single: { 'spiciness': 'Không cay' },
            multiple: { 'Thịt xá xíu thêm': true },
            subOptions: {
                'opt_pork': { id: 'sub_fat', name: 'Nhiều mỡ', price: 5 }
            }
        };
        const res = PricingWasm.calculatePortionPrice('food_Mì Trộn Xá Xíu', draft);
        assert.ok(res);
        assert.strictEqual(res.basePrice, 90);
        assert.strictEqual(res.extra, 35); // 0 + 30 + 5
        assert.strictEqual(res.subtotal, 125);
        console.log('  ✓ Case 3: SubOption Nhiều mỡ (+5) included with Thịt xá xíu (+30) returns $125 (extra = $35)');
    }

    // Test Case 4: Single item with Unified Option Groups selectedDetails
    {
        const draft = {
            selectedDetails: {
                'opt_extra_spicy': { id: 'opt_extra_spicy', name: 'Cay nhiều', price: 5, groupId: 'mod_spicy' },
                'opt_egg': { id: 'opt_egg', name: 'Trứng lòng đào', price: 15, groupId: 'mod_topping' }
            }
        };
        const res = PricingWasm.calculatePortionPrice('item_noodles', draft);
        assert.ok(res);
        assert.strictEqual(res.basePrice, 90);
        assert.strictEqual(res.extra, 20);
        assert.strictEqual(res.subtotal, 110);
        console.log('  ✓ Case 4: Unified Option Groups selectedDetails returns $110 (extra = $20)');
    }

    // Test Case 5: Combo bundle portion (Cơm Bò Nướng +20, Trà sữa trân châu +15)
    {
        const portion = {
            groups: [
                {
                    groupId: 'grp_main',
                    items: [{ optionId: 'opt_beef', quantity: 1 }]
                },
                {
                    groupId: 'grp_drink',
                    items: [{ optionId: 'opt_milktea', quantity: 1 }]
                }
            ]
        };
        const res = PricingWasm.calculatePortionPrice('item_combo', portion);
        assert.ok(res);
        assert.strictEqual(res.basePrice, 150);
        assert.strictEqual(res.extra, 35); // 20 + 15
        assert.strictEqual(res.subtotal, 185);
        console.log('  ✓ Case 5: Combo bundle portion returns $185 (extra = $35)');
    }

    console.log('\n🎉 ALL 5 calculatePortionPrice test cases passed 100%!');
}

run().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
