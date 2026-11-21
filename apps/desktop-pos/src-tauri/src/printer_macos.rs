use printer_core::{
    BluetoothDeviceInfo, PairedBluetoothDevicesResult, PrinterError, TestBluetoothConnectionResult,
};

pub const CUPS_PREFIX: &str = "cups:";

pub fn parse_cups_queue_name(address: &str) -> Option<&str> {
    address
        .trim()
        .strip_prefix(CUPS_PREFIX)
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

pub fn parse_lpstat_queues(stdout: &str) -> Vec<BluetoothDeviceInfo> {
    stdout
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            let rest = trimmed.strip_prefix("printer ")?;
            let queue = rest.split_whitespace().next()?.trim();
            if queue.is_empty() {
                return None;
            }
            Some(BluetoothDeviceInfo {
                name: format!("[USB/System] {queue}"),
                address: format!("{CUPS_PREFIX}{queue}"),
                device_type: 2,
            })
        })
        .collect()
}

pub fn is_printable_cu_device(name: &str) -> bool {
    name.starts_with("cu.")
        && name != "cu.Bluetooth-Incoming-Port"
        && name != "cu.debug-console"
        && !name.starts_with("cu.wlan-debug")
}

#[cfg(target_os = "macos")]
pub fn get_paired_bluetooth_devices() -> Result<PairedBluetoothDevicesResult, PrinterError> {
    imp::get_paired_bluetooth_devices()
}

#[cfg(target_os = "macos")]
pub fn print_bluetooth(
    address: &str,
    payload: &[u8],
    is_tspl: bool,
    connect_timeout_ms: u32,
    write_timeout_ms: u32,
) -> Result<usize, PrinterError> {
    imp::print_bluetooth(
        address,
        payload,
        is_tspl,
        connect_timeout_ms,
        write_timeout_ms,
    )
}

#[cfg(target_os = "macos")]
pub fn test_bluetooth_connection(
    address: &str,
    connect_timeout_ms: u32,
) -> Result<TestBluetoothConnectionResult, PrinterError> {
    imp::test_bluetooth_connection(address, connect_timeout_ms)
}

#[cfg(target_os = "macos")]
mod imp {
    use super::*;
    use printer_core::{send_bluetooth_stream, GLOBAL_BT_LOCK};
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::path::Path;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    fn list_cups_printers() -> Vec<BluetoothDeviceInfo> {
        let Ok(out) = Command::new("lpstat").arg("-p").output() else {
            return Vec::new();
        };
        if !out.status.success() {
            return Vec::new();
        }
        parse_lpstat_queues(&String::from_utf8_lossy(&out.stdout))
    }

    fn list_serial_devices() -> Vec<BluetoothDeviceInfo> {
        let Ok(entries) = fs::read_dir("/dev") else {
            return Vec::new();
        };
        let mut out = Vec::new();
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if is_printable_cu_device(&file_name) {
                let label = file_name.strip_prefix("cu.").unwrap_or(&file_name);
                out.push(BluetoothDeviceInfo {
                    name: format!("[Serial/BT] {label}"),
                    address: format!("/dev/{file_name}"),
                    device_type: 1,
                });
            }
        }
        out.sort_by(|a, b| a.name.cmp(&b.name));
        out
    }

    fn print_cups_raw(
        queue: &str,
        payload: &[u8],
        timeout_ms: u32,
    ) -> Result<usize, PrinterError> {
        let mut child = Command::new("lp")
            .args(["-d", queue, "-o", "raw", "-"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| PrinterError::BluetoothConnectFailed(format!("lp({queue}): {e}")))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(payload)
                .map_err(|e| PrinterError::BluetoothSendUncertain(format!("lp stdin: {e}")))?;
        }

        let deadline = Instant::now() + Duration::from_millis(u64::from(timeout_ms.max(2000)));
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    if status.success() {
                        return Ok(payload.len());
                    }
                    let output = child.wait_with_output().ok();
                    let stderr = output
                        .map(|o| String::from_utf8_lossy(&o.stderr).trim().to_string())
                        .unwrap_or_default();
                    return Err(PrinterError::BluetoothSendUncertain(format!(
                        "lp({queue}) exited with {status}: {stderr}"
                    )));
                }
                Ok(None) => {
                    if Instant::now() >= deadline {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(PrinterError::BluetoothSendUncertain(format!(
                            "lp({queue}) timed out after {timeout_ms}ms"
                        )));
                    }
                    std::thread::sleep(Duration::from_millis(25));
                }
                Err(e) => {
                    return Err(PrinterError::BluetoothSendUncertain(e.to_string()));
                }
            }
        }
    }

    pub fn get_paired_bluetooth_devices() -> Result<PairedBluetoothDevicesResult, PrinterError> {
        let mut devices = list_cups_printers();
        devices.extend(list_serial_devices());
        Ok(PairedBluetoothDevicesResult {
            supported: true,
            enabled: true,
            devices,
        })
    }

    pub fn print_bluetooth(
        address: &str,
        payload: &[u8],
        is_tspl: bool,
        _connect_timeout_ms: u32,
        write_timeout_ms: u32,
    ) -> Result<usize, PrinterError> {
        let _guard = GLOBAL_BT_LOCK.try_acquire()?;
        let trimmed = address.trim();

        if let Some(queue) = parse_cups_queue_name(trimmed) {
            return print_cups_raw(queue, payload, write_timeout_ms);
        }

        if !trimmed.starts_with("/dev/cu.") {
            return Err(PrinterError::InvalidInput(format!(
                "Unsupported macOS printer address '{trimmed}'. Select a [USB/System] or [Serial/BT] printer."
            )));
        }

        let mut file = OpenOptions::new()
            .write(true)
            .open(Path::new(trimmed))
            .map_err(|e| PrinterError::BluetoothConnectFailed(format!("{trimmed}: {e}")))?;

        send_bluetooth_stream(&mut file, payload, is_tspl, std::thread::sleep)
    }

    pub fn test_bluetooth_connection(
        address: &str,
        _connect_timeout_ms: u32,
    ) -> Result<TestBluetoothConnectionResult, PrinterError> {
        let _guard = GLOBAL_BT_LOCK.try_acquire()?;
        let trimmed = address.trim();

        if let Some(queue) = parse_cups_queue_name(trimmed) {
            let exists = list_cups_printers()
                .iter()
                .any(|d| d.address == format!("{CUPS_PREFIX}{queue}"));
            if !exists {
                return Err(PrinterError::BluetoothConnectFailed(format!(
                    "CUPS printer '{queue}' not found."
                )));
            }
            return Ok(TestBluetoothConnectionResult {
                success: true,
                mac_address: trimmed.to_string(),
                device_name: queue.to_string(),
            });
        }

        if !trimmed.starts_with("/dev/cu.") || !Path::new(trimmed).exists() {
            return Err(PrinterError::BluetoothConnectFailed(format!(
                "Serial/Bluetooth device not found: {trimmed}"
            )));
        }

        let _file = OpenOptions::new()
            .write(true)
            .open(Path::new(trimmed))
            .map_err(|e| PrinterError::BluetoothConnectFailed(format!("{trimmed}: {e}")))?;

        Ok(TestBluetoothConnectionResult {
            success: true,
            mac_address: trimmed.to_string(),
            device_name: trimmed
                .strip_prefix("/dev/cu.")
                .unwrap_or(trimmed)
                .to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_lpstat_output_lines() {
        let sample = "\
printer Xprinter_XP_80C is idle.  enabled since Sun Nov 22 02:00:00 2026
printer Star_TSP100 now printing Star_TSP100-12.  enabled since Sat Nov 21 10:00:00 2026
";
        let list = parse_lpstat_queues(sample);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].address, "cups:Xprinter_XP_80C");
        assert_eq!(list[1].address, "cups:Star_TSP100");
    }

    #[test]
    fn filters_system_non_printer_cu_devices() {
        assert!(!is_printable_cu_device("cu.Bluetooth-Incoming-Port"));
        assert!(!is_printable_cu_device("cu.debug-console"));
        assert!(is_printable_cu_device("cu.Xprinter-SerialPort"));
        assert!(is_printable_cu_device("cu.usbserial-1410"));
    }
}
