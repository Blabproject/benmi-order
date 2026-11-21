use printer_core::{
    PairedBluetoothDevicesResult, PrinterError, TestBluetoothConnectionResult,
};

#[cfg(not(target_os = "windows"))]
#[allow(unused_imports)]
use crate::printer_macos;
#[cfg(not(target_os = "macos"))]
#[allow(unused_imports)]
use crate::printer_windows;

pub fn current_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

pub fn get_paired_bluetooth_devices() -> Result<PairedBluetoothDevicesResult, PrinterError> {
    #[cfg(target_os = "windows")]
    {
        printer_windows::get_paired_bluetooth_devices()
    }
    #[cfg(target_os = "macos")]
    {
        printer_macos::get_paired_bluetooth_devices()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (printer_windows::SPOOLER_PREFIX, printer_macos::CUPS_PREFIX);
        Ok(PairedBluetoothDevicesResult {
            supported: false,
            enabled: false,
            devices: Vec::new(),
        })
    }
}

pub fn print_bluetooth(
    address: &str,
    payload: &[u8],
    is_tspl: bool,
    connect_timeout_ms: u32,
    write_timeout_ms: u32,
) -> Result<usize, PrinterError> {
    #[cfg(target_os = "windows")]
    {
        printer_windows::print_bluetooth(
            address,
            payload,
            is_tspl,
            connect_timeout_ms,
            write_timeout_ms,
        )
    }
    #[cfg(target_os = "macos")]
    {
        printer_macos::print_bluetooth(
            address,
            payload,
            is_tspl,
            connect_timeout_ms,
            write_timeout_ms,
        )
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (
            address,
            payload,
            is_tspl,
            connect_timeout_ms,
            write_timeout_ms,
            printer_windows::SPOOLER_PREFIX,
            printer_macos::CUPS_PREFIX,
        );
        Err(PrinterError::BluetoothUnavailable(
            "Local Bluetooth/USB printing is not implemented on this OS.".to_string(),
        ))
    }
}

pub fn test_bluetooth_connection(
    address: &str,
    connect_timeout_ms: u32,
) -> Result<TestBluetoothConnectionResult, PrinterError> {
    #[cfg(target_os = "windows")]
    {
        printer_windows::test_bluetooth_connection(address, connect_timeout_ms)
    }
    #[cfg(target_os = "macos")]
    {
        printer_macos::test_bluetooth_connection(address, connect_timeout_ms)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (address, connect_timeout_ms);
        Err(PrinterError::BluetoothUnavailable(
            "Local Bluetooth/USB testing is not implemented on this OS.".to_string(),
        ))
    }
}
