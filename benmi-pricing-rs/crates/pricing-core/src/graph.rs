use crate::types::*;
use rust_decimal::Decimal;
use std::collections::HashSet;

pub fn group_options(catalog: &OptionCatalog, group: &OptionGroup, now_ms: i64) -> Vec<MenuOption> {
    let mut options = group.options.clone();
    let mut seen: HashSet<String> = options.iter().filter_map(|o| o.product_id.clone()).collect();

    for source in &group.sources {
        for product in &catalog.products {
            let matches = match source.source_type.as_str() {
                "category" => {
                    let cat_id = source.ref_id.as_ref().or(source.category_id.as_ref());
                    cat_id.map(|c| c == &product.category_id).unwrap_or(false)
                }
                "item_list" => {
                    source.item_ids.as_ref().map(|ids| ids.contains(&product.id)).unwrap_or(false)
                }
                _ => false,
            };

            if !matches || seen.contains(&product.id) {
                continue;
            }
            seen.insert(product.id.clone());

            let legacy_surcharges = group.metadata.as_ref()
                .and_then(|m| m.get("legacySurcharges"))
                .and_then(|s| s.get(&product.id))
                .and_then(|v| {
                    if let Some(n) = v.as_f64() {
                        Decimal::from_str_exact(&n.to_string()).ok()
                    } else if let Some(s) = v.as_str() {
                        s.parse::<Decimal>().ok()
                    } else {
                        None
                    }
                })
                .unwrap_or(Decimal::ZERO);

            options.push(MenuOption {
                id: format!("source:{}:{}", group.id, product.id),
                name: product.name.clone(),
                price: legacy_surcharges,
                product_id: Some(product.id.clone()),
                quantity: 1,
                is_default: false,
                is_out_of_stock: false,
                out_of_stock_until: None,
                sub_options: Vec::new(),
                eligibility_rules: Vec::new(),
                description: None,
                from_source: Some(true),
                is_locally_out_of_stock: None,
                retail_price: None,
                image_url: None,
            });
        }
    }

    options.into_iter().map(|mut o| {
        let product = o.product_id.as_ref().and_then(|pid| catalog.products.iter().find(|p| &p.id == pid));
        if let Some(p) = product {
            o.name = p.name.clone();
            o.retail_price = Some(p.get_price());
            let product_oos = p.is_oos(now_ms);
            o.is_out_of_stock = o.is_out_of_stock || product_oos;
            if let Some(img) = &p.image_key {
                if !img.is_empty() {
                    let tenant = p.tenant_id.as_deref().unwrap_or("");
                    o.image_url = Some(format!("/api/image?tenant_id={}&name={}", tenant, img));
                }
            }
        }

        // Map sub options
        o.sub_options = o.sub_options.into_iter().map(|sub| {
            if let Some(pid) = sub.product_id() {
                let linked = catalog.products.iter().find(|p| p.id == pid);
                let linked_oos = linked.map(|p| p.is_oos(now_ms)).unwrap_or(true);
                let name = linked.map(|p| p.name.clone()).unwrap_or_else(|| sub.name());
                let price = linked.map(|p| p.get_price()).unwrap_or_else(|| sub.price());
                let id = match &sub {
                    SubOptionItem::Object(obj) => obj.id.clone().unwrap_or_else(|| format!("product:{}", pid)),
                    SubOptionItem::RawString(_) => format!("product:{}", pid),
                };
                SubOptionItem::Object(SubOptionObj {
                    id: Some(id),
                    name,
                    price: Some(price),
                    product_id: Some(pid),
                    is_out_of_stock: Some(linked_oos),
                    is_oos: Some(linked_oos),
                })
            } else {
                sub
            }
        }).collect();

        o
    }).collect()
}

pub fn effective_groups(catalog: &OptionCatalog, product_id: &str, now_ms: i64) -> Result<Vec<OptionGroup>, DetailError> {
    let product = catalog.products.iter().find(|p| p.id == product_id);
    if product.is_none() {
        return Err(DetailError::new("PRODUCT_NOT_FOUND"));
    }

    let direct: Vec<&ItemModifierLink> = catalog.links.iter().filter(|l| l.item_id == product_id).collect();

    let mut result = Vec::new();
    for link in direct {
        if link.disabled {
            continue;
        }
        let group = catalog.groups.iter().find(|g| g.id == link.group_id);
        if let Some(g) = group {
            if g.scope == "order" {
                continue;
            }
            let mut g_clone = g.clone();
            let all_opts = group_options(catalog, g, now_ms);
            g_clone.options = if let Some(option_ids) = &link.option_ids {
                all_opts.into_iter().filter(|o| option_ids.contains(&o.id)).collect()
            } else {
                all_opts
            };
            result.push(g_clone);
        }
    }
    Ok(result)
}

pub fn validate_option_graph(catalog: &OptionCatalog, now_ms: i64) -> Result<(), DetailError> {
    for link in &catalog.links {
        if link.disabled {
            continue;
        }
        if let Some(group) = catalog.groups.iter().find(|g| g.id == link.group_id) {
            let opts = group_options(catalog, group, now_ms);
            if opts.iter().any(|o| o.product_id.as_deref() == Some(&link.item_id)) {
                return Err(DetailError::new("OPTION_PRODUCT_CYCLE"));
            }
        }
    }

    let mut visiting = HashSet::new();
    let mut done = HashSet::new();

    fn visit(
        catalog: &OptionCatalog,
        id: &str,
        depth: usize,
        visiting: &mut HashSet<String>,
        done: &mut HashSet<String>,
        now_ms: i64,
    ) -> Result<(), DetailError> {
        if visiting.contains(id) {
            return Err(DetailError::new("OPTION_PRODUCT_CYCLE"));
        }
        if depth > 12 {
            return Err(DetailError::new("OPTION_DEPTH_LIMIT"));
        }
        if done.contains(id) {
            return Ok(());
        }
        visiting.insert(id.to_string());

        let groups = effective_groups(catalog, id, now_ms)?;
        for group in groups {
            let total: u32 = if group.included {
                group.options.iter().map(|o| o.quantity).sum()
            } else {
                group.options.len() as u32
            };

            if (group.included && (total < group.min_selection || total > group.max_selection || total == 0))
                || (group.min_selection > 0 && total == 0)
                || (!group.allow_repeats && !group.included && total < group.min_selection)
            {
                return Err(DetailError::new(&format!("INSUFFICIENT_OPTIONS:{}", group.id)));
            }

            for option in &group.options {
                if let Some(pid) = &option.product_id {
                    visit(catalog, pid, depth + 1, visiting, done, now_ms)?;
                }
            }
        }

        visiting.remove(id);
        done.insert(id.to_string());
        Ok(())
    }

    for product in &catalog.products {
        visit(catalog, &product.id, 0, &mut visiting, &mut done, now_ms)?;
    }

    Ok(())
}

pub fn project_option_rule(
    catalog: &OptionCatalog,
    product_id: &str,
    path: &[String],
    group_path: &[String],
    now_ms: i64,
) -> Result<Option<serde_json::Value>, DetailError> {
    if path.contains(&product_id.to_string()) || path.len() > 12 {
        return Err(DetailError::new("OPTION_PRODUCT_CYCLE"));
    }

    let groups: Vec<OptionGroup> = effective_groups(catalog, product_id, now_ms)?
        .into_iter()
        .filter(|g| !group_path.contains(&g.id))
        .collect();

    if groups.is_empty() {
        return Ok(None);
    }

    let auto_popup = groups.iter().any(|g| g.min_selection > 0 || g.included);

    let projected_groups: Vec<serde_json::Value> = groups
        .into_iter()
        .map(|g| {
            let mut next_path = path.to_vec();
            next_path.push(product_id.to_string());

            let mut next_group_path = group_path.to_vec();
            next_group_path.push(g.id.clone());

            let eligible_items: Vec<serde_json::Value> = g.options
                .iter()
                .map(|o| {
                    let child_groups = if let Some(pid) = &o.product_id {
                        project_option_rule(catalog, pid, &next_path, &next_group_path, now_ms)
                            .ok()
                            .flatten()
                            .and_then(|rule| rule.get("groups").cloned())
                            .unwrap_or_else(|| serde_json::Value::Array(Vec::new()))
                    } else {
                        serde_json::Value::Array(Vec::new())
                    };

                    serde_json::json!({
                        "id": o.id,
                        "name": o.name,
                        "price": o.price,
                        "surcharge": o.price,
                        "productId": o.product_id,
                        "quantity": o.quantity,
                        "isDefault": o.is_default,
                        "isOutOfStock": o.is_out_of_stock,
                        "subOptions": o.sub_options,
                        "eligibilityRules": o.eligibility_rules,
                        "description": o.description,
                        "optionGroups": child_groups,
                    })
                })
                .collect();

            let items: Vec<serde_json::Value> = if g.included {
                g.options
                    .iter()
                    .map(|o| serde_json::json!({ "itemId": o.id, "quantity": o.quantity, "surcharge": o.price }))
                    .collect()
            } else {
                Vec::new()
            };

            serde_json::json!({
                "id": g.id,
                "name": g.name,
                "type": if g.included { "fixed" } else { "choice" },
                "autoPopup": g.included || g.min_selection > 0,
                "minQuantity": g.min_selection,
                "maxQuantity": g.max_selection,
                "allowRepeats": g.allow_repeats,
                "included": g.included,
                "label": g.labels,
                "eligibleItems": eligible_items,
                "items": items,
            })
        })
        .collect();

    Ok(Some(serde_json::json!({
        "version": 3,
        "autoPopup": auto_popup,
        "groups": projected_groups,
    })))
}
