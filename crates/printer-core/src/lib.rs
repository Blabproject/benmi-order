pub mod error;
pub mod escpos;
pub mod image_decode;
pub mod transport;
pub mod tspl;

use serde::{Deserialize, Serialize};

pub use error::{PrinterError, StructuredPrinterError};
pub use escpos::{convert_base64_to_escpos_raster, convert_image_to_escpos_raster};
pub use image_decode::decode_base64_bytes;
pub use transport::{
    bounded_timeout_ms, compute_bluetooth_drain_ms, print_tcp, send_bluetooth_stream,
    test_tcp_connection, GLOBAL_BT_LOCK,
};
pub use tspl::{convert_base64_to_tspl_raster, convert_image_to_tspl_raster};

/// Canonical bitmap render parameters matching `js/printer-service.js` and
/// `ThermalPrinterPlugin.java`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BitmapRenderParams {
    pub base64_image: String,
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

impl BitmapRenderParams {
    pub fn is_tspl(&self) -> bool {
        self.protocol.eq_ignore_ascii_case("tspl")
    }

    /// Converts the request's base64 image into either TSPL or ESC/POS printer bytes.
    pub fn render_bytes(&self) -> Result<Vec<u8>, PrinterError> {
        if self.is_tspl() {
            convert_base64_to_tspl_raster(
                &self.base64_image,
                self.label_width_mm,
                self.label_height_mm,
                self.dpi,
                self.x_offset_mm,
                self.y_offset_mm,
            )
        } else {
            convert_base64_to_escpos_raster(
                &self.base64_image,
                self.paper_width,
                self.auto_cut,
                self.feed_before_cut_mm,
            )
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintTcpResult {
    pub success: bool,
    pub ip: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub protocol: Option<String>,
    pub bytes_written: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionResult {
    pub success: bool,
    pub ip: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BluetoothDeviceInfo {
    pub name: String,
    pub address: String,
    #[serde(rename = "type")]
    pub device_type: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedBluetoothDevicesResult {
    pub supported: bool,
    pub enabled: bool,
    pub devices: Vec<BluetoothDeviceInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintBluetoothResult {
    pub success: bool,
    pub mac_address: String,
    pub bytes_written: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestBluetoothConnectionResult {
    pub success: bool,
    pub mac_address: String,
    pub device_name: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose, Engine as _};
    use image::{DynamicImage, ImageFormat, Rgba, RgbaImage};
    use std::io::{Cursor, Read};
    use std::net::TcpListener;
    use std::thread;
    use std::time::Duration;

    fn encode_png_base64(img: &RgbaImage) -> String {
        let mut buf = Vec::new();
        DynamicImage::ImageRgba8(img.clone())
            .write_to(&mut Cursor::new(&mut buf), ImageFormat::Png)
            .expect("png encode");
        format!(
            "data:image/png;base64,{}",
            general_purpose::STANDARD.encode(&buf)
        )
    }

    /// Direct Rust mirror of `ReceiptRasterTest.java` (`feedsAfterAllRasterRowsAndCutsOnce`).
    #[test]
    fn escpos_feeds_after_all_raster_rows_and_cuts_once() {
        for width in [58_u32, 80_u32] {
            for cut in [false, true] {
                let dots = if width == 58 { 384 } else { 576 };
                let mut img = RgbaImage::from_pixel(dots, 1701, Rgba([255, 255, 255, 255]));
                // Last row must survive 256-row chunking and appear before feed/cut.
                img.put_pixel(0, 1700, Rgba([0, 0, 0, 255]));

                let b64 = encode_png_base64(&img);
                let bytes = convert_base64_to_escpos_raster(&b64, width, cut, 20.0)
                    .expect("escpos conversion");

                assert_eq!(&bytes[0..5], &[0x1B, 0x40, 0x1B, 0x33, 0x00]);
                let mut pos = 5_usize;
                let mut rows = 0_u32;
                while pos + 1 < bytes.len() && bytes[pos] == 29 && bytes[pos + 1] == 118 {
                    let row_bytes = (bytes[pos + 4] as usize) + ((bytes[pos + 5] as usize) << 8);
                    let height = (bytes[pos + 6] as u32) + ((bytes[pos + 7] as u32) << 8);
                    assert_eq!((dots / 8) as usize, row_bytes);
                    assert!(height <= 256, "Each raster strip should be <= 256 rows");
                    if rows + height == 1701 {
                        let last_row_offset = pos + 8 + ((height as usize) - 1) * row_bytes;
                        assert_eq!(128, bytes[last_row_offset]);
                    }
                    rows += height;
                    pos += 8 + row_bytes * (height as usize);
                }
                assert_eq!(1701, rows);

                let tail = &bytes[pos..];
                if cut {
                    assert_eq!(tail, &[27, 50, 27, 74, 160, 29, 86, 1]);
                } else {
                    assert_eq!(tail, &[27, 50]);
                }
            }
        }
    }

    #[test]
    fn escpos_large_feed_splits_into_multiple_esc_j_commands() {
        let img = RgbaImage::from_pixel(576, 10, Rgba([255, 255, 255, 255]));
        let bytes = convert_image_to_escpos_raster(&DynamicImage::ImageRgba8(img), 80, true, 80.0);
        // 80mm * 8 dots/mm = 640 dots -> 255 + 255 + 130
        let tail = &bytes[bytes.len() - 12..];
        assert_eq!(
            tail,
            &[0x1B, 0x32, 0x1B, 0x4A, 255, 0x1B, 0x4A, 255, 0x1B, 0x4A, 130, 0x1D, 0x56, 0x01][2..]
        );
        assert!(bytes.ends_with(&[0x1B, 0x4A, 255, 0x1B, 0x4A, 255, 0x1B, 0x4A, 130, 0x1D, 0x56, 0x01]));
    }

    #[test]
    fn tspl_encodes_header_inverted_bits_and_offsets() {
        let mut img = RgbaImage::from_pixel(320, 240, Rgba([255, 255, 255, 255]));
        // Top-left pixel black -> bit 7 cleared -> 0x7F in TSPL Mode 0
        img.put_pixel(0, 0, Rgba([0, 0, 0, 255]));
        let b64 = encode_png_base64(&img);

        let bytes = convert_base64_to_tspl_raster(&b64, 40, 30, 203, 1.5, 2.0)
            .expect("tspl conversion");
        let text_prefix = String::from_utf8_lossy(&bytes[..96]);
        assert!(text_prefix.starts_with(
            "SIZE 42 mm, 32 mm\r\nGAP 2 mm, 0 mm\r\nDIRECTION 1\r\nCLS\r\nBITMAP 12, 16, 40, 240, 0, "
        ));

        let marker = b", 0, ";
        let data_start = bytes
            .windows(marker.len())
            .position(|w| w == marker)
            .unwrap()
            + marker.len();
        assert_eq!(bytes[data_start], 0x7F);
        assert_eq!(bytes[data_start + 1], 0xFF);
        assert!(bytes.ends_with(b"\r\nPRINT 1, 1\r\n"));
    }

    #[test]
    fn tcp_print_and_test_connection_work_with_local_socket() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind ephemeral port");
        let port = listener.local_addr().unwrap().port();

        let server = thread::spawn(move || {
            // Connection 1: test_tcp_connection
            let (mut s1, _) = listener.accept().unwrap();
            let mut tmp = [0_u8; 8];
            let _ = s1.read(&mut tmp);

            // Connection 2: print_tcp
            let (mut s2, _) = listener.accept().unwrap();
            let mut received = Vec::new();
            s2.read_to_end(&mut received).unwrap();
            received
        });

        test_tcp_connection("127.0.0.1", port, 2000).expect("test connection");
        let payload = vec![0x1B, 0x40, 0x41, 0x42, 0x0A];
        let written = print_tcp("127.0.0.1", port, &payload, 2000).expect("print tcp");
        assert_eq!(written, payload.len());

        let received = server.join().unwrap();
        assert_eq!(received, payload);
    }

    #[test]
    fn exact_width_image_avoids_bilinear_blur_on_1px_patterns() {
        let mut img = RgbaImage::from_pixel(576, 4, Rgba([255, 255, 255, 255]));
        // 1px alternating black/white dots in first byte: 10101010 = 0xAA
        for x in (0..8).step_by(2) {
            img.put_pixel(x, 0, Rgba([0, 0, 0, 255]));
        }
        let bytes = convert_image_to_escpos_raster(&DynamicImage::ImageRgba8(img), 80, false, 20.0);
        // Header is 5 bytes (ESC @, ESC 3 0) + 8 bytes (GS v 0 ...) = 13 bytes
        assert_eq!(bytes[13], 0b1010_1010);
    }

    #[test]
    fn bluetooth_stream_prepends_sanitation_and_chunks_by_512() {
        let payload = vec![0xAA_u8; 1100];
        let mut sink = Vec::new();
        let mut sleeps = Vec::new();

        let written = send_bluetooth_stream(&mut sink, &payload, false, |d| sleeps.push(d))
            .expect("bt send");

        assert_eq!(written, 1100);
        // Header CAN + ESC @ followed by 1100 bytes
        assert_eq!(&sink[0..3], &[0x18, 0x1B, 0x40]);
        assert_eq!(&sink[3..], payload.as_slice());
        // Warmup (250ms) + settle (50ms) + 2 inter-chunk sleeps (35ms x2 for 3 chunks) + drain (1500ms min)
        assert_eq!(sleeps.len(), 5);
        assert_eq!(sleeps[0], Duration::from_millis(250));
        assert_eq!(sleeps[1], Duration::from_millis(50));
        assert_eq!(sleeps[2], Duration::from_millis(35));
        assert_eq!(sleeps[3], Duration::from_millis(35));
        assert_eq!(sleeps[4], Duration::from_millis(1500));
    }
}
