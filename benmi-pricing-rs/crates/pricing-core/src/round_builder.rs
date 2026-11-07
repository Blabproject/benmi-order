use crate::graph::{effective_groups, group_options};
use crate::types::*;
use crate::validator::{validate_option_selection, SelectedGroupInput};
use crate::view::extra;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildRoundInput {
    pub items: Vec<RoundItemInput>,
    #[serde(default)]
    pub order_selections: Option<Vec<SelectedGroupInput>>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub total: Option<Decimal>,
    #[serde(default)]
    pub appended_total: Option<Decimal>,
    #[serde(default)]
    pub new_total: Option<Decimal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoundItemInput {
    #[serde(default)]
    pub line_id: Option<String>,
    #[serde(default)]
    pub item_id: Option<String>,
    #[serde(default)]
    pub item_id_snake: Option<String>,
    pub quantity: u32,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub portion_notes: Option<Vec<String>>,
    #[serde(default)]
    pub bundle_selections: Option<RoundBundleSelectionsInput>,
    #[serde(default)]
    pub options: Option<Vec<serde_json::Value>>,
}

impl RoundItemInput {
    pub fn get_id(&self) -> Option<&str> {
        self.item_id.as_deref().or(self.item_id_snake.as_deref())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoundBundleSelectionsInput {
    #[serde(default)]
    pub portions: Option<Vec<SelectedPortionInput>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectedPortionInput {
    #[serde(default)]
    pub groups: Vec<SelectedGroupInput>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
struct NormalizedChoiceIdentity {
    option_id: String,
    quantity: u32,
    groups: Vec<NormalizedGroupIdentity>,
    sub_options: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
struct NormalizedGroupIdentity {
    group_id: String,
    items: Vec<NormalizedChoiceIdentity>,
}

fn normalize_group_identity(groups: &[SelectedGroupInput]) -> Vec<NormalizedGroupIdentity> {
    groups.iter().map(|g| {
        let mut items: Vec<NormalizedChoiceIdentity> = g.items.iter().map(|c| {
            let opt_id = c.option_id.clone().or_else(|| c.item_id.clone()).unwrap_or_default();
            let mut subs: Vec<String> = c.sub_options.iter().map(|s| {
                if let Some(str_val) = s.as_str() {
                    str_val.to_string()
                } else if let Some(obj) = s.as_object() {
                    obj.get("id").and_then(|v| v.as_str())
                        .or_else(|| obj.get("productId").and_then(|v| v.as_str()))
                        .or_else(|| obj.get("name").and_then(|v| v.as_str()))
                        .unwrap_or("")
                        .to_string()
                } else {
                    String::new()
                }
            }).collect();
            subs.sort();

            NormalizedChoiceIdentity {
                option_id: opt_id,
                quantity: c.quantity,
                groups: normalize_group_identity(&c.groups),
                sub_options: subs,
            }
        }).collect();
        items.sort();

        NormalizedGroupIdentity {
            group_id: g.group_id.clone(),
            items,
        }
    }).collect()
}

fn detail_group_to_selected_input(groups: &[DetailGroup]) -> Vec<SelectedGroupInput> {
    groups.iter().map(|g| {
        SelectedGroupInput {
            group_id: g.group_id.clone(),
            items: g.items.iter().map(|c| {
                crate::validator::SelectionItemInput {
                    option_id: Some(c.option_id.clone()),
                    item_id: Some(c.item_id.clone()),
                    quantity: c.quantity,
                    groups: detail_group_to_selected_input(&c.groups),
                    sub_options: c.sub_options.iter().map(|so| serde_json::json!({
                        "id": so.id,
                        "name": so.name,
                        "price": so.price,
                        "productId": so.product_id,
                    })).collect(),
                }
            }).collect(),
        }
    }).collect()
}

pub fn same_selections(a: &[SelectedGroupInput], b: &[DetailGroup]) -> bool {
    let norm_a = normalize_group_identity(a);
    let converted_b = detail_group_to_selected_input(b);
    let norm_b = normalize_group_identity(&converted_b);
    norm_a == norm_b
}

fn sanitize_note(val: Option<&str>) -> Result<String, DetailError> {
    match val {
        None => Ok(String::new()),
        Some(s) => {
            if s.len() > 4000 {
                return Err(DetailError::new("INVALID_NOTE"));
            }
            Ok(s.trim().to_string())
        }
    }
}

pub fn build_detail_round(
    catalog: &OptionCatalog,
    input: &BuildRoundInput,
    round_number: u32,
    previous: Option<&DetailRound>,
    now_ms: i64,
) -> Result<DetailRound, DetailError> {
    if input.items.is_empty() || input.items.len() > 200 {
        return Err(DetailError::new("EMPTY_OR_TOO_MANY_ITEMS"));
    }

    let unchanged_line = |i: &RoundItemInput| -> Option<&DetailLine> {
        let prev = previous?;
        let target_id = i.get_id()?;
        let old = prev.items.iter().find(|l| {
            i.line_id.as_deref() == Some(&l.line_id) && l.item_id == target_id
        })?;

        let portions = i.bundle_selections.as_ref()
            .and_then(|b| b.portions.as_ref());

        let portions_count = portions.map(|p| p.len()).unwrap_or(i.quantity as usize);
        if old.quantity != i.quantity || portions_count != old.portions.len() {
            return None;
        }

        if let Some(p_list) = portions {
            for (idx, p) in p_list.iter().enumerate() {
                if !same_selections(&p.groups, &old.portions[idx].groups) {
                    return None;
                }
            }
        } else {
            for old_p in &old.portions {
                if !old_p.groups.is_empty() {
                    return None;
                }
            }
        }

        Some(old)
    };

    let mut used_lines: HashSet<String> = HashSet::new();
    let mut items: Vec<DetailLine> = Vec::new();

    for raw in &input.items {
        if let Some(unchanged) = unchanged_line(raw) {
            if !used_lines.insert(unchanged.line_id.clone()) {
                return Err(DetailError::new("DUPLICATE_LINE"));
            }

            if let Some(p_notes) = &raw.portion_notes {
                if p_notes.len() != unchanged.quantity as usize {
                    return Err(DetailError::new("INVALID_PORTION_NOTES"));
                }
            }

            let line_note = match &raw.note {
                Some(n) => sanitize_note(Some(n))?,
                None => unchanged.note.clone(),
            };

            let portions: Vec<DetailPortion> = unchanged.portions.iter().enumerate().map(|(idx, p)| {
                let note = match &raw.portion_notes {
                    Some(p_notes) => sanitize_note(p_notes.get(idx).map(|s| s.as_str())).unwrap_or_default(),
                    None => p.note.clone(),
                };
                DetailPortion {
                    portion_index: p.portion_index,
                    note,
                    groups: p.groups.clone(),
                }
            }).collect();

            items.push(DetailLine {
                line_id: unchanged.line_id.clone(),
                item_id: unchanged.item_id.clone(),
                name: unchanged.name.clone(),
                category_id: unchanged.category_id.clone(),
                category: unchanged.category.clone(),
                quantity: unchanged.quantity,
                unit_price: unchanged.unit_price,
                subtotal: unchanged.subtotal,
                note: line_note,
                portions,
            });
            continue;
        }

        let raw_id = raw.get_id().ok_or_else(|| DetailError::new("INVALID_ITEM"))?;
        let product = catalog.products.iter().find(|p| p.id == raw_id)
            .ok_or_else(|| DetailError::new("INVALID_ITEM"))?;

        if raw.quantity < 1 || raw.quantity > 999 {
            return Err(DetailError::new("INVALID_ITEM"));
        }

        let old = if let (Some(l_id), Some(prev)) = (&raw.line_id, previous) {
            let found = prev.items.iter().find(|i| &i.line_id == l_id);
            if found.map(|i| i.item_id != product.id).unwrap_or(true) {
                return Err(DetailError::new("INVALID_LINE_ID"));
            }
            found
        } else {
            None
        };

        let line_id = old.map(|i| i.line_id.clone()).unwrap_or_else(|| Uuid::new_v4().to_string());
        if !used_lines.insert(line_id.clone()) {
            return Err(DetailError::new("DUPLICATE_LINE"));
        }

        if product.is_oos(now_ms) {
            return Err(DetailError::new("PRODUCT_UNAVAILABLE"));
        }

        let quantity = raw.quantity;
        if let Some(max_per_order) = product.max_per_order {
            let total_qty_for_product: u32 = input.items.iter()
                .filter(|i| i.get_id() == Some(&product.id))
                .map(|i| i.quantity)
                .sum();
            if total_qty_for_product > max_per_order {
                return Err(DetailError::new("ITEM_LIMIT_EXCEEDED"));
            }
        }

        let groups = effective_groups(catalog, &product.id, now_ms)?;
        let supplied_portions = raw.bundle_selections.as_ref().and_then(|b| b.portions.as_ref());

        if let Some(supplied) = supplied_portions {
            if supplied.len() != quantity as usize {
                return Err(DetailError::new("OPTION_PORTIONS_REQUIRED"));
            }
        }

        if !groups.is_empty() && supplied_portions.is_none() {
            return Err(DetailError::new("OPTION_SELECTION_REQUIRED"));
        }

        if raw.options.as_ref().map(|o| !o.is_empty()).unwrap_or(false) {
            return Err(DetailError::new("ORDER_CLIENT_UPGRADE_REQUIRED"));
        }

        if let Some(p_notes) = &raw.portion_notes {
            if p_notes.len() != quantity as usize {
                return Err(DetailError::new("INVALID_PORTION_NOTES"));
            }
        }

        let mut portions: Vec<DetailPortion> = Vec::new();
        let mut line_extra = Decimal::ZERO;

        for index in 0..quantity as usize {
            let sel_groups = supplied_portions
                .and_then(|p| p.get(index))
                .map(|p| p.groups.as_slice())
                .unwrap_or(&[]);

            let result = validate_option_selection(
                catalog,
                &product.id,
                sel_groups,
                &[],
                Decimal::MAX,
                now_ms,
            )?;

            let portion_note = match &raw.portion_notes {
                Some(p_notes) => sanitize_note(p_notes.get(index).map(|s| s.as_str()))?,
                None => old.and_then(|o| o.portions.get(index)).map(|p| p.note.clone()).unwrap_or_default(),
            };

            for g in &result.groups {
                for c in &g.items {
                    line_extra += extra(c);
                }
            }

            portions.push(DetailPortion {
                portion_index: index,
                note: portion_note,
                groups: result.groups,
            });
        }

        let category = catalog.categories.iter().find(|c| c.id == product.category_id);
        let category_name = category.map(|c| c.name.clone()).unwrap_or_default();
        let unit_price = product.get_price();
        let subtotal = unit_price * Decimal::from(quantity) + line_extra;

        let line_note = match &raw.note {
            Some(n) => sanitize_note(Some(n))?,
            None => old.map(|o| o.note.clone()).unwrap_or_default(),
        };

        items.push(DetailLine {
            line_id,
            item_id: product.id.clone(),
            name: product.name.clone(),
            category_id: product.category_id.clone(),
            category: category_name,
            quantity,
            unit_price,
            subtotal,
            note: line_note,
            portions,
        });
    }

    // Category bundle discounts
    let mut discount = Decimal::ZERO;
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
                    for i in &items {
                        if i.category_id == cat.id {
                            for _ in 0..i.quantity {
                                prices.push(i.unit_price);
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
                            discount += target_discount;
                        }
                    }
                }
            }
        }
    }

    if let Some(prev) = previous {
        if items.len() == prev.items.len() && input.items.iter().all(|i| unchanged_line(i).is_some()) {
            discount = prev.discount;
        }
    }

    let items_subtotal: Decimal = items.iter().map(|i| i.subtotal).sum();
    let merchandise_subtotal = if items_subtotal > discount {
        items_subtotal - discount
    } else {
        Decimal::ZERO
    };

    // Re-validate against merchandise_subtotal
    for raw in &input.items {
        if unchanged_line(raw).is_some() {
            continue;
        }
        let id = raw.get_id().unwrap();
        if let Some(portions) = raw.bundle_selections.as_ref().and_then(|b| b.portions.as_ref()) {
            for p in portions {
                validate_option_selection(catalog, id, &p.groups, &[], merchandise_subtotal, now_ms)?;
            }
        }
    }

    // Order-scoped selections
    let selected_groups: Vec<DetailGroup> = if let Some(prev) = previous {
        if input.order_selections.is_none() || (input.order_selections.as_ref().map(|s| same_selections(s, &prev.groups)).unwrap_or(false)) {
            prev.groups.clone()
        } else {
            let order_sel = input.order_selections.as_ref().ok_or_else(|| DetailError::new("ORDER_SELECTIONS_REQUIRED"))?;
            let synthetic_id = Uuid::new_v4().to_string();
            let mut synthetic = catalog.clone();
            synthetic.products.push(ProductRow {
                id: synthetic_id.clone(),
                name: "Order synthetic".to_string(),
                price: Some(FlexiblePrice::Number(Decimal::ZERO)),
                category_id: String::new(),
                is_out_of_stock: None,
                out_of_stock_until: None,
                max_per_order: None,
                image_key: None,
                tenant_id: None,
                menu_revision: None,
            });

            for g in &mut synthetic.groups {
                if g.scope == "order" {
                    g.scope = "item".to_string();
                    g.options = group_options(catalog, g, now_ms);
                }
            }

            for g in catalog.groups.iter().filter(|g| g.scope == "order") {
                synthetic.links.push(ItemModifierLink {
                    item_id: synthetic_id.clone(),
                    group_id: g.id.clone(),
                    option_ids: None,
                    disabled: false,
                });
            }

            validate_option_selection(&synthetic, &synthetic_id, order_sel, &[], merchandise_subtotal, now_ms)?.groups
        }
    } else {
        let empty_vec = Vec::new();
        let order_sel = input.order_selections.as_deref().unwrap_or(&empty_vec);
        let synthetic_id = Uuid::new_v4().to_string();
        let mut synthetic = catalog.clone();
        synthetic.products.push(ProductRow {
            id: synthetic_id.clone(),
            name: "Order synthetic".to_string(),
            price: Some(FlexiblePrice::Number(Decimal::ZERO)),
            category_id: String::new(),
            is_out_of_stock: None,
            out_of_stock_until: None,
            max_per_order: None,
            image_key: None,
            tenant_id: None,
            menu_revision: None,
        });

        for g in &mut synthetic.groups {
            if g.scope == "order" {
                g.scope = "item".to_string();
                g.options = group_options(catalog, g, now_ms);
            }
        }

        for g in catalog.groups.iter().filter(|g| g.scope == "order") {
            synthetic.links.push(ItemModifierLink {
                item_id: synthetic_id.clone(),
                group_id: g.id.clone(),
                option_ids: None,
                disabled: false,
            });
        }

        validate_option_selection(&synthetic, &synthetic_id, order_sel, &[], merchandise_subtotal, now_ms)?.groups
    };

    let order_extra: Decimal = selected_groups.iter()
        .flat_map(|g| g.items.iter().map(extra))
        .sum();

    let total = items_subtotal - discount + order_extra;

    let submitted = input.appended_total
        .or(input.new_total)
        .or(input.total);

    if let Some(sub) = submitted {
        if (total - sub).abs() > Decimal::from_str_exact("0.001").unwrap() {
            return Err(DetailError::with_status("ORDER_PRICE_CHANGED", 409));
        }
    }

    let round_note = match &input.note {
        Some(n) => sanitize_note(Some(n))?,
        None => previous.map(|p| p.note.clone()).unwrap_or_default(),
    };

    let created_at = previous.map(|p| p.created_at.clone())
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

    Ok(DetailRound {
        round_number,
        created_at,
        note: round_note,
        groups: selected_groups,
        items,
        discount,
        total,
        legacy_content: None,
    })
}
