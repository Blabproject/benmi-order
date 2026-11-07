use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailChoice {
    pub option_id: String,
    pub item_id: String,
    pub name: String,
    pub quantity: u32,
    pub surcharge: Decimal,
    #[serde(default)]
    pub groups: Vec<DetailGroup>,
    #[serde(default)]
    pub sub_options: Vec<SubOptionSummary>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub modifiers: Vec<DetailModifier>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailModifier {
    pub group_id: String,
    pub name: String,
    pub price: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubOptionSummary {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    pub price: Decimal,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub product_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub item_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailGroup {
    pub group_id: String,
    pub group_name: String,
    pub items: Vec<DetailChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailPortion {
    pub portion_index: usize,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub groups: Vec<DetailGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailLine {
    pub line_id: String,
    pub item_id: String,
    pub name: String,
    pub category_id: String,
    pub category: String,
    pub quantity: u32,
    pub unit_price: Decimal,
    pub subtotal: Decimal,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub portions: Vec<DetailPortion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailRound {
    pub round_number: u32,
    pub created_at: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub groups: Vec<DetailGroup>,
    #[serde(default)]
    pub items: Vec<DetailLine>,
    pub discount: Decimal,
    pub total: Decimal,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub legacy_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderDetailSnapshot {
    pub schema_version: u32,
    pub rounds: Vec<DetailRound>,
    pub total: Decimal,
}

// OptionCatalog and menu entities
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FlexiblePrice {
    Number(Decimal),
    Str(String),
}

impl FlexiblePrice {
    pub fn to_decimal(&self) -> Decimal {
        match self {
            FlexiblePrice::Number(d) => *d,
            FlexiblePrice::Str(s) => s.parse::<Decimal>().unwrap_or(Decimal::ZERO),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductRow {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub price: Option<FlexiblePrice>,
    #[serde(default, alias = "categoryId")]
    pub category_id: String,
    #[serde(default)]
    pub is_out_of_stock: Option<serde_json::Value>,
    #[serde(default)]
    pub out_of_stock_until: Option<String>,
    #[serde(default)]
    pub max_per_order: Option<u32>,
    #[serde(default)]
    pub image_key: Option<String>,
    #[serde(default)]
    pub tenant_id: Option<String>,
    #[serde(default)]
    pub menu_revision: Option<i64>,
}

impl ProductRow {
    pub fn get_price(&self) -> Decimal {
        self.price.as_ref().map(|p| p.to_decimal()).unwrap_or(Decimal::ZERO)
    }

    pub fn is_oos(&self, now_ms: i64) -> bool {
        let is_flag = match &self.is_out_of_stock {
            Some(serde_json::Value::Bool(b)) => *b,
            Some(serde_json::Value::Number(n)) => n.as_i64().unwrap_or(0) != 0,
            _ => false,
        };
        if is_flag {
            return true;
        }
        if let Some(until) = &self.out_of_stock_until {
            if let Ok(ts) = chrono::DateTime::parse_from_rfc3339(until) {
                return ts.timestamp_millis() > now_ms;
            }
        }
        false
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryRow {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, alias = "categoryType")]
    pub category_type: Option<String>,
    #[serde(default, alias = "pricingRules")]
    pub pricing_rules: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemModifierLink {
    pub item_id: String,
    pub group_id: String,
    #[serde(default)]
    pub option_ids: Option<Vec<String>>,
    #[serde(default)]
    pub disabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryModifierLink {
    pub category_id: String,
    pub group_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionSource {
    #[serde(rename = "type")]
    pub source_type: String, // "category" | "item_list"
    #[serde(default)]
    pub ref_id: Option<String>,
    #[serde(default)]
    pub category_id: Option<String>,
    #[serde(default)]
    pub item_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SubOptionItem {
    RawString(String),
    Object(SubOptionObj),
}

impl SubOptionItem {
    pub fn key(&self) -> String {
        match self {
            SubOptionItem::RawString(s) => s.clone(),
            SubOptionItem::Object(obj) => {
                obj.id.clone()
                    .or_else(|| obj.product_id.clone())
                    .unwrap_or_else(|| obj.name.clone())
            }
        }
    }

    pub fn name(&self) -> String {
        match self {
            SubOptionItem::RawString(s) => s.clone(),
            SubOptionItem::Object(obj) => obj.name.clone(),
        }
    }

    pub fn price(&self) -> Decimal {
        match self {
            SubOptionItem::RawString(_) => Decimal::ZERO,
            SubOptionItem::Object(obj) => obj.price.unwrap_or(Decimal::ZERO),
        }
    }

    pub fn product_id(&self) -> Option<String> {
        match self {
            SubOptionItem::RawString(_) => None,
            SubOptionItem::Object(obj) => obj.product_id.clone(),
        }
    }

    pub fn is_oos(&self) -> bool {
        match self {
            SubOptionItem::RawString(_) => false,
            SubOptionItem::Object(obj) => obj.is_out_of_stock.unwrap_or(false) || obj.is_oos.unwrap_or(false),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubOptionObj {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub price: Option<Decimal>,
    #[serde(default)]
    pub product_id: Option<String>,
    #[serde(default)]
    pub is_out_of_stock: Option<bool>,
    #[serde(default)]
    pub is_oos: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EligibilityRule {
    #[serde(default)]
    pub min_order_subtotal: Option<Decimal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuOption {
    pub id: String,
    pub name: String,
    pub price: Decimal,
    #[serde(default)]
    pub product_id: Option<String>,
    #[serde(default = "default_quantity")]
    pub quantity: u32,
    #[serde(default)]
    pub is_default: bool,
    #[serde(default)]
    pub is_out_of_stock: bool,
    #[serde(default)]
    pub out_of_stock_until: Option<String>,
    #[serde(default)]
    pub sub_options: Vec<SubOptionItem>,
    #[serde(default)]
    pub eligibility_rules: Vec<EligibilityRule>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub from_source: Option<bool>,
    #[serde(default)]
    pub is_locally_out_of_stock: Option<bool>,
    #[serde(default)]
    pub retail_price: Option<Decimal>,
    #[serde(default)]
    pub image_url: Option<String>,
}

fn default_quantity() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionGroup {
    pub id: String,
    pub name: String,
    #[serde(default = "default_scope")]
    pub scope: String, // "item" | "order"
    #[serde(default)]
    pub min_selection: u32,
    #[serde(default)]
    pub max_selection: u32,
    #[serde(default)]
    pub allow_repeats: bool,
    #[serde(default)]
    pub included: bool,
    #[serde(default)]
    pub auto_popup: Option<bool>,
    #[serde(default)]
    pub options: Vec<MenuOption>,
    #[serde(default)]
    pub sources: Vec<OptionSource>,
    #[serde(default)]
    pub labels: HashMap<String, String>,
    #[serde(default)]
    pub revision: i64,
    #[serde(default)]
    pub metadata: Option<serde_json::Value>,
    #[serde(default)]
    pub sort_order: Option<i64>,
}

fn default_scope() -> String {
    "item".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionCatalog {
    pub revision: Option<i64>,
    pub products: Vec<ProductRow>,
    pub categories: Vec<CategoryRow>,
    pub groups: Vec<OptionGroup>,
    pub links: Vec<ItemModifierLink>,
    #[serde(default)]
    pub category_links: Vec<CategoryModifierLink>,
}

// Errors
#[derive(Debug, thiserror::Error)]
pub enum DetailError {
    #[error("{0}")]
    General(String, u16),
}

impl DetailError {
    pub fn new(code: &str) -> Self {
        DetailError::General(code.to_string(), 400)
    }

    pub fn with_status(code: &str, status: u16) -> Self {
        DetailError::General(code.to_string(), status)
    }

    pub fn code(&self) -> &str {
        match self {
            DetailError::General(c, _) => c,
        }
    }

    pub fn status(&self) -> u16 {
        match self {
            DetailError::General(_, s) => *s,
        }
    }
}
