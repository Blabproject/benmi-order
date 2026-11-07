const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function runTests() {
    console.log('====================================================');
    console.log('🧪 Testing Rust WebAssembly Pricing Engine (WASM)');
    console.log('====================================================\n');

    // 1. Dynamic import of the WebAssembly module
    console.log('1. Loading WebAssembly module...');
    const wasmModule = await import('../wasm/pricing-engine/pricing_wasm.js');
    const wasmBytes = fs.readFileSync(path.resolve(__dirname, '../wasm/pricing-engine/pricing_wasm_bg.wasm'));
    await wasmModule.default(wasmBytes);

    assert.strictEqual(wasmModule.is_wasm_ready(), true, 'WASM engine must report ready');
    console.log('  ✓ WebAssembly binary loaded and initialized successfully\n');

    // 2. Test calculate_category_bundle
    console.log('2. Testing calculate_category_bundle in Rust WASM...');
    {
        // Case A: Below threshold (no discount)
        const rule = { bundle_qty: 3, bundle_price: 100 };
        const items = [{ price: 40, qty: 2 }];
        const res = wasmModule.calculate_category_bundle(rule, items);
        assert.strictEqual(res.regularTotal, 80);
        assert.strictEqual(res.categoryTotal, 80);
        assert.strictEqual(res.discountAmount, 0);
        assert.strictEqual(res.bundleCount, 0);
        assert.strictEqual(res.remainderCount, 2);
        console.log('  ✓ Case A: Below bundle threshold correctly returns 0 discount');
    }
    {
        // Case B: Exactly 1 bundle + remainder (highest price priority)
        const rule = { bundle_qty: 2, bundle_price: 90 };
        const items = [
            { price: 60, qty: 1 },
            { price: 50, qty: 2 }
        ];
        // Total 3 items: $60, $50, $50 -> Regular total = 160
        // Best 2 items for bundle: $60 + $50 = $110 -> bundled for $90 (saves $20)
        // Remainder: 1 item at $50
        // Final categoryTotal: 90 + 50 = 140, discount = 20
        const res = wasmModule.calculate_category_bundle(rule, items);
        assert.strictEqual(res.regularTotal, 160);
        assert.strictEqual(res.categoryTotal, 140);
        assert.strictEqual(res.discountAmount, 20);
        assert.strictEqual(res.bundleCount, 1);
        assert.strictEqual(res.remainderCount, 1);
        console.log('  ✓ Case B: Bundle priority (highest price first) correctly calculates $20 discount');
    }
    {
        // Case C: Multiple bundles
        const rule = { bundle_qty: 2, bundle_price: 80 };
        const items = [{ price: 50, qty: 4 }];
        // Regular total = 200
        // 2 bundles: 2 * 80 = 160, discount = 40
        const res = wasmModule.calculate_category_bundle(rule, items);
        assert.strictEqual(res.regularTotal, 200);
        assert.strictEqual(res.categoryTotal, 160);
        assert.strictEqual(res.discountAmount, 40);
        assert.strictEqual(res.bundleCount, 2);
        assert.strictEqual(res.remainderCount, 0);
        console.log('  ✓ Case C: Multiple bundles correctly calculates $40 discount\n');
    }

    // 3. Test calculate_round_total
    console.log('3. Testing calculate_round_total (Full Round & Catalog Calculation)...');
    {
        const catalog = {
            products: [
                { id: 'item_a', name: 'Item A', price: 60, categoryId: 'cat_main' },
                { id: 'item_b', name: 'Item B', price: 50, categoryId: 'cat_main' }
            ],
            categories: [
                { id: 'cat_main', name: 'Main Category', pricingRules: { bundle_qty: 2, bundle_price: 90 } }
            ],
            groups: [],
            links: [],
            categoryLinks: []
        };

        const roundInput = {
            items: [
                { itemId: 'item_a', quantity: 1 },
                { itemId: 'item_b', quantity: 1 }
            ]
        };

        const res = wasmModule.calculate_round_total(catalog, roundInput);
        assert.strictEqual(res.total, 90, 'Total should be $90 after bundle discount');
        assert.strictEqual(res.discount, 20, 'Discount should be $20');
        assert.strictEqual(res.items.length, 2, 'Should contain 2 detail lines');
        console.log('  ✓ Full round calculated correctly with bundle discount: $90 (saved $20)\n');
    }

    // 4. Test client-cart.js integration with window.PricingWasm mock
    console.log('4. Testing client-cart.js calculateCategoryBundleSubtotal delegation...');
    {
        const vm = require('vm');
        const cartCode = fs.readFileSync(path.resolve(__dirname, '../js/client-cart.js'), 'utf8');

        // Create window environment with PricingWasm attached
        const sandbox = {
            window: {
                PricingWasm: {
                    isReady: true,
                    calculateCategoryBundle: wasmModule.calculate_category_bundle
                }
            },
            document: {
                addEventListener: () => {},
                removeEventListener: () => {},
                querySelectorAll: () => [],
                getElementById: () => null
            },
            console: { warn: () => {}, info: () => {}, log: () => {} }
        };
        sandbox.window.document = sandbox.document;
        vm.createContext(sandbox);
        vm.runInContext(cartCode, sandbox);

        const rule = { bundle_qty: 2, bundle_price: 90 };
        const items = [{ price: 50, qty: 3 }];
        const res = sandbox.calculateCategoryBundleSubtotal(rule, items);

        assert.strictEqual(res.categoryTotal, 140, 'Should delegate to WASM and return 140');
        assert.strictEqual(res.discountAmount, 10, 'Should delegate to WASM and return 10 discount');
        console.log('  ✓ client-cart.js calculateCategoryBundleSubtotal successfully routed through Rust WASM!\n');
    }

    // 5. Test PricingWasm.calculateCart() high-level helper
    console.log('5. Testing PricingWasm.calculateCart() high-level helper...');
    {
        const vm = require('vm');
        const wasmClientCode = fs.readFileSync(path.resolve(__dirname, '../js/client-pricing-wasm.js'), 'utf8');

        const sandbox = {
            window: {},
            document: {
                querySelectorAll: () => [],
                getElementById: () => null
            },
            console: { warn: () => {}, info: () => {}, log: () => {} }
        };
        sandbox.window.document = sandbox.document;
        vm.createContext(sandbox);
        vm.runInContext(wasmClientCode, sandbox);

        const PricingWasm = sandbox.window.PricingWasm;
        assert.ok(PricingWasm, 'PricingWasm must exist');
        assert.strictEqual(typeof PricingWasm.calculateCart, 'function');
        assert.strictEqual(typeof PricingWasm.buildOptionCatalog, 'function');

        // Attach native WASM functions to simulate ready state
        PricingWasm.isReady = true;
        PricingWasm.calculateRoundTotal = wasmModule.calculate_round_total;
        PricingWasm.calculateCategoryBundle = wasmModule.calculate_category_bundle;

        const sampleBootstrap = {
            catalog: [
                {
                    id: 'cat_bread',
                    slug: 'banh-mi',
                    name: '招牌越式麵包',
                    pricingRules: { bundle_qty: 2, bundle_price: 150 },
                    items: [
                        {
                            id: 'item_bm_special',
                            name: '傳統越式麵包',
                            price: 80,
                            isOutOfStock: false,
                            bundleRule: {
                                version: 3,
                                groups: [
                                    {
                                        id: 'group_toppings',
                                        name: '加料選擇',
                                        minQuantity: 0,
                                        maxQuantity: 5,
                                        allowRepeats: false,
                                        eligibleItems: [
                                            { id: 'opt_cheese', name: '加起司', price: 15 },
                                            { id: 'opt_ham', name: '加火腿', price: 20 }
                                        ]
                                    }
                                ]
                            }
                        }
                    ]
                }
            ],
            customizations: [
                {
                    id: 'group_addon',
                    key: 'addon',
                    title: '加購項目',
                    type: 'radio',
                    options: [
                        { id: 'opt_none', name: '不需要', price: 0 },
                        { id: 'opt_soup', name: '越式牛肉湯', price: 50, minOrderSubtotal: 100 }
                    ]
                }
            ]
        };

        // Case A: Empty cart
        const emptyRes = PricingWasm.calculateCart({ bootstrapData: sampleBootstrap, cart: {} });
        assert.strictEqual(emptyRes.total, 0);
        assert.strictEqual(emptyRes.subtotal, 0);
        console.log('  ✓ Case A: Empty cart returns 0');

        // Case B: 1x item without options
        const singleRes = PricingWasm.calculateCart({
            bootstrapData: sampleBootstrap,
            cart: { 'banh-mi_傳統越式麵包': 1 }
        });
        assert.strictEqual(singleRes.total, 80);
        assert.strictEqual(singleRes.subtotal, 80);
        assert.strictEqual(singleRes.lineTotals['banh-mi_傳統越式麵包'], 80);
        console.log('  ✓ Case B: 1x item without options returns $80');

        // Case C: Combo bundle (2 for 150) + cheese (+15) + order soup (+50)
        const comboRes = PricingWasm.calculateCart({
            bootstrapData: sampleBootstrap,
            cart: { 'banh-mi_傳統越式麵包': 2 },
            bundleCartData: {
                'banh-mi_傳統越式麵包': [
                    {
                        groups: [
                            {
                                groupId: 'group_toppings',
                                items: [{ optionId: 'opt_cheese', quantity: 1 }]
                            }
                        ]
                    }
                ]
            },
            orderSelections: [
                {
                    groupId: 'group_addon',
                    items: [{ optionId: 'opt_soup', quantity: 1 }]
                }
            ]
        });
        // 2x 80 = 160 + 15 (cheese) = 175 subtotal
        // Bundle discount: 10 (2 for 150)
        // Merchandise subtotal: 165 >= 100 -> soup eligible (+50)
        // Total = 175 - 10 + 50 = 215
        assert.strictEqual(comboRes.subtotal, 175);
        assert.strictEqual(comboRes.discount, 10);
        assert.strictEqual(comboRes.orderExtra, 50);
        assert.strictEqual(comboRes.total, 215);
        assert.strictEqual(comboRes.lineTotals['banh-mi_傳統越式麵包'], 175);
        console.log('  ✓ Case C: Combo bundle + topping + order addon returns exact $215 (discount $10)\n');
    }

    // 6. Test client-cart.js calculateCurrentFoodSubtotal and updateTotal with WASM active
    console.log('6. Testing client-cart.js calculateCurrentFoodSubtotal and updateTotal with WASM active...');
    {
        const vm = require('vm');
        const wasmClientCode = fs.readFileSync(path.resolve(__dirname, '../js/client-pricing-wasm.js'), 'utf8');
        const cartCode = fs.readFileSync(path.resolve(__dirname, '../js/client-cart.js'), 'utf8');

        const domElements = {};
        function getEl(id) {
            if (!domElements[id]) {
                domElements[id] = { id, innerText: '', innerHTML: '', style: {} };
            }
            return domElements[id];
        }

        const sandbox = {
            window: {},
            document: {
                getElementById: getEl,
                querySelectorAll: () => [],
                querySelector: () => null,
                addEventListener: () => {},
                removeEventListener: () => {}
            },
            console: { warn: () => {}, info: () => {}, log: () => {} }
        };
        sandbox.window = sandbox;
        sandbox.window.document = sandbox.document;

        vm.createContext(sandbox);
        vm.runInContext(wasmClientCode, sandbox);
        vm.runInContext(cartCode, sandbox);

        // Inject wasm bindings
        sandbox.window.PricingWasm.isReady = true;
        sandbox.window.PricingWasm.calculateRoundTotal = wasmModule.calculate_round_total;
        sandbox.window.PricingWasm.calculateCategoryBundle = wasmModule.calculate_category_bundle;

        const sampleBootstrap = {
            catalog: [
                {
                    id: 'cat_bread',
                    slug: 'banh-mi',
                    name: '招牌越式麵包',
                    pricingRules: { bundle_qty: 2, bundle_price: 150 },
                    items: [
                        { id: 'item_bm_special', name: '傳統越式麵包', price: 80, isOutOfStock: false }
                    ]
                }
            ]
        };

        sandbox.window.bootstrapData = sampleBootstrap;
        sandbox.window.cart = { 'banh-mi_傳統越式麵包': 2 };

        // Test calculateCurrentFoodSubtotal via WASM: 2x 80 = 160, discount 10 -> subtotal = 150
        const subtotal = sandbox.window.calculateCurrentFoodSubtotal();
        assert.strictEqual(subtotal, 150, `Subtotal must be 150 after bundle discount, got ${subtotal}`);
        console.log('  ✓ calculateCurrentFoodSubtotal correctly returned $150 via Rust WASM');

        // Test updateTotal via WASM:
        const total = sandbox.window.updateTotal();
        assert.strictEqual(total, 150, `updateTotal must be 150, got ${total}`);
        assert.strictEqual(domElements['total-price'].innerText, 150);
        console.log('  ✓ updateTotal correctly assigned #total-price = $150 via Rust WASM\n');
    }

    console.log('====================================================');
    console.log('🎉 ALL RUST WASM PRICING TESTS PASSED (100%)');
    console.log('====================================================');
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
