use image::DynamicImage;

use crate::error::PrinterError;
use crate::image_decode::{
    decode_base64_image, is_dark_pixel, scale_to_rgba, DEFAULT_LUMINANCE_THRESHOLD,
};

const MAX_CHUNK_HEIGHT: u32 = 256;

/// Converts a `DynamicImage` into 1-bit monochrome ESC/POS raster bytes (`GS v 0`).
///
/// Exact byte-for-byte parity with `EscPosBitmapConverter.java`:
/// - `paper_width_mm == 58` -> 384 dots, otherwise 576 dots (80mm)
/// - `ESC @` + `ESC 3 0`
/// - Horizontal bands of max 256 rows per `GS v 0` command
/// - `ESC 2`
/// - Optional `ESC J` feed (`round(feed_before_cut_mm * 8.0)` dots) + `GS V 1` partial cut
pub fn convert_image_to_escpos_raster(
    img: &DynamicImage,
    paper_width_mm: u32,
    auto_cut: bool,
    feed_before_cut_mm: f64,
) -> Vec<u8> {
    if img.width() == 0 || img.height() == 0 {
        return Vec::new();
    }

    let target_width: u32 = if paper_width_mm == 58 { 384 } else { 576 };
    let scale = (target_width as f64) / (img.width() as f64);
    let target_height = ((img.height() as f64) * scale).round().max(1.0) as u32;

    let scaled = scale_to_rgba(img, target_width, target_height);
    let width_bytes = (target_width + 7) / 8;

    let mut out = Vec::with_capacity((width_bytes * target_height) as usize + 64);

    // 1. Initialize printer: ESC @ (0x1B, 0x40)
    out.extend_from_slice(&[0x1B, 0x40]);

    // 2. Set line spacing to 0: ESC 3 0 (0x1B, 0x33, 0x00)
    out.extend_from_slice(&[0x1B, 0x33, 0x00]);

    // 3. Slice bitmap into discrete horizontal bands of max 256 rows per GS v 0 command.
    let mut y_start = 0;
    while y_start < target_height {
        let chunk_height = MAX_CHUNK_HEIGHT.min(target_height - y_start);

        // GS v 0 m xL xH yL yH
        out.extend_from_slice(&[
            0x1D,
            0x76,
            0x30,
            0x00,
            (width_bytes & 0xFF) as u8,
            ((width_bytes >> 8) & 0xFF) as u8,
            (chunk_height & 0xFF) as u8,
            ((chunk_height >> 8) & 0xFF) as u8,
        ]);

        for y in y_start..(y_start + chunk_height) {
            for x_byte in 0..width_bytes {
                let mut b: u8 = 0;
                for bit in 0..8 {
                    let x = x_byte * 8 + bit;
                    if x < target_width {
                        let px = scaled.get_pixel(x, y).0;
                        if is_dark_pixel(px, DEFAULT_LUMINANCE_THRESHOLD) {
                            b |= 1 << (7 - bit);
                        }
                    }
                }
                out.push(b);
            }
        }

        y_start += chunk_height;
    }

    // Restore normal line spacing: ESC 2
    out.extend_from_slice(&[0x1B, 0x32]);

    // 4. Advance receipt past cutter and issue partial cut once.
    if auto_cut {
        let mut remaining_dots = (feed_before_cut_mm.max(0.0) * 8.0).round() as i32;
        loop {
            let feed_dots = remaining_dots.clamp(0, 255) as u8;
            out.extend_from_slice(&[0x1B, 0x4A, feed_dots]);
            remaining_dots -= i32::from(feed_dots);
            if remaining_dots <= 0 {
                break;
            }
        }
        // Cut paper: GS V 1
        out.extend_from_slice(&[0x1D, 0x56, 0x01]);
    }

    out
}

/// Decodes a base64 PNG/JPEG image and converts it into ESC/POS raster bytes.
pub fn convert_base64_to_escpos_raster(
    base64_image: &str,
    paper_width_mm: u32,
    auto_cut: bool,
    feed_before_cut_mm: f64,
) -> Result<Vec<u8>, PrinterError> {
    let img = decode_base64_image(base64_image)?;
    Ok(convert_image_to_escpos_raster(
        &img,
        paper_width_mm,
        auto_cut,
        feed_before_cut_mm,
    ))
}
