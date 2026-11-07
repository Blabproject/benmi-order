use crate::graph::effective_groups;
use crate::types::*;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionItemInput {
    #[serde(default)]
    pub option_id: Option<String>,
    #[serde(default)]
    pub item_id: Option<String>,
    pub quantity: u32,
    #[serde(default)]
    pub groups: Vec<SelectedGroupInput>,
    #[serde(default)]
    pub sub_options: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedGroupInput {
    pub group_id: String,
    #[serde(default)]
    pub items: Vec<SelectionItemInput>,
}

pub struct ValidatedOptionResult {
    pub groups: Vec<DetailGroup>,
    pub extra: Decimal,
}

fn is_valid_qty(q: u32, min: u32) -> bool {
    q >= min && q <= 999
}

fn sub_value_key(v: &serde_json::Value) -> String {
    if let Some(s) = v.as_str() {
        s.to_string()
    } else if let Some(obj) = v.as_object() {
        obj.get("id")
            .and_then(|x| x.as_str())
            .or_else(|| obj.get("productId").and_then(|x| x.as_str()))
            .or_else(|| obj.get("name").and_then(|x| x.as_str()))
            .unwrap_or("")
            .to_string()
    } else {
        String::new()
    }
}

pub fn validate_option_selection(
    catalog: &OptionCatalog,
    product_id: &str,
    selections: &[SelectedGroupInput],
    path: &[String],
    merchandise_subtotal: Decimal,
    now_ms: i64,
) -> Result<ValidatedOptionResult, DetailError> {
    if path.contains(&product_id.to_string()) || path.len() > 12 {
        return Err(DetailError::new("OPTION_PRODUCT_CYCLE"));
    }

    let product = catalog.products.iter().find(|p| p.id == product_id);
    if product.is_none() || product.unwrap().is_oos(now_ms) {
        return Err(DetailError::new("PRODUCT_UNAVAILABLE"));
    }

    let groups = effective_groups(catalog, product_id, now_ms)?;
    let mut selected_group_ids = HashSet::new();
    for s in selections {
        selected_group_ids.insert(&s.group_id);
    }
    if selections.len() != groups.len() || selected_group_ids.len() != groups.len() {
        return Err(DetailError::new("OPTION_GROUPS_REQUIRED"));
    }

    let mut total_extra = Decimal::ZERO;
    let mut snapshot_groups = Vec::new();

    for group in &groups {
        let legacy_group_id = group.metadata.as_ref()
            .and_then(|m| m.get("legacyGroupId"))
            .and_then(|v| v.as_str());

        let selected = selections.iter().find(|s| {
            s.group_id == group.id || legacy_group_id.map(|leg| s.group_id == leg).unwrap_or(false)
        });

        let selected = match selected {
            Some(s) => s,
            None => return Err(DetailError::new("OPTION_GROUPS_REQUIRED")),
        };

        let count: u32 = selected.items.iter().map(|s| s.quantity).sum();
        let fixed_count: u32 = group.options.iter().map(|o| o.quantity).sum();

        let (min_req, max_req) = if group.included {
            (fixed_count, fixed_count)
        } else {
            (group.min_selection, group.max_selection)
        };

        if !is_valid_qty(count, 0) || count < min_req || count > max_req {
            return Err(DetailError::new("OPTION_QUANTITY"));
        }

        let mut seen: HashMap<String, u32> = HashMap::new();
        let mut detail_choices = Vec::new();

        for s in &selected.items {
            let opt_id_target = s.option_id.as_deref().or(s.item_id.as_deref());
            let option = group.options.iter().find(|o| {
                if let Some(target) = opt_id_target {
                    if o.id == target {
                        return true;
                    }
                    if let Some(pid) = &o.product_id {
                        if pid == target {
                            return true;
                        }
                    }
                }
                false
            });

            let option = match option {
                Some(o) => o,
                None => return Err(DetailError::new("OPTION_UNAVAILABLE")),
            };

            if option.is_out_of_stock || !is_valid_qty(s.quantity, 1) {
                return Err(DetailError::new("OPTION_UNAVAILABLE"));
            }

            for r in &option.eligibility_rules {
                if let Some(min_sub) = r.min_order_subtotal {
                    if min_sub > merchandise_subtotal {
                        return Err(DetailError::new("MIN_ORDER_SUBTOTAL_NOT_MET"));
                    }
                }
            }

            let qty = s.quantity;
            let seen_qty = seen.entry(option.id.clone()).or_insert(0);
            *seen_qty += qty;
            let current_total = *seen_qty;

            if (!group.allow_repeats && !group.included && current_total > 1)
                || (group.included && current_total > option.quantity)
            {
                return Err(DetailError::new("OPTION_REPEAT"));
            }

            let child = if let Some(pid) = &option.product_id {
                let mut next_path = path.to_vec();
                next_path.push(product_id.to_string());
                validate_option_selection(
                    catalog,
                    pid,
                    &s.groups,
                    &next_path,
                    merchandise_subtotal,
                    now_ms,
                )?
            } else {
                ValidatedOptionResult {
                    groups: Vec::new(),
                    extra: Decimal::ZERO,
                }
            };

            // Sub options
            let mut seen_sub_keys = HashSet::new();
            for sub_val in &s.sub_options {
                let k = sub_value_key(sub_val);
                if !seen_sub_keys.insert(k) {
                    return Err(DetailError::new("OPTION_SUB_DUPLICATE"));
                }
            }

            let mut resolved_subs = Vec::new();
            for sub_val in &s.sub_options {
                let k = sub_value_key(sub_val);
                let allowed = option.sub_options.iter().find(|so| so.key() == k);
                let allowed = match allowed {
                    Some(a) => a,
                    None => return Err(DetailError::new("OPTION_SUB_INVALID")),
                };

                if allowed.is_oos() {
                    return Err(DetailError::new("OPTION_SUB_INVALID"));
                }

                let sub_id = match allowed {
                    SubOptionItem::Object(obj) => obj.id.clone(),
                    SubOptionItem::RawString(_) => None,
                };

                resolved_subs.push(SubOptionSummary {
                    id: sub_id,
                    name: allowed.name(),
                    price: allowed.price(),
                    product_id: allowed.product_id(),
                    item_id: allowed.product_id(),
                });
            }

            let sub_extra: Decimal = resolved_subs.iter().map(|so| so.price).sum();
            let line_unit_extra = option.price + child.extra + sub_extra;
            total_extra += line_unit_extra * Decimal::from(qty);

            let mut modifiers = Vec::new();
            for child_group in &child.groups {
                for item in &child_group.items {
                    let mut name = item.name.clone();
                    if item.quantity > 1 {
                        name.push_str(&format!(" ×{}", item.quantity));
                    }
                    if !item.modifiers.is_empty() {
                        let sub_names: Vec<String> = item.modifiers.iter().map(|m| m.name.clone()).collect();
                        name.push_str(&format!(" ({})", sub_names.join("、")));
                    }
                    let child_mod_price: Decimal = item.modifiers.iter().map(|m| m.price).sum();
                    let price = (item.surcharge + child_mod_price) * Decimal::from(item.quantity);
                    modifiers.push(DetailModifier {
                        group_id: child_group.group_id.clone(),
                        name,
                        price,
                    });
                }
            }
            for sub in &resolved_subs {
                modifiers.push(DetailModifier {
                    group_id: "sub_option".to_string(),
                    name: sub.name.clone(),
                    price: sub.price,
                });
            }

            detail_choices.push(DetailChoice {
                option_id: option.id.clone(),
                item_id: option.product_id.clone().unwrap_or_else(|| option.id.clone()),
                name: option.name.clone(),
                quantity: qty,
                surcharge: option.price,
                groups: child.groups,
                sub_options: resolved_subs,
                modifiers,
            });
        }

        if group.included {
            for o in &group.options {
                let count_for_o = seen.get(&o.id).copied().unwrap_or(0);
                if count_for_o != o.quantity {
                    return Err(DetailError::new("OPTION_INCLUDED_REQUIRED"));
                }
            }
        }

        snapshot_groups.push(DetailGroup {
            group_id: group.id.clone(),
            group_name: group.name.clone(),
            items: detail_choices,
        });
    }

    Ok(ValidatedOptionResult {
        groups: snapshot_groups,
        extra: total_extra,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateUnifiedItemInput {
    #[serde(default)]
    pub item_id: Option<String>,
    #[serde(default)]
    pub item_id_snake: Option<String>,
    pub quantity: u32,
    #[serde(default)]
    pub subtotal: Option<Decimal>,
    #[serde(default)]
    pub bundle_selections: Option<BundleSelectionsInput>,
    #[serde(default)]
    pub bundle_snapshot_json: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

impl ValidateUnifiedItemInput {
    pub fn get_id(&self) -> Option<&str> {
        self.item_id.as_deref().or(self.item_id_snake.as_deref())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleSelectionsInput {
    #[serde(default)]
    pub version: Option<u32>,
    #[serde(default)]
    pub portions: Option<Vec<RawPortionInput>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawPortionInput {
    #[serde(default)]
    pub groups: Vec<SelectedGroupInput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateUnifiedResult {
    pub valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_index: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_subtotal: Option<Decimal>,
    #[serde(default)]
    pub legacy: Vec<serde_json::Value>,
    #[serde(default)]
    pub items: Vec<serde_json::Value>,
}

pub fn validate_unified_order_items(
    catalog: &OptionCatalog,
    items: &[serde_json::Value],
    now_ms: i64,
) -> ValidateUnifiedResult {
    if items.is_empty() {
        return ValidateUnifiedResult {
            valid: true,
            code: None,
            error: None,
            item_index: None,
            expected_subtotal: None,
            legacy: Vec::new(),
            items: Vec::new(),
        };
    }

    let mut legacy = Vec::new();
    struct ComputedItem {
        id: String,
        portions: Vec<RawPortionInput>,
        subtotal: Decimal,
    }
    let mut computed_map: HashMap<usize, ComputedItem> = HashMap::new();
    let mut merchandise_subtotal = Decimal::ZERO;

    // Pass 1
    for (idx, raw_item) in items.iter().enumerate() {
        let item_id = raw_item.get("itemId").and_then(|v| v.as_str())
            .or_else(|| raw_item.get("item_id").and_then(|v| v.as_str()));
        let id = match item_id {
            Some(i) => i,
            None => {
                legacy.push(raw_item.clone());
                continue;
            }
        };

        let product = catalog.products.iter().find(|p| p.id == id);
        let groups = effective_groups(catalog, id, now_ms).unwrap_or_default();

        if product.is_none() || groups.is_empty() {
            legacy.push(raw_item.clone());
            if let Some(p) = product {
                if let Some(qty) = raw_item.get("quantity").and_then(|q| q.as_u64()) {
                    if is_valid_qty(qty as u32, 1) {
                        merchandise_subtotal += p.get_price() * Decimal::from(qty);
                    }
                }
            }
            continue;
        }

        let qty = raw_item.get("quantity").and_then(|q| q.as_u64()).map(|q| q as u32).unwrap_or(0);
        if !is_valid_qty(qty, 1) {
            return ValidateUnifiedResult {
                valid: false,
                code: Some("OPTION_QUANTITY".to_string()),
                error: Some("餐點選項已更新，請重新確認".to_string()),
                item_index: Some(idx),
                expected_subtotal: None,
                legacy: Vec::new(),
                items: Vec::new(),
            };
        }

        let parsed_bundle: Option<BundleSelectionsInput> = if let Some(bs) = raw_item.get("bundleSelections") {
            serde_json::from_value(bs.clone()).ok()
        } else if let Some(bs_json) = raw_item.get("bundle_snapshot_json").and_then(|s| s.as_str()) {
            serde_json::from_str(bs_json).ok()
        } else {
            None
        };

        let portions = match parsed_bundle.and_then(|b| b.portions) {
            Some(p) if p.len() == qty as usize => p,
            _ => {
                return ValidateUnifiedResult {
                    valid: false,
                    code: Some("OPTION_SELECTION_REQUIRED".to_string()),
                    error: Some("餐點選項已更新，請重新確認".to_string()),
                    item_index: Some(idx),
                    expected_subtotal: None,
                    legacy: Vec::new(),
                    items: Vec::new(),
                };
            }
        };

        let mut extra = Decimal::ZERO;
        for p in &portions {
            match validate_option_selection(catalog, id, &p.groups, &[], Decimal::MAX, now_ms) {
                Ok(res) => extra += res.extra,
                Err(e) => {
                    return ValidateUnifiedResult {
                        valid: false,
                        code: Some(e.code().to_string()),
                        error: Some("餐點選項已更新，請重新確認".to_string()),
                        item_index: Some(idx),
                        expected_subtotal: None,
                        legacy: Vec::new(),
                        items: Vec::new(),
                    };
                }
            }
        }

        let p_price = product.unwrap().get_price();
        let expected_subtotal = p_price * Decimal::from(qty) + extra;

        let submitted_subtotal = raw_item.get("subtotal")
            .and_then(|s| {
                if let Some(n) = s.as_f64() {
                    Decimal::from_str_exact(&n.to_string()).ok()
                } else if let Some(str_val) = s.as_str() {
                    str_val.parse::<Decimal>().ok()
                } else {
                    None
                }
            });

        if let Some(sub) = submitted_subtotal {
            if (sub - expected_subtotal).abs() > Decimal::from_str_exact("0.001").unwrap() {
                return ValidateUnifiedResult {
                    valid: false,
                    code: Some("OPTION_PRICE_CHANGED".to_string()),
                    error: Some("餐點價格已更新，請重新確認".to_string()),
                    item_index: Some(idx),
                    expected_subtotal: Some(expected_subtotal),
                    legacy: Vec::new(),
                    items: Vec::new(),
                };
            }
        }

        merchandise_subtotal += expected_subtotal;
        computed_map.insert(idx, ComputedItem {
            id: id.to_string(),
            portions,
            subtotal: expected_subtotal,
        });
    }

    // Category bundle discount pass
    for cat in &catalog.categories {
        let rule_val = cat.pricing_rules.as_ref();
        let rule: Option<serde_json::Value> = match rule_val {
            Some(serde_json::Value::String(s)) => serde_json::from_str(s).ok(),
            Some(v) => Some(v.clone()),
            None => None,
        };

        if let Some(r) = rule {
            let bundle_qty = r.get("bundle_qty").and_then(|v| v.as_u64()).map(|q| q as usize);
            let bundle_price = r.get("bundle_price").and_then(|v| {
                if let Some(n) = v.as_f64() {
                    Decimal::from_str_exact(&n.to_string()).ok()
                } else if let Some(s) = v.as_str() {
                    s.parse::<Decimal>().ok()
                } else {
                    None
                }
            });

            if let (Some(b_qty), Some(b_price)) = (bundle_qty, bundle_price) {
                if b_qty > 0 {
                    let mut prices: Vec<Decimal> = Vec::new();
                    for raw_item in items {
                        let id = raw_item.get("itemId").and_then(|v| v.as_str())
                            .or_else(|| raw_item.get("item_id").and_then(|v| v.as_str()));
                        if let Some(item_id) = id {
                            if let Some(prod) = catalog.products.iter().find(|p| p.id == item_id) {
                                if prod.category_id == cat.id {
                                    if let Some(qty) = raw_item.get("quantity").and_then(|q| q.as_u64()) {
                                        for _ in 0..qty {
                                            prices.push(prod.get_price());
                                        }
                                    }
                                }
                            }
                        }
                    }
                    prices.sort_by(|a, b| b.cmp(a));
                    let count = prices.len() / b_qty;
                    if count > 0 {
                        let take_count = count * b_qty;
                        let sum_orig: Decimal = prices[0..take_count].iter().sum();
                        let target_discount = sum_orig - (b_price * Decimal::from(count));
                        if target_discount > Decimal::ZERO {
                            merchandise_subtotal -= target_discount;
                        }
                    }
                }
            }
        }
    }

    if merchandise_subtotal < Decimal::ZERO {
        merchandise_subtotal = Decimal::ZERO;
    }

    // Pass 2: check eligibility against server merchandiseSubtotal
    let mut clean_items = items.to_vec();
    for (idx, computed) in computed_map {
        let mut clean_portions = Vec::new();
        for (p_idx, p) in computed.portions.iter().enumerate() {
            match validate_option_selection(catalog, &computed.id, &p.groups, &[], merchandise_subtotal, now_ms) {
                Ok(res) => {
                    clean_portions.push(serde_json::json!({
                        "portionIndex": p_idx,
                        "groups": res.groups,
                    }));
                }
                Err(e) => {
                    return ValidateUnifiedResult {
                        valid: false,
                        code: Some(e.code().to_string()),
                        error: Some("餐點選項已更新，請重新確認".to_string()),
                        item_index: Some(idx),
                        expected_subtotal: None,
                        legacy: Vec::new(),
                        items: Vec::new(),
                    };
                }
            }
        }

        let bundle_sel = serde_json::json!({
            "version": 3,
            "portions": clean_portions,
        });

        if let Some(obj) = clean_items[idx].as_object_mut() {
            obj.insert("bundleSelections".to_string(), bundle_sel.clone());
            obj.insert("bundle_snapshot_json".to_string(), serde_json::Value::String(bundle_sel.to_string()));
            obj.insert("subtotal".to_string(), serde_json::json!(computed.subtotal));
        }
    }

    ValidateUnifiedResult {
        valid: true,
        code: None,
        error: None,
        item_index: None,
        expected_subtotal: None,
        legacy,
        items: clean_items,
    }
}
