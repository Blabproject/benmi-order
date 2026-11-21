use printer_core::PrinterError;
#[cfg(windows)]
use printer_core::{PairedBluetoothDevicesResult, TestBluetoothConnectionResult};

pub const SPOOLER_PREFIX: &str = "spooler:";

/// Parses a `AA:BB:CC:DD:EE:FF` (or `AA-BB-...`) MAC address into Windows `BTH_ADDR` (`u64`).
#[cfg_attr(not(windows), allow(dead_code))]
pub fn parse_mac_to_bth_addr(mac: &str) -> Result<u64, PrinterError> {
    let cleaned: String = mac
        .trim()
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .collect();
    if cleaned.len() != 12 {
        return Err(PrinterError::InvalidInput(format!(
            "Invalid Bluetooth MAC address: {mac}"
        )));
    }
    let mut bytes = [0_u8; 6];
    for (i, slot) in bytes.iter_mut().enumerate() {
        let start = i * 2;
        *slot = u8::from_str_radix(&cleaned[start..start + 2], 16)
            .map_err(|_| PrinterError::InvalidInput(format!("Invalid MAC byte in: {mac}")))?;
    }
    Ok(u64::from_be_bytes([
        0, 0, bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5],
    ]))
}

/// Formats Windows little-endian `BLUETOOTH_ADDRESS.rgBytes` into uppercase `AA:BB:CC:DD:EE:FF`.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn format_mac_from_rg_bytes(rg_bytes: [u8; 6]) -> String {
    format!(
        "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
        rg_bytes[5], rg_bytes[4], rg_bytes[3], rg_bytes[2], rg_bytes[1], rg_bytes[0]
    )
}

/// Checks whether a Bluetooth/Serial address refers to a Windows Virtual COM port (`COM3`, `COM12`, etc.).
#[cfg_attr(not(windows), allow(dead_code))]
pub fn normalize_com_port_name(address: &str) -> Option<String> {
    let trimmed = address.trim();
    let upper = trimmed.to_ascii_uppercase();
    let stripped = upper.strip_prefix(r"\\.\").unwrap_or(&upper);
    if let Some(rest) = stripped.strip_prefix("COM") {
        if !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()) {
            return Some(format!(r"\\.\{stripped}"));
        }
    }
    None
}

/// Checks whether an address targets a Windows Print Spooler USB/System printer (`spooler:<Name>`).
#[cfg_attr(not(windows), allow(dead_code))]
pub fn parse_spooler_name(address: &str) -> Option<&str> {
    address
        .trim()
        .strip_prefix(SPOOLER_PREFIX)
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

#[cfg(windows)]
pub fn get_paired_bluetooth_devices() -> Result<PairedBluetoothDevicesResult, PrinterError> {
    imp::get_paired_bluetooth_devices()
}

#[cfg(windows)]
pub fn print_bluetooth(
    mac_address: &str,
    payload: &[u8],
    is_tspl: bool,
    connect_timeout_ms: u32,
    write_timeout_ms: u32,
) -> Result<usize, PrinterError> {
    imp::print_bluetooth(
        mac_address,
        payload,
        is_tspl,
        connect_timeout_ms,
        write_timeout_ms,
    )
}

#[cfg(windows)]
pub fn test_bluetooth_connection(
    mac_address: &str,
    connect_timeout_ms: u32,
) -> Result<TestBluetoothConnectionResult, PrinterError> {
    imp::test_bluetooth_connection(mac_address, connect_timeout_ms)
}

#[cfg(windows)]
mod imp {
    use super::*;
    use printer_core::{send_bluetooth_stream, BluetoothDeviceInfo, GLOBAL_BT_LOCK};
    use std::io::{self, Write};
    use std::mem::size_of;
    use std::ptr::addr_of;
    use std::time::Duration;
    use windows::core::{GUID, PCWSTR, PWSTR};
    use windows::Win32::Devices::Bluetooth::{
        BluetoothFindDeviceClose, BluetoothFindFirstDevice, BluetoothFindFirstRadio,
        BluetoothFindNextDevice, BluetoothFindRadioClose, BluetoothGetRadioInfo, AF_BTH,
        BLUETOOTH_DEVICE_INFO, BLUETOOTH_DEVICE_SEARCH_PARAMS, BLUETOOTH_FIND_RADIO_PARAMS,
        BLUETOOTH_RADIO_INFO, BTHPROTO_RFCOMM, SOCKADDR_BTH,
    };
    use windows::Win32::Devices::Communication::{SetCommTimeouts, COMMTIMEOUTS};
    use windows::Win32::Foundation::{
        CloseHandle, GENERIC_WRITE, HANDLE, INVALID_HANDLE_VALUE,
    };
    use windows::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, OpenPrinterW, StartDocPrinterW,
        StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL,
        PRINTER_INFO_4W,
    };
    use windows::Win32::Networking::WinSock::{
        closesocket, connect, getsockopt, ioctlsocket, select, send, setsockopt, socket,
        WSACleanup, WSAGetLastError, WSAStartup, FD_SET, FIONBIO, SOCKET, SOCKET_ERROR,
        SOCK_STREAM, SOL_SOCKET, SO_ERROR, SO_SNDTIMEO, TIMEVAL, WSADATA,
    };
    use windows::Win32::Storage::FileSystem::{
        CreateFileW, WriteFile, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_NONE, OPEN_EXISTING,
    };

    const SPP_UUID: GUID = GUID::from_u128(0x00001101_0000_1000_8000_00805F9B34FB);

    struct WsaSession;
    impl WsaSession {
        fn start() -> Result<Self, PrinterError> {
            let mut data = WSADATA::default();
            let rc = unsafe { WSAStartup(0x0202, &mut data) };
            if rc != 0 {
                return Err(PrinterError::BluetoothUnavailable(format!(
                    "WSAStartup failed with code {rc}"
                )));
            }
            Ok(Self)
        }
    }
    impl Drop for WsaSession {
        fn drop(&mut self) {
            unsafe {
                WSACleanup();
            }
        }
    }

    struct RfcommSocket {
        _wsa: WsaSession,
        sock: SOCKET,
    }

    impl RfcommSocket {
        fn connect(
            bth_addr: u64,
            timeout_ms: u32,
            write_timeout_ms: u32,
        ) -> Result<Self, PrinterError> {
            let wsa = WsaSession::start()?;
            let mut last_err = String::from("RFCOMM connect failed");

            // Attempt 0: SDP service UUID lookup (port = 0)
            // Attempt 1: Fallback RFCOMM channel 1 (mirrors Android createRfcommSocket(1))
            for attempt in 0..2 {
                if attempt == 1 {
                    std::thread::sleep(Duration::from_millis(750));
                }
                let sock = match unsafe { socket(i32::from(AF_BTH), SOCK_STREAM, BTHPROTO_RFCOMM as i32) } {
                    Ok(s) => s,
                    Err(e) => {
                        last_err = format!("socket() failed: {e}");
                        continue;
                    }
                };

                let mut nonblocking: u32 = 1;
                if unsafe { ioctlsocket(sock, FIONBIO, &mut nonblocking) } == SOCKET_ERROR {
                    last_err = format!("ioctlsocket(FIONBIO) failed: {}", unsafe {
                        WSAGetLastError().0
                    });
                    unsafe { closesocket(sock) };
                    continue;
                }

                let addr = SOCKADDR_BTH {
                    addressFamily: AF_BTH,
                    btAddr: bth_addr,
                    serviceClassId: if attempt == 0 {
                        SPP_UUID
                    } else {
                        GUID::zeroed()
                    },
                    port: if attempt == 0 { 0 } else { 1 },
                };

                let rc = unsafe {
                    connect(
                        sock,
                        addr_of!(addr).cast(),
                        size_of::<SOCKADDR_BTH>() as i32,
                    )
                };

                let connected = if rc == 0 {
                    true
                } else {
                    let err = unsafe { WSAGetLastError().0 };
                    if err != 10035 {
                        last_err = format!("WinSock connect error {err}");
                        false
                    } else {
                        let mut write_fds = FD_SET::default();
                        write_fds.fd_count = 1;
                        write_fds.fd_array[0] = sock;
                        let mut except_fds = FD_SET::default();
                        except_fds.fd_count = 1;
                        except_fds.fd_array[0] = sock;
                        let tv = TIMEVAL {
                            tv_sec: (timeout_ms / 1000) as i32,
                            tv_usec: ((timeout_ms % 1000) * 1000) as i32,
                        };
                        let sel = unsafe {
                            select(0, None, Some(&mut write_fds), Some(&mut except_fds), Some(&tv))
                        };
                        if sel <= 0 || except_fds.fd_count > 0 || write_fds.fd_count == 0 {
                            last_err = if sel == 0 {
                                format!("Bluetooth connect timed out after {timeout_ms}ms")
                            } else {
                                format!("Bluetooth connect select failed (sel={sel})")
                            };
                            false
                        } else {
                            let mut so_err: i32 = 0;
                            let mut len = size_of::<i32>() as i32;
                            let gso = unsafe {
                                getsockopt(
                                    sock,
                                    SOL_SOCKET,
                                    SO_ERROR,
                                    windows::core::PSTR(&mut so_err as *mut i32 as *mut u8),
                                    &mut len,
                                )
                            };
                            if gso == 0 && so_err == 0 {
                                true
                            } else {
                                last_err = format!("RFCOMM SO_ERROR={so_err}");
                                false
                            }
                        }
                    }
                };

                if !connected {
                    unsafe { closesocket(sock) };
                    continue;
                }

                let mut blocking: u32 = 0;
                let _ = unsafe { ioctlsocket(sock, FIONBIO, &mut blocking) };
                let snd_timeout = write_timeout_ms as i32;
                let _ = unsafe {
                    setsockopt(
                        sock,
                        SOL_SOCKET,
                        SO_SNDTIMEO,
                        Some(&snd_timeout.to_ne_bytes()),
                    )
                };

                return Ok(Self { _wsa: wsa, sock });
            }

            Err(PrinterError::BluetoothConnectFailed(last_err))
        }
    }

    impl Write for RfcommSocket {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            let sent = unsafe { send(self.sock, buf, Default::default()) };
            if sent == SOCKET_ERROR {
                let code = unsafe { WSAGetLastError().0 };
                return Err(io::Error::other(format!("WinSock send failed ({code})")));
            }
            Ok(sent as usize)
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl Drop for RfcommSocket {
        fn drop(&mut self) {
            unsafe {
                closesocket(self.sock);
            }
        }
    }

    struct WinComPort {
        handle: HANDLE,
    }

    impl WinComPort {
        fn open(device_path: &str, write_timeout_ms: u32) -> Result<Self, PrinterError> {
            let wide: Vec<u16> = device_path.encode_utf16().chain(Some(0)).collect();
            let handle = unsafe {
                CreateFileW(
                    PCWSTR(wide.as_ptr()),
                    GENERIC_WRITE.0,
                    FILE_SHARE_NONE,
                    None,
                    OPEN_EXISTING,
                    FILE_ATTRIBUTE_NORMAL,
                    None,
                )
            }
            .map_err(|e| PrinterError::BluetoothConnectFailed(format!("{device_path}: {e}")))?;

            if handle == INVALID_HANDLE_VALUE {
                return Err(PrinterError::BluetoothConnectFailed(format!(
                    "Unable to open {device_path}"
                )));
            }

            let timeouts = COMMTIMEOUTS {
                WriteTotalTimeoutMultiplier: 0,
                WriteTotalTimeoutConstant: write_timeout_ms,
                ..Default::default()
            };
            let _ = unsafe { SetCommTimeouts(handle, &timeouts) };

            Ok(Self { handle })
        }
    }

    impl Write for WinComPort {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            let mut written: u32 = 0;
            unsafe { WriteFile(self.handle, Some(buf), Some(&mut written), None) }
                .map_err(|e| io::Error::other(e.to_string()))?;
            Ok(written as usize)
        }

        fn flush(&mut self) -> io::Result<()> {
            // Avoid blocking FlushFileBuffers on offline Bluetooth virtual COM ports;
            // WriteFile is already bounded by SetCommTimeouts.
            Ok(())
        }
    }

    impl Drop for WinComPort {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseHandle(self.handle);
            }
        }
    }

    fn enum_spooler_printers() -> Vec<BluetoothDeviceInfo> {
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let mut needed: u32 = 0;
        let mut returned: u32 = 0;
        let _ = unsafe { EnumPrintersW(flags, PCWSTR::null(), 4, None, &mut needed, &mut returned) };
        if needed == 0 {
            return Vec::new();
        }
        let mut buf = vec![0_u8; needed as usize];
        if unsafe {
            EnumPrintersW(
                flags,
                PCWSTR::null(),
                4,
                Some(buf.as_mut_slice()),
                &mut needed,
                &mut returned,
            )
        }
        .is_err()
        {
            return Vec::new();
        }
        let infos = unsafe {
            std::slice::from_raw_parts(buf.as_ptr() as *const PRINTER_INFO_4W, returned as usize)
        };
        infos
            .iter()
            .filter_map(|info| unsafe { info.pPrinterName.to_string().ok() })
            .filter(|name| !name.trim().is_empty())
            .map(|name| BluetoothDeviceInfo {
                name: format!("[USB/System] {name}"),
                address: format!("{SPOOLER_PREFIX}{name}"),
                device_type: 2,
            })
            .collect()
    }

    fn print_spooler_raw(printer_name: &str, payload: &[u8]) -> Result<usize, PrinterError> {
        let mut wide_name: Vec<u16> = printer_name.encode_utf16().chain(Some(0)).collect();
        let mut handle = HANDLE::default();
        unsafe { OpenPrinterW(PCWSTR(wide_name.as_ptr()), &mut handle, None) }.map_err(|e| {
            PrinterError::BluetoothConnectFailed(format!("OpenPrinterW({printer_name}): {e}"))
        })?;

        struct PrinterGuard(HANDLE);
        impl Drop for PrinterGuard {
            fn drop(&mut self) {
                unsafe {
                    let _ = ClosePrinter(self.0);
                }
            }
        }
        let _guard = PrinterGuard(handle);

        let mut doc_name: Vec<u16> = "Benmi POS Receipt".encode_utf16().chain(Some(0)).collect();
        let mut data_type: Vec<u16> = "RAW".encode_utf16().chain(Some(0)).collect();
        let doc_info = DOC_INFO_1W {
            pDocName: PWSTR(doc_name.as_mut_ptr()),
            pOutputFile: PWSTR::null(),
            pDatatype: PWSTR(data_type.as_mut_ptr()),
        };

        let job_id = unsafe { StartDocPrinterW(handle, 1, &doc_info) };
        if job_id == 0 {
            return Err(PrinterError::BluetoothConnectFailed(format!(
                "StartDocPrinterW failed for {printer_name}"
            )));
        }
        if !unsafe { StartPagePrinter(handle) }.as_bool() {
            unsafe {
                let _ = EndDocPrinter(handle);
            }
            return Err(PrinterError::BluetoothSendUncertain(format!(
                "StartPagePrinter failed for {printer_name}"
            )));
        }

        let mut written: u32 = 0;
        let write_ok = unsafe {
            WritePrinter(
                handle,
                payload.as_ptr().cast(),
                payload.len() as u32,
                &mut written,
            )
        }
        .as_bool();

        unsafe {
            let _ = EndPagePrinter(handle);
            let _ = EndDocPrinter(handle);
        }

        if !write_ok {
            return Err(PrinterError::BluetoothSendUncertain(format!(
                "WritePrinter failed for {printer_name}"
            )));
        }
        let _ = wide_name.len();
        Ok(written as usize)
    }

    fn test_spooler_printer(printer_name: &str) -> Result<TestBluetoothConnectionResult, PrinterError> {
        let wide_name: Vec<u16> = printer_name.encode_utf16().chain(Some(0)).collect();
        let mut handle = HANDLE::default();
        unsafe { OpenPrinterW(PCWSTR(wide_name.as_ptr()), &mut handle, None) }.map_err(|e| {
            PrinterError::BluetoothConnectFailed(format!("OpenPrinterW({printer_name}): {e}"))
        })?;
        unsafe {
            let _ = ClosePrinter(handle);
        }
        Ok(TestBluetoothConnectionResult {
            success: true,
            mac_address: format!("{SPOOLER_PREFIX}{printer_name}"),
            device_name: printer_name.to_string(),
        })
    }

    fn has_active_bluetooth_radio() -> (bool, bool) {
        let params = BLUETOOTH_FIND_RADIO_PARAMS {
            dwSize: size_of::<BLUETOOTH_FIND_RADIO_PARAMS>() as u32,
        };
        let mut radio_handle = HANDLE::default();
        let Ok(find_handle) = (unsafe { BluetoothFindFirstRadio(&params, &mut radio_handle) })
        else {
            return (false, false);
        };
        let mut radio_info = BLUETOOTH_RADIO_INFO {
            dwSize: size_of::<BLUETOOTH_RADIO_INFO>() as u32,
            ..Default::default()
        };
        let info_rc = unsafe { BluetoothGetRadioInfo(radio_handle, &mut radio_info) };
        unsafe {
            let _ = CloseHandle(radio_handle);
            let _ = BluetoothFindRadioClose(find_handle);
        }
        (true, info_rc == 0)
    }

    pub fn get_paired_bluetooth_devices() -> Result<PairedBluetoothDevicesResult, PrinterError> {
        let mut devices = enum_spooler_printers();
        let (supported, enabled) = has_active_bluetooth_radio();

        if supported && enabled {
            let search_params = BLUETOOTH_DEVICE_SEARCH_PARAMS {
                dwSize: size_of::<BLUETOOTH_DEVICE_SEARCH_PARAMS>() as u32,
                fReturnAuthenticated: true.into(),
                fReturnRemembered: true.into(),
                fReturnUnknown: false.into(),
                fReturnConnected: true.into(),
                fIssueInquiry: false.into(),
                cTimeoutMultiplier: 0,
                hRadio: HANDLE::default(),
            };

            let mut dev_info = BLUETOOTH_DEVICE_INFO {
                dwSize: size_of::<BLUETOOTH_DEVICE_INFO>() as u32,
                ..Default::default()
            };

            if let Ok(find_handle) =
                unsafe { BluetoothFindFirstDevice(&search_params, &mut dev_info) }
            {
                loop {
                    let name_len = dev_info
                        .szName
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(dev_info.szName.len());
                    let name = String::from_utf16_lossy(&dev_info.szName[..name_len]);
                    let address =
                        format_mac_from_rg_bytes(unsafe { dev_info.Address.Anonymous.rgBytes });

                    devices.push(BluetoothDeviceInfo {
                        name: if name.trim().is_empty() {
                            "Unknown Device".to_string()
                        } else {
                            name
                        },
                        address,
                        device_type: 1,
                    });

                    dev_info.dwSize = size_of::<BLUETOOTH_DEVICE_INFO>() as u32;
                    if unsafe { BluetoothFindNextDevice(find_handle, &mut dev_info) }.is_err() {
                        break;
                    }
                }
                unsafe {
                    let _ = BluetoothFindDeviceClose(find_handle);
                }
            }
        }

        let has_any = !devices.is_empty();
        Ok(PairedBluetoothDevicesResult {
            supported: supported || has_any,
            enabled: enabled || has_any,
            devices,
        })
    }

    pub fn print_bluetooth(
        mac_address: &str,
        payload: &[u8],
        is_tspl: bool,
        connect_timeout_ms: u32,
        write_timeout_ms: u32,
    ) -> Result<usize, PrinterError> {
        let _guard = GLOBAL_BT_LOCK.try_acquire()?;

        if let Some(printer_name) = parse_spooler_name(mac_address) {
            return print_spooler_raw(printer_name, payload);
        }

        if let Some(com_path) = normalize_com_port_name(mac_address) {
            let mut port = WinComPort::open(&com_path, write_timeout_ms)?;
            return send_bluetooth_stream(&mut port, payload, is_tspl, std::thread::sleep);
        }

        let (supported, enabled) = has_active_bluetooth_radio();
        if !supported || !enabled {
            return Err(PrinterError::BluetoothUnavailable(
                "Windows Bluetooth adapter is unavailable or turned off.".to_string(),
            ));
        }

        let bth_addr = parse_mac_to_bth_addr(mac_address)?;
        let mut sock = RfcommSocket::connect(bth_addr, connect_timeout_ms, write_timeout_ms)?;
        send_bluetooth_stream(&mut sock, payload, is_tspl, std::thread::sleep)
    }

    pub fn test_bluetooth_connection(
        mac_address: &str,
        connect_timeout_ms: u32,
    ) -> Result<TestBluetoothConnectionResult, PrinterError> {
        let _guard = GLOBAL_BT_LOCK.try_acquire()?;

        if let Some(printer_name) = parse_spooler_name(mac_address) {
            return test_spooler_printer(printer_name);
        }

        if let Some(com_path) = normalize_com_port_name(mac_address) {
            let _port = WinComPort::open(&com_path, connect_timeout_ms)?;
            return Ok(TestBluetoothConnectionResult {
                success: true,
                mac_address: mac_address.trim().to_string(),
                device_name: mac_address.trim().to_uppercase(),
            });
        }

        let (supported, enabled) = has_active_bluetooth_radio();
        if !supported || !enabled {
            return Err(PrinterError::BluetoothUnavailable(
                "Windows Bluetooth adapter is unavailable or turned off.".to_string(),
            ));
        }

        let paired = get_paired_bluetooth_devices()?;
        let normalized = mac_address.trim().to_ascii_uppercase();
        let device_name = paired
            .devices
            .into_iter()
            .find(|d| d.address.eq_ignore_ascii_case(&normalized))
            .map(|d| d.name)
            .unwrap_or_else(|| normalized.clone());

        let bth_addr = parse_mac_to_bth_addr(mac_address)?;
        let _sock = RfcommSocket::connect(bth_addr, connect_timeout_ms, connect_timeout_ms)?;
        Ok(TestBluetoothConnectionResult {
            success: true,
            mac_address: mac_address.trim().to_string(),
            device_name,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_mac_and_formats_rg_bytes_consistently() {
        let addr = parse_mac_to_bth_addr("AA:BB:CC:DD:EE:FF").expect("valid mac");
        assert_eq!(addr, 0x0000_AABB_CCDD_EEFF);
        let le_bytes = [0xFF, 0xEE, 0xDD, 0xCC, 0xBB, 0xAA];
        assert_eq!(format_mac_from_rg_bytes(le_bytes), "AA:BB:CC:DD:EE:FF");
    }

    #[test]
    fn normalizes_windows_com_port_names() {
        assert_eq!(normalize_com_port_name("com3").as_deref(), Some(r"\\.\COM3"));
        assert_eq!(
            normalize_com_port_name(r"\\.\COM12").as_deref(),
            Some(r"\\.\COM12")
        );
        assert_eq!(normalize_com_port_name("AA:BB:CC:DD:EE:FF"), None);
    }

    #[test]
    fn parses_spooler_printer_prefix() {
        assert_eq!(
            parse_spooler_name("spooler:XP-80C"),
            Some("XP-80C")
        );
        assert_eq!(parse_spooler_name("spooler:  "), None);
        assert_eq!(parse_spooler_name("AA:BB:CC:DD:EE:FF"), None);
    }
}
