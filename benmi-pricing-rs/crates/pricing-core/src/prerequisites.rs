use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrerequisiteRule {
    pub min_parent_qty: f64,
    pub required_item_ids: Vec<String>,
    pub required_category_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrerequisiteOrderItem {
    pub item_id: String,
    pub category_id: String,
    pub quantity: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrerequisiteEvaluation {
    pub qualifying_qty: f64,
    pub unlocked: bool,
}

pub fn evaluate_prerequisite(
    rule: &PrerequisiteRule,
    excluded_item_id: &str,
    items: &[PrerequisiteOrderItem],
) -> PrerequisiteEvaluation {
    let qualifying_qty = items
        .iter()
        .filter(|item| {
            item.quantity.is_finite()
                && item.quantity > 0.0
                && (excluded_item_id.is_empty() || item.item_id != excluded_item_id)
                && ((!item.item_id.is_empty() && rule.required_item_ids.contains(&item.item_id))
                    || (!item.category_id.is_empty()
                        && rule.required_category_ids.contains(&item.category_id)))
        })
        .map(|item| item.quantity)
        .sum();

    PrerequisiteEvaluation {
        qualifying_qty,
        unlocked: qualifying_qty >= rule.min_parent_qty,
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrderPrerequisiteCheck {
    item_index: usize,
    item_id: String,
    rule: PrerequisiteRule,
}

#[derive(Deserialize)]
pub struct OrderPrerequisites {
    items: Vec<PrerequisiteOrderItem>,
    checks: Vec<OrderPrerequisiteCheck>,
}

impl OrderPrerequisites {
    pub fn first_unmet_item_index(&self) -> Option<usize> {
        self.checks
            .iter()
            .find(|check| !evaluate_prerequisite(&check.rule, &check.item_id, &self.items).unlocked)
            .map(|check| check.item_index)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn counts_item_and_category_matches_once_and_excludes_the_item_being_checked() {
        let context: OrderPrerequisites = serde_json::from_value(json!({
            "items": [
                { "itemId": "main", "categoryId": "mains", "quantity": 1 },
                { "itemId": "another-main", "categoryId": "mains", "quantity": 1 },
                { "itemId": "addon", "categoryId": "mains", "quantity": 4 },
                { "itemId": "other", "categoryId": "drinks", "quantity": 3 },
                { "itemId": "empty", "categoryId": "mains", "quantity": 0 }
            ],
            "checks": [
                { "itemIndex": 1, "itemId": "addon", "rule": {
                    "minParentQty": 2, "requiredItemIds": ["main"], "requiredCategoryIds": ["mains"]
                }},
                { "itemIndex": 3, "itemId": "addon", "rule": {
                    "minParentQty": 3, "requiredItemIds": ["main"], "requiredCategoryIds": ["mains"]
                }}
            ]
        }))
        .unwrap();

        assert_eq!(context.first_unmet_item_index(), Some(3));
    }
}
