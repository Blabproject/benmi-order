use crate::types::*;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

pub fn choice_text(choice: &DetailChoice) -> String {
    let mut children: Vec<String> = choice.groups.iter()
        .flat_map(|g| g.items.iter().map(choice_text))
        .collect();
    let subs: Vec<String> = choice.sub_options.iter().map(|s| s.name.clone()).collect();
    children.extend(subs);

    let mut out = choice.name.clone();
    if choice.quantity > 1 {
        out.push_str(&format!(" ×{}", choice.quantity));
    }
    if !children.is_empty() {
        out.push_str(&format!(" ({})", children.join("、")));
    }
    out
}

pub fn extra(choice: &DetailChoice) -> Decimal {
    let sub_sum: Decimal = choice.sub_options.iter().map(|s| s.price).sum();
    let group_sum: Decimal = choice.groups.iter()
        .flat_map(|g| g.items.iter().map(extra))
        .sum();
    (choice.surcharge + sub_sum + group_sum) * Decimal::from(choice.quantity)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlattenedChoice {
    pub group_id: String,
    pub option_id: String,
    pub label: String,
    pub value: String,
    pub price: Decimal,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub choice: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub round_number: Option<u32>,
}

pub fn choices(groups: &[DetailGroup]) -> Vec<FlattenedChoice> {
    groups.iter().flat_map(|g| {
        g.items.iter().map(move |c| {
            FlattenedChoice {
                group_id: g.group_id.clone(),
                option_id: c.option_id.clone(),
                label: g.group_name.clone(),
                value: choice_text(c),
                price: extra(c),
                choice: None,
                round_number: None,
            }
        })
    }).collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewLine {
    pub line_id: String,
    pub item_id: String,
    pub name: String,
    pub category: String,
    pub quantity: u32,
    pub price: Decimal,
    pub unit_price: Decimal,
    pub subtotal: Decimal,
    pub note: String,
    pub notes: String,
    pub options: Vec<FlattenedChoice>,
    pub selected_options: String,
    pub round_number: u32,
    pub detail_line: DetailLine,
}

pub fn lines(snapshot: &OrderDetailSnapshot) -> Vec<ViewLine> {
    snapshot.rounds.iter().flat_map(|round| {
        round.items.iter().map(move |item| {
            let options: Vec<FlattenedChoice> = item.portions.iter().flat_map(|p| {
                choices(&p.groups).into_iter().map(move |mut c| {
                    let prefix = if item.quantity > 1 {
                        format!("第{}份: ", p.portion_index + 1)
                    } else {
                        String::new()
                    };
                    c.choice = Some(format!("{}{}: {}", prefix, c.label, c.value));
                    c
                })
            }).collect();

            let mut notes_vec: Vec<String> = item.portions.iter()
                .filter(|p| !p.note.is_empty())
                .map(|p| {
                    if item.quantity > 1 {
                        format!("第{}份: {}", p.portion_index + 1, p.note)
                    } else {
                        p.note.clone()
                    }
                })
                .collect();

            if !item.note.is_empty() {
                notes_vec.insert(0, item.note.clone());
            }

            let note_str = notes_vec.join("\n");
            let selected_options = serde_json::to_string(&options).unwrap_or_else(|_| "[]".to_string());

            ViewLine {
                line_id: item.line_id.clone(),
                item_id: item.item_id.clone(),
                name: item.name.clone(),
                category: item.category.clone(),
                quantity: item.quantity,
                price: item.unit_price,
                unit_price: item.unit_price,
                subtotal: item.subtotal,
                note: note_str.clone(),
                notes: note_str,
                options,
                selected_options,
                round_number: round.round_number,
                detail_line: item.clone(),
            }
        })
    }).collect()
}

pub fn global_choices(snapshot: &OrderDetailSnapshot) -> Vec<FlattenedChoice> {
    snapshot.rounds.iter().flat_map(|r| {
        choices(&r.groups).into_iter().map(move |mut c| {
            c.round_number = Some(r.round_number);
            let prefix = if snapshot.rounds.len() > 1 {
                format!("[第{}輪] ", r.round_number)
            } else {
                String::new()
            };
            c.label = format!("{}{}", prefix, c.label);
            c
        })
    }).collect()
}

pub fn notes(snapshot: &OrderDetailSnapshot) -> String {
    snapshot.rounds.iter()
        .filter(|r| !r.note.is_empty())
        .map(|r| {
            if snapshot.rounds.len() > 1 {
                format!("[第{}輪] {}", r.round_number, r.note)
            } else {
                r.note.clone()
            }
        })
        .collect::<Vec<String>>()
        .join("\n")
}

pub fn text(snapshot: &OrderDetailSnapshot) -> String {
    snapshot.rounds.iter().map(|r| {
        if let Some(legacy) = &r.legacy_content {
            return legacy.clone();
        }
        let mut out = Vec::new();
        if snapshot.rounds.len() > 1 {
            out.push(format!("[第{}輪]", r.round_number));
        }
        for c in choices(&r.groups) {
            out.push(format!("{}: {}", c.label, c.value));
        }

        let temp_snapshot = OrderDetailSnapshot {
            schema_version: 1,
            rounds: vec![r.clone()],
            total: r.total,
        };

        for i in lines(&temp_snapshot) {
            out.push(format!("{}份 x {}", i.quantity, i.name));
            for o in &i.options {
                let choice_str = o.choice.as_deref().unwrap_or("");
                let price_suffix = if o.price > Decimal::ZERO {
                    format!(" (+${})", o.price)
                } else {
                    String::new()
                };
                out.push(format!("  - {}{}", choice_str, price_suffix));
            }
            if !i.note.is_empty() {
                out.push(format!("  - 備註: {}", i.note));
            }
        }

        if !r.note.is_empty() {
            out.push(format!("顧客備註: {}", r.note));
        }

        out.join("\n")
    }).collect::<Vec<String>>().join("\n\n")
}
