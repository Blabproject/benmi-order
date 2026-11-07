/**
 * Benmi Rust WebAssembly Pricing Engine Client
 * 
 * Provides high-performance, edge-identical pricing calculations in the browser.
 * Falls back transparently to JavaScript calculation functions if WebAssembly
 * is unsupported, loading, or encounters an unexpected input.
 */

(function () {
    const isNode = typeof window === 'undefined' || (typeof process !== 'undefined' && Boolean(process.versions?.node));
    const hasWasm = typeof WebAssembly !== 'undefined';

    window.PricingWasm = {
        isReady: false,
        readyPromise: null,
        calculateCategoryBundle: null,
        calculateRoundTotal: null,
        validateUnifiedCart: null,
        validateOptionSelection: null
    };

    if (isNode || !hasWasm) {
        return;
    }

    const WASM_JS_PATH = '/wasm/pricing-engine/pricing_wasm.js?v=20261108_wasm_pricing_v1';
    const WASM_BG_PATH = '/wasm/pricing-engine/pricing_wasm_bg.wasm?v=20261108_wasm_pricing_v1';

    window.PricingWasm.readyPromise = (async function initWasmEngine() {
        try {
            const wasmModule = await import(WASM_JS_PATH);
            await wasmModule.default(WASM_BG_PATH);

            if (typeof wasmModule.is_wasm_ready === 'function' && wasmModule.is_wasm_ready()) {
                window.PricingWasm.isReady = true;
                window.PricingWasm.calculateCategoryBundle = wasmModule.calculate_category_bundle;
                window.PricingWasm.calculateRoundTotal = wasmModule.calculate_round_total;
                window.PricingWasm.validateUnifiedCart = wasmModule.validate_unified_cart;
                window.PricingWasm.validateOptionSelection = wasmModule.validate_option_selection;

                console.info('[PricingWasm] Rust WebAssembly pricing engine initialized successfully.');

                if (typeof updateTotal === 'function') {
                    updateTotal();
                }
                return true;
            }
        } catch (err) {
            console.warn('[PricingWasm] WASM initialization failed, falling back to JS:', err);
            window.PricingWasm.isReady = false;
            return false;
        }
    })();
})();
