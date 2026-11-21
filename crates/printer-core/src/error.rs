use serde::Serialize;
use thiserror::Error;

/// Unified error type across Windows Tauri and Android JNI bridges.
///
/// Error codes match `ThermalPrinterPlugin.java` so `js/printer-service.js`
/// handles retries, busy states, and uncertain sends identically on all OSes.
#[derive(Debug, Error)]
pub enum PrinterError {
    #[error("{0}")]
    InvalidInput(String),

    #[error("Failed to decode base64 payload: {0}")]
    Base64Decode(String),

    #[error("Failed to decode image into bitmap: {0}")]
    ImageDecode(String),

    #[error("Connection failed to {0}")]
    TcpConnect(String),

    #[error("Failed to print to {0}")]
    TcpWrite(String),

    #[error("Printer queue busy; no data sent")]
    BluetoothBusy,

    #[error("Bluetooth adapter is not available or disabled: {0}")]
    BluetoothUnavailable(String),

    #[error("Bluetooth connection failed: {0}")]
    BluetoothConnectFailed(String),

    #[error("Bluetooth print failed: {0}")]
    BluetoothSendUncertain(String),
}

impl PrinterError {
    /// Stable machine-readable error code aligned with Android `ThermalPrinterPlugin`.
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidInput(_) => "INVALID_INPUT",
            Self::Base64Decode(_) => "BASE64_DECODE_FAILED",
            Self::ImageDecode(_) => "IMAGE_DECODE_FAILED",
            Self::TcpConnect(_) => "TCP_CONNECT_FAILED",
            Self::TcpWrite(_) => "TCP_WRITE_FAILED",
            Self::BluetoothBusy => "BLUETOOTH_CONNECT_BUSY",
            Self::BluetoothUnavailable(_) => "BLUETOOTH_UNAVAILABLE",
            Self::BluetoothConnectFailed(_) => "BLUETOOTH_CONNECT_FAILED",
            Self::BluetoothSendUncertain(_) => "BLUETOOTH_SEND_UNCERTAIN",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredPrinterError {
    pub code: &'static str,
    pub message: String,
}

impl From<PrinterError> for StructuredPrinterError {
    fn from(err: PrinterError) -> Self {
        Self {
            code: err.code(),
            message: err.to_string(),
        }
    }
}
