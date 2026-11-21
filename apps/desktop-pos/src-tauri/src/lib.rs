mod commands;
mod printer_macos;
mod printer_os;
mod printer_windows;

use tauri::{WebviewUrl, WebviewWindowBuilder};

const CAPACITOR_BRIDGE_TEMPLATE: &str = include_str!("capacitor_bridge.js");

pub fn resolve_remote_pos_url() -> Option<String> {
    if let Ok(custom_url) = std::env::var("BENMI_POS_URL") {
        let trimmed = custom_url.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    let runtime_env = std::env::var("BENMI_APP_ENV").ok();
    let app_env = runtime_env
        .as_deref()
        .or(option_env!("APP_ENV"))
        .unwrap_or("prod");

    match app_env {
        "dev" => Some("https://dev.benmi-order.pages.dev/orders.html".to_string()),
        "staging" => Some("https://staging.benmi-order.pages.dev/orders.html".to_string()),
        "dev-local" | "pilot" | "local" => None,
        _ => Some("https://pos.blabfood.app".to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let bridge_script =
        CAPACITOR_BRIDGE_TEMPLATE.replace("__DESKTOP_PLATFORM__", printer_os::current_platform());

    tauri::Builder::default()
        .setup(move |app| {
            // In remote mode, launch through boot.html first so a cold-booted POS
            // waiting on router Wi-Fi auto-retries instead of sticking on a blank page.
            let initial_page = if resolve_remote_pos_url().is_some() {
                WebviewUrl::App("boot.html".into())
            } else {
                WebviewUrl::App("index.html".into())
            };

            WebviewWindowBuilder::new(app, "main", initial_page)
                .title("Blab POS")
                .inner_size(1280.0, 800.0)
                .min_inner_size(1024.0, 680.0)
                .maximized(true)
                .initialization_script(&bridge_script)
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_boot_config,
            commands::probe_remote_reachable,
            commands::print_tcp,
            commands::print_bitmap,
            commands::test_connection,
            commands::get_paired_bluetooth_devices,
            commands::print_bluetooth,
            commands::test_bluetooth_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Blab POS Desktop application");
}
