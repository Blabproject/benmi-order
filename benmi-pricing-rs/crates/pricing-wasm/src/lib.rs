use wasm_bindgen::prelude::*;
use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundleRuleInput {
    #[serde(alias = "bundle_qty")]
    bundle_qty: Option<usize>,
    #[serde(alias = "bundle_price")]
    bundle_price: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct BundleItemInput {
    price: f64,
    qty: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BundleResultOutput {
    category_total: f64,
    regular_total: f64,
    discount_amount: f64,
    bundle_count: usize,
    remainder_count: usize,
}

#[wasm_bindgen]
pub fn is_wasm_ready() -> bool {
    true
}

#[wasm_bindgen]
pub fn calculate_category_bundle(rule_val: JsValue, items_val: JsValue) -> Result<JsValue, JsValue> {
    let rule: Option<BundleRuleInput> = if rule_val.is_null() || rule_val.is_undefined() {
        None
    } else {
        serde_wasm_bindgen::from_value(rule_val).map_err(|e| JsValue::from_str(&e.to_string()))?
    };

    let items: Vec<BundleItemInput> = if items_val.is_null() || items_val.is_undefined() {
        Vec::new()
    } else {
        serde_wasm_bindgen::from_value(items_val).map_err(|e| JsValue::from_str(&e.to_string()))?
    };

    let mut regular_total_dec = Decimal::ZERO;
    let mut total_qty: usize = 0;
    let mut flattened_prices: Vec<Decimal> = Vec::new();

    for it in &items {
        let p = Decimal::from_str_exact(&it.price.to_string()).unwrap_or(Decimal::ZERO);
        let q = it.qty;
        regular_total_dec += p * Decimal::from(q);
        total_qty += q;
        for _ in 0..q {
            flattened_prices.push(p);
        }
    }

    let b_qty = rule.as_ref().and_then(|r| r.bundle_qty).unwrap_or(0);
    let b_price_opt = rule
        .as_ref()
        .and_then(|r| r.bundle_price)
        .and_then(|bp| Decimal::from_str_exact(&bp.to_string()).ok());

    if b_qty == 0 || b_price_opt.is_none() || total_qty < b_qty {
        let res = BundleResultOutput {
            category_total: regular_total_dec.to_f64().unwrap_or(0.0),
            regular_total: regular_total_dec.to_f64().unwrap_or(0.0),
            discount_amount: 0.0,
            bundle_count: 0,
            remainder_count: total_qty,
        };
        return serde_wasm_bindgen::to_value(&res).map_err(|e| JsValue::from_str(&e.to_string()));
    }

    let b_price = b_price_opt.unwrap();
    let bundle_count = total_qty / b_qty;
    let remainder_count = total_qty % b_qty;

    flattened_prices.sort_by(|a, b| b.cmp(a));

    let mut cat_total_dec = Decimal::from(bundle_count) * b_price;
    let remainder_prices = &flattened_prices[(bundle_count * b_qty)..];
    let remainder_sum: Decimal = remainder_prices.iter().copied().sum();
    cat_total_dec += remainder_sum;

    let discount_dec = if regular_total_dec > cat_total_dec {
        regular_total_dec - cat_total_dec
    } else {
        Decimal::ZERO
    };

    let res = BundleResultOutput {
        category_total: cat_total_dec.to_f64().unwrap_or(0.0),
        regular_total: regular_total_dec.to_f64().unwrap_or(0.0),
        discount_amount: discount_dec.to_f64().unwrap_or(0.0),
        bundle_count,
        remainder_count,
    };

    serde_wasm_bindgen::to_value(&res).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn calculate_round_total(
    catalog_val: JsValue,
    round_input_val: JsValue,
    round_number_val: Option<u32>,
    now_ms_val: Option<f64>,
) -> Result<JsValue, JsValue> {
    let catalog: pricing_core::OptionCatalog = serde_wasm_bindgen::from_value(catalog_val)
        .map_err(|e| JsValue::from_str(&format!("Invalid catalog: {e}")))?;

    let round_input: pricing_core::BuildRoundInput = serde_wasm_bindgen::from_value(round_input_val)
        .map_err(|e| JsValue::from_str(&format!("Invalid round input: {e}")))?;

    let round_number = round_number_val.unwrap_or(1);
    let now_ms = now_ms_val
        .map(|n| n as i64)
        .unwrap_or_else(|| js_sys::Date::now() as i64);

    match pricing_core::build_detail_round(&catalog, &round_input, round_number, None, now_ms) {
        Ok(round) => {
            serde_wasm_bindgen::to_value(&round)
                .map_err(|e| JsValue::from_str(&format!("Serialization error: {e}")))
        }
        Err(err) => {
            Err(JsValue::from_str(&format!("BUILD_ROUND_ERROR: {}", err.code())))
        }
    }
}

#[wasm_bindgen]
pub fn validate_unified_cart(
    catalog_val: JsValue,
    items_val: JsValue,
    now_ms_val: Option<f64>,
) -> Result<JsValue, JsValue> {
    let catalog: pricing_core::OptionCatalog = serde_wasm_bindgen::from_value(catalog_val)
        .map_err(|e| JsValue::from_str(&format!("Invalid catalog: {e}")))?;

    let items: Vec<serde_json::Value> = serde_wasm_bindgen::from_value(items_val)
        .map_err(|e| JsValue::from_str(&format!("Invalid items: {e}")))?;

    let now_ms = now_ms_val
        .map(|n| n as i64)
        .unwrap_or_else(|| js_sys::Date::now() as i64);

    let res = pricing_core::validate_unified_order_items(&catalog, &items, now_ms);
    serde_wasm_bindgen::to_value(&res).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OptionSelectionOutput {
    groups: Vec<pricing_core::DetailGroup>,
    extra: f64,
}

#[wasm_bindgen]
pub fn validate_option_selection(
    catalog_val: JsValue,
    product_id: String,
    selections_val: JsValue,
    merchandise_subtotal_val: Option<f64>,
    now_ms_val: Option<f64>,
) -> Result<JsValue, JsValue> {
    let catalog: pricing_core::OptionCatalog = serde_wasm_bindgen::from_value(catalog_val)
        .map_err(|e| JsValue::from_str(&format!("Invalid catalog: {e}")))?;

    let selections: Vec<pricing_core::validator::SelectedGroupInput> = serde_wasm_bindgen::from_value(selections_val)
        .map_err(|e| JsValue::from_str(&format!("Invalid selections: {e}")))?;

    let merchandise_subtotal = merchandise_subtotal_val
        .and_then(|v| Decimal::from_str_exact(&v.to_string()).ok())
        .unwrap_or(Decimal::MAX);

    let now_ms = now_ms_val
        .map(|n| n as i64)
        .unwrap_or_else(|| js_sys::Date::now() as i64);

    match pricing_core::validate_option_selection(&catalog, &product_id, &selections, &[], merchandise_subtotal, now_ms) {
        Ok(res) => {
            let out = OptionSelectionOutput {
                groups: res.groups,
                extra: res.extra.to_f64().unwrap_or(0.0),
            };
            serde_wasm_bindgen::to_value(&out)
                .map_err(|e| JsValue::from_str(&format!("Serialization error: {e}")))
        }
        Err(err) => {
            Err(JsValue::from_str(&format!("OPTION_SELECTION_ERROR: {}", err.code())))
        }
    }
}
