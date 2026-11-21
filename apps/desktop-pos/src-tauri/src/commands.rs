use printer_core::{
    bounded_timeout_ms, decode_base64_bytes, print_tcp as core_print_tcp, test_tcp_connection,
    BitmapRenderParams, PairedBluetoothDevicesResult, PrintBluetoothResult, PrintTcpResult,
    PrinterError, StructuredPrinterError, TestBluetoothConnectionResult, TestConnectionResult,
};
use serde::{Deserialize, Serialize};
use tauri::Url;

use crate::{printer_os, resolve_remote_pos_url};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootConfig {
    pub target_url: Option<String>,
    pub platform: &'static str,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintTcpRequest {
    pub ip: String,
    #[serde(default = "default_port")]
    pub port: u16,
    pub data: String,
    pub timeout_ms: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintBitmapRequest {
    pub ip: String,
    #[serde(default = "default_port")]
    pub port: u16,
    pub timeout_ms: Option<u32>,
    #[serde(flatten)]
    pub bitmap: BitmapRenderParams,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionRequest {
    pub ip: String,
    #[serde(default = "default_port")]
    pub port: u16,
    pub timeout_ms: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintBluetoothRequest {
    pub mac_address: String,
    pub base64_image: Option<String>,
    pub data: Option<String>,
    #[serde(default = "default_protocol")]
    pub protocol: String,
    #[serde(default = "default_paper_width")]
    pub paper_width: u32,
    #[serde(default = "default_auto_cut")]
    pub auto_cut: bool,
    #[serde(default = "default_feed_before_cut_mm")]
    pub feed_before_cut_mm: f64,
    #[serde(default = "default_label_width_mm")]
    pub label_width_mm: u32,
    #[serde(default = "default_label_height_mm")]
    pub label_height_mm: u32,
    #[serde(default = "default_dpi")]
    pub dpi: u32,
    #[serde(default)]
    pub x_offset_mm: f64,
    #[serde(default)]
    pub y_offset_mm: f64,
    pub connect_timeout_ms: Option<u32>,
    pub write_idle_timeout_ms: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestBluetoothConnectionRequest {
    pub mac_address: String,
    pub connect_timeout_ms: Option<u32>,
}

fn default_port() -> u16 {
    9100
}
fn default_protocol() -> String {
    "esc_pos".to_string()
}
fn default_paper_width() -> u32 {
    80
}
fn default_auto_cut() -> bool {
    true
}
fn default_feed_before_cut_mm() -> f64 {
    80.0
}
fn default_label_width_mm() -> u32 {
    100
}
fn default_label_height_mm() -> u32 {
    150
}
fn default_dpi() -> u32 {
    203
}

fn map_err(err: PrinterError) -> StructuredPrinterError {
    StructuredPrinterError::from(err)
}

#[tauri::command]
pub fn get_boot_config() -> BootConfig {
    BootConfig {
        target_url: resolve_remote_pos_url(),
        platform: printer_os::current_platform(),
    }
}

#[tauri::command]
pub async fn probe_remote_reachable(url: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        let Ok(parsed) = Url::parse(url.trim()) else {
            return false;
        };
        let Some(host) = parsed.host_str() else {
            return false;
        };
        let port = parsed.port_or_known_default().unwrap_or(443);
        test_tcp_connection(host, port, 2500).is_ok()
    })
    .await
    .unwrap_or(false)
}

#[tauri::command]
pub async fn print_tcp(request: PrintTcpRequest) -> Result<PrintTcpResult, StructuredPrinterError> {
    tauri::async_runtime::spawn_blocking(move || {
        let ip = request.ip.trim().to_string();
        if ip.is_empty() || request.data.trim().is_empty() {
            return Err(map_err(PrinterError::InvalidInput(
                "IP address and base64 print data are required.".to_string(),
            )));
        }
        let raw_bytes = decode_base64_bytes(&request.data).map_err(map_err)?;
        let timeout_ms = request.timeout_ms.unwrap_or(4000);
        let bytes_written =
            core_print_tcp(&ip, request.port, &raw_bytes, timeout_ms).map_err(map_err)?;
        Ok(PrintTcpResult {
            success: true,
            ip,
            protocol: None,
            bytes_written,
        })
    })
    .await
    .map_err(|e| map_err(PrinterError::TcpWrite(e.to_string())))?
}

#[tauri::command]
pub async fn print_bitmap(
    request: PrintBitmapRequest,
) -> Result<PrintTcpResult, StructuredPrinterError> {
    tauri::async_runtime::spawn_blocking(move || {
        let ip = request.ip.trim().to_string();
        if ip.is_empty() || request.bitmap.base64_image.trim().is_empty() {
            return Err(map_err(PrinterError::InvalidInput(
                "IP address and base64 image data are required.".to_string(),
            )));
        }
        let print_bytes = request.bitmap.render_bytes().map_err(map_err)?;
        let timeout_ms = request.timeout_ms.unwrap_or(5000);
        let bytes_written =
            core_print_tcp(&ip, request.port, &print_bytes, timeout_ms).map_err(map_err)?;
        Ok(PrintTcpResult {
            success: true,
            ip,
            protocol: Some(request.bitmap.protocol),
            bytes_written,
        })
    })
    .await
    .map_err(|e| map_err(PrinterError::TcpWrite(e.to_string())))?
}

#[tauri::command]
pub async fn test_connection(
    request: TestConnectionRequest,
) -> Result<TestConnectionResult, StructuredPrinterError> {
    tauri::async_runtime::spawn_blocking(move || {
        let ip = request.ip.trim().to_string();
        if ip.is_empty() {
            return Err(map_err(PrinterError::InvalidInput(
                "Printer IP is required.".to_string(),
            )));
        }
        let timeout_ms = request.timeout_ms.unwrap_or(2000);
        test_tcp_connection(&ip, request.port, timeout_ms).map_err(map_err)?;
        Ok(TestConnectionResult {
            success: true,
            ip,
            port: request.port,
        })
    })
    .await
    .map_err(|e| map_err(PrinterError::TcpConnect(e.to_string())))?
}

#[tauri::command]
pub async fn get_paired_bluetooth_devices(
) -> Result<PairedBluetoothDevicesResult, StructuredPrinterError> {
    tauri::async_runtime::spawn_blocking(move || {
        printer_os::get_paired_bluetooth_devices().map_err(map_err)
    })
    .await
    .map_err(|e| map_err(PrinterError::BluetoothUnavailable(e.to_string())))?
}

#[tauri::command]
pub async fn print_bluetooth(
    request: PrintBluetoothRequest,
) -> Result<PrintBluetoothResult, StructuredPrinterError> {
    tauri::async_runtime::spawn_blocking(move || {
        let mac_address = request.mac_address.trim().to_string();
        if mac_address.is_empty() {
            return Err(map_err(PrinterError::InvalidInput(
                "Bluetooth/USB printer address is required.".to_string(),
            )));
        }

        let has_image = request
            .base64_image
            .as_deref()
            .is_some_and(|s| !s.trim().is_empty());
        let has_data = request
            .data
            .as_deref()
            .is_some_and(|s| !s.trim().is_empty());

        if !has_image && !has_data {
            return Err(map_err(PrinterError::InvalidInput(
                "Either base64Image or base64 data must be provided.".to_string(),
            )));
        }

        let is_tspl = request.protocol.eq_ignore_ascii_case("tspl");
        let print_bytes = if let Some(b64_img) =
            request.base64_image.filter(|s| !s.trim().is_empty())
        {
            let params = BitmapRenderParams {
                base64_image: b64_img,
                protocol: request.protocol,
                paper_width: request.paper_width,
                auto_cut: request.auto_cut,
                feed_before_cut_mm: request.feed_before_cut_mm,
                label_width_mm: request.label_width_mm,
                label_height_mm: request.label_height_mm,
                dpi: request.dpi,
                x_offset_mm: request.x_offset_mm,
                y_offset_mm: request.y_offset_mm,
            };
            params.render_bytes().map_err(map_err)?
        } else {
            decode_base64_bytes(request.data.as_deref().unwrap_or("")).map_err(map_err)?
        };

        let connect_timeout_ms = bounded_timeout_ms(request.connect_timeout_ms, 8000);
        let write_timeout_ms = bounded_timeout_ms(request.write_idle_timeout_ms, 10000);

        let bytes_written = printer_os::print_bluetooth(
            &mac_address,
            &print_bytes,
            is_tspl,
            connect_timeout_ms,
            write_timeout_ms,
        )
        .map_err(map_err)?;

        Ok(PrintBluetoothResult {
            success: true,
            mac_address,
            bytes_written,
        })
    })
    .await
    .map_err(|e| map_err(PrinterError::BluetoothSendUncertain(e.to_string())))?
}

#[tauri::command]
pub async fn test_bluetooth_connection(
    request: TestBluetoothConnectionRequest,
) -> Result<TestBluetoothConnectionResult, StructuredPrinterError> {
    tauri::async_runtime::spawn_blocking(move || {
        let mac_address = request.mac_address.trim().to_string();
        if mac_address.is_empty() {
            return Err(map_err(PrinterError::InvalidInput(
                "Bluetooth/USB printer address is required.".to_string(),
            )));
        }
        let connect_timeout_ms = bounded_timeout_ms(request.connect_timeout_ms, 8000);
        printer_os::test_bluetooth_connection(&mac_address, connect_timeout_ms).map_err(map_err)
    })
    .await
    .map_err(|e| map_err(PrinterError::BluetoothConnectFailed(e.to_string())))?
}
