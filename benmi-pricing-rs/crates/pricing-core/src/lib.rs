pub mod graph;
pub mod round_builder;
pub mod types;
pub mod validator;
pub mod view;

pub use graph::{effective_groups, group_options, project_option_rule, validate_option_graph};
pub use round_builder::{build_detail_round, same_selections, BuildRoundInput, RoundItemInput};
pub use types::*;
pub use validator::{validate_option_selection, validate_unified_order_items, ValidateUnifiedResult};

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    #[test]
    fn test_pricing_and_discount() {
        let catalog = OptionCatalog {
            revision: Some(1),
            products: vec![
                ProductRow {
                    id: "p1".to_string(),
                    name: "Item 1".to_string(),
                    price: Some(FlexiblePrice::Number(dec!(50))),
                    category_id: "c1".to_string(),
                    is_out_of_stock: None,
                    out_of_stock_until: None,
                    max_per_order: None,
                    image_key: None,
                    tenant_id: Some("blab_demo".to_string()),
                    menu_revision: Some(1),
                },
            ],
            categories: vec![
                CategoryRow {
                    id: "c1".to_string(),
                    name: "Main".to_string(),
                    category_type: Some("standard".to_string()),
                    pricing_rules: Some(serde_json::json!({
                        "bundle_qty": 2,
                        "bundle_price": 90
                    })),
                },
            ],
            groups: vec![],
            links: vec![],
            category_links: vec![],
        };

        let input = BuildRoundInput {
            items: vec![
                RoundItemInput {
                    line_id: None,
                    item_id: Some("p1".to_string()),
                    item_id_snake: None,
                    quantity: 2,
                    note: None,
                    portion_notes: None,
                    bundle_selections: None,
                    options: None,
                },
            ],
            order_selections: Some(vec![]),
            note: None,
            total: Some(dec!(90)),
            appended_total: None,
            new_total: None,
        };

        let round = build_detail_round(&catalog, &input, 1, None, 0).expect("round build should succeed");
        assert_eq!(round.total, dec!(90));
        assert_eq!(round.discount, dec!(10));
        assert_eq!(round.items.len(), 1);
        assert_eq!(round.items[0].subtotal, dec!(100));

        let view_lines = view::lines(&OrderDetailSnapshot {
            schema_version: 1,
            rounds: vec![round],
            total: dec!(90),
        });
        assert_eq!(view_lines.len(), 1);
        assert_eq!(view_lines[0].name, "Item 1");
    }
}
