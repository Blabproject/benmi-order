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

    console.log('====================================================');
    console.log('🎉 ALL RUST WASM PRICING TESTS PASSED (100%)');
    console.log('====================================================');
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
