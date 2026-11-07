use pricing_core::{
    build_detail_round, project_option_rule, validate_option_graph, validate_unified_order_items,
    view, BuildRoundInput, DetailRound, OptionCatalog,
};
use serde::Deserialize;
use std::collections::HashMap;
use worker::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildRoundReq {
    catalog: OptionCatalog,
    input: BuildRoundInput,
    round_number: u32,
    #[serde(default)]
    previous_round: Option<DetailRound>,
    #[serde(default)]
    now_ms: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ValidateUnifiedReq {
    catalog: OptionCatalog,
    items: Vec<serde_json::Value>,
    #[serde(default)]
    now_ms: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ValidateGraphReq {
    catalog: OptionCatalog,
    #[serde(default)]
    now_ms: Option<i64>,
    #[serde(default)]
    project_product_ids: Option<Vec<String>>,
}

#[event(fetch)]
pub async fn main(mut req: Request, _env: Env, _ctx: Context) -> Result<Response> {
    let url = req.url()?;
    let path = url.path();
    let method = req.method();

    if method == Method::Get && (path == "/internal/v1/health" || path == "/health") {
        return Response::from_json(&serde_json::json!({
            "status": "ok",
            "engine": "rust",
            "service": "benmi-pricing-rs",
            "version": "0.1.0"
        }));
    }

    if method == Method::Post && path == "/internal/v1/build-detail-round" {
        let payload: BuildRoundReq = match req.json().await {
            Ok(p) => p,
            Err(e) => return Response::error(format!("INVALID_JSON: {}", e), 400),
        };

        let now_ms = payload.now_ms.unwrap_or_else(|| Date::now().as_millis() as i64);

        if payload.input.appended_total.is_none() && payload.input.new_total.is_none() && payload.input.total.is_none() {
            return Response::from_json(&serde_json::json!({
                "success": false,
                "error": "ORDER_PRICE_CHANGED",
                "code": "ORDER_PRICE_CHANGED",
                "status": 409
            }));
        }

        match build_detail_round(
            &payload.catalog,
            &payload.input,
            payload.round_number,
            payload.previous_round.as_ref(),
            now_ms,
        ) {
            Ok(round) => {
                let snapshot = pricing_core::OrderDetailSnapshot {
                    schema_version: 1,
                    rounds: vec![round.clone()],
                    total: round.total,
                };
                let lines = view::lines(&snapshot);
                return Response::from_json(&serde_json::json!({
                    "success": true,
                    "round": round,
                    "lines": lines
                }));
            }
            Err(e) => {
                let status = e.status();
                let code = e.code().to_string();
                let mut resp = Response::from_json(&serde_json::json!({
                    "success": false,
                    "code": code,
                    "error": code
                }))?;
                resp = resp.with_status(status);
                return Ok(resp);
            }
        }
    }

    if method == Method::Post && path == "/internal/v1/validate-unified-items" {
        let payload: ValidateUnifiedReq = match req.json().await {
            Ok(p) => p,
            Err(e) => return Response::error(format!("INVALID_JSON: {}", e), 400),
        };

        let now_ms = payload.now_ms.unwrap_or_else(|| Date::now().as_millis() as i64);
        let result = validate_unified_order_items(&payload.catalog, &payload.items, now_ms);
        return Response::from_json(&result);
    }

    if method == Method::Post && path == "/internal/v1/validate-catalog-graph" {
        let payload: ValidateGraphReq = match req.json().await {
            Ok(p) => p,
            Err(e) => return Response::error(format!("INVALID_JSON: {}", e), 400),
        };

        let now_ms = payload.now_ms.unwrap_or_else(|| Date::now().as_millis() as i64);

        if let Err(e) = validate_option_graph(&payload.catalog, now_ms) {
            let mut resp = Response::from_json(&serde_json::json!({
                "valid": false,
                "code": e.code(),
                "error": e.code()
            }))?;
            resp = resp.with_status(e.status());
            return Ok(resp);
        }

        let mut projected_rules = HashMap::new();
        if let Some(product_ids) = payload.project_product_ids {
            for pid in product_ids {
                if let Ok(Some(rule)) = project_option_rule(&payload.catalog, &pid, &[], &[], now_ms) {
                    projected_rules.insert(pid, rule);
                }
            }
        }

        return Response::from_json(&serde_json::json!({
            "valid": true,
            "projectedRules": projected_rules
        }));
    }

    Response::error("Not Found", 404)
}
