use std::io::Write;
use std::net::{Shutdown, SocketAddr, TcpStream, ToSocketAddrs};
use std::sync::{mpsc, Condvar, Mutex};
use std::time::{Duration, Instant};

use crate::error::PrinterError;

const BT_CHUNK_SIZE: usize = 512;
const BT_CHUNK_PACING_MS: u64 = 35;
const BT_WARMUP_MS: u64 = 250;
const BT_SANITATION_SETTLE_MS: u64 = 50;
const BT_LOCK_WAIT_SECS: u64 = 15;

/// Bounds connect/write timeouts to `1000..=15000` ms, matching Android `boundedTimeout`.
pub fn bounded_timeout_ms(value: Option<u32>, fallback_ms: u32) -> u32 {
    value.unwrap_or(fallback_ms).clamp(1000, 15000)
}

fn connect_tcp_bounded(ip: &str, port: u16, timeout_ms: u32) -> Result<TcpStream, PrinterError> {
    let host = ip.trim();
    if host.is_empty() {
        return Err(PrinterError::InvalidInput(
            "Printer IP address is required.".to_string(),
        ));
    }
    let timeout = Duration::from_millis(u64::from(timeout_ms.max(200)));
    let addrs: Vec<SocketAddr> = (host, port)
        .to_socket_addrs()
        .map_err(|e| PrinterError::TcpConnect(format!("{host}:{port} - {e}")))?
        .collect();
    if addrs.is_empty() {
        return Err(PrinterError::TcpConnect(format!(
            "{host}:{port} - no resolved addresses"
        )));
    }

    let mut last_err = None;
    for addr in addrs {
        match TcpStream::connect_timeout(&addr, timeout) {
            Ok(stream) => {
                let _ = stream.set_nodelay(true);
                let _ = stream.set_write_timeout(Some(timeout));
                let _ = stream.set_read_timeout(Some(timeout));
                return Ok(stream);
            }
            Err(err) => last_err = Some(err),
        }
    }

    let reason = last_err
        .map(|e| e.to_string())
        .unwrap_or_else(|| "connection refused".to_string());
    Err(PrinterError::TcpConnect(format!("{host}:{port} - {reason}")))
}

/// Tests TCP connectivity to a thermal printer on LAN/Wi-Fi.
pub fn test_tcp_connection(ip: &str, port: u16, timeout_ms: u32) -> Result<(), PrinterError> {
    let _stream = connect_tcp_bounded(ip, port, timeout_ms)?;
    Ok(())
}

/// Sends raw printer bytes (ESC/POS or TSPL) over a TCP socket with a strict
/// total-job write deadline (matching `BoundedPrinterIo.java` on Android).
pub fn print_tcp(
    ip: &str,
    port: u16,
    raw_bytes: &[u8],
    timeout_ms: u32,
) -> Result<usize, PrinterError> {
    if raw_bytes.is_empty() {
        return Err(PrinterError::InvalidInput(
            "Print byte payload cannot be empty.".to_string(),
        ));
    }
    let host_label = format!("{}:{port}", ip.trim());
    let mut stream = connect_tcp_bounded(ip, port, timeout_ms)?;
    let cancel_stream = stream.try_clone().ok();
    let total_deadline = Duration::from_millis(u64::from(timeout_ms.max(500)));
    let payload = raw_bytes.to_vec();
    let payload_len = payload.len();

    let (tx, rx) = mpsc::channel();
    let label_for_thread = host_label.clone();
    std::thread::spawn(move || {
        let res = stream
            .write_all(&payload)
            .and_then(|_| stream.flush())
            .map_err(|e| PrinterError::TcpWrite(format!("{label_for_thread} - {e}")));
        let _ = tx.send(res);
    });

    match rx.recv_timeout(total_deadline) {
        Ok(Ok(())) => Ok(payload_len),
        Ok(Err(err)) => Err(err),
        Err(_) => {
            if let Some(handle) = cancel_stream {
                let _ = handle.shutdown(Shutdown::Both);
            }
            Err(PrinterError::TcpWrite(format!(
                "{host_label} - write deadline exceeded ({timeout_ms}ms)"
            )))
        }
    }
}

/// Timed global lock matching Android's `BT_PRINT_LOCK.tryLock(15, TimeUnit.SECONDS)`.
pub struct BluetoothQueueLock {
    busy: Mutex<bool>,
    cvar: Condvar,
}

pub struct BluetoothQueueGuard<'a> {
    lock: &'a BluetoothQueueLock,
}

impl BluetoothQueueLock {
    pub const fn new() -> Self {
        Self {
            busy: Mutex::new(false),
            cvar: Condvar::new(),
        }
    }

    pub fn try_acquire(&self) -> Result<BluetoothQueueGuard<'_>, PrinterError> {
        let deadline = Instant::now() + Duration::from_secs(BT_LOCK_WAIT_SECS);
        let mut busy = self
            .busy
            .lock()
            .map_err(|_| PrinterError::BluetoothBusy)?;
        while *busy {
            let now = Instant::now();
            if now >= deadline {
                return Err(PrinterError::BluetoothBusy);
            }
            let (guard, wait_res) = self
                .cvar
                .wait_timeout(busy, deadline - now)
                .map_err(|_| PrinterError::BluetoothBusy)?;
            busy = guard;
            if wait_res.timed_out() && *busy {
                return Err(PrinterError::BluetoothBusy);
            }
        }
        *busy = true;
        Ok(BluetoothQueueGuard { lock: self })
    }
}

impl Drop for BluetoothQueueGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut busy) = self.lock.busy.lock() {
            *busy = false;
            self.lock.cvar.notify_one();
        }
    }
}

pub static GLOBAL_BT_LOCK: BluetoothQueueLock = BluetoothQueueLock::new();

/// Computes post-write mechanical printhead drain duration in milliseconds.
pub fn compute_bluetooth_drain_ms(payload_len: usize) -> u64 {
    let dynamic_drain_ms = ((payload_len as f64) / (BT_CHUNK_SIZE as f64)) * (BT_CHUNK_PACING_MS as f64);
    let wait_ms = (1200.0 + dynamic_drain_ms).round() as u64;
    wait_ms.clamp(1500, 30000)
}

/// Transmits printer bytes over any connected Bluetooth/Serial `Write` stream using
/// adaptive chunking & pacing to prevent low-cost printer UART FIFO overrun.
///
/// Both Windows (Win32 RFCOMM / COM) and Android JNI (`BluetoothSocket.OutputStream`)
/// share this exact framing logic.
pub fn send_bluetooth_stream<W: Write, F: FnMut(Duration)>(
    writer: &mut W,
    print_bytes: &[u8],
    is_tspl: bool,
    mut sleep_fn: F,
) -> Result<usize, PrinterError> {
    if print_bytes.is_empty() {
        return Err(PrinterError::InvalidInput(
            "Print byte payload cannot be empty.".to_string(),
        ));
    }

    // 1. Warm-up delay for Bluetooth SPP UART bridge settle.
    sleep_fn(Duration::from_millis(BT_WARMUP_MS));

    // 2. Buffer sanitization: CAN (0x18) + ESC @ (0x1B, 0x40) for ESC/POS.
    if !is_tspl {
        writer
            .write_all(&[0x18, 0x1B, 0x40])
            .and_then(|_| writer.flush())
            .map_err(|e| PrinterError::BluetoothSendUncertain(e.to_string()))?;
        sleep_fn(Duration::from_millis(BT_SANITATION_SETTLE_MS));
    }

    // 3. Adaptive 512-byte chunking with 35ms pacing (~14.6 KB/s cap).
    let chunks = print_bytes.chunks(BT_CHUNK_SIZE);
    let total_chunks = chunks.len();
    for (idx, chunk) in chunks.enumerate() {
        writer
            .write_all(chunk)
            .and_then(|_| writer.flush())
            .map_err(|e| PrinterError::BluetoothSendUncertain(e.to_string()))?;
        if idx + 1 < total_chunks {
            sleep_fn(Duration::from_millis(BT_CHUNK_PACING_MS));
        }
    }

    writer
        .flush()
        .map_err(|e| PrinterError::BluetoothSendUncertain(e.to_string()))?;

    // 4. Mechanical printhead drain wait before closing connection.
    sleep_fn(Duration::from_millis(compute_bluetooth_drain_ms(
        print_bytes.len(),
    )));

    Ok(print_bytes.len())
}
