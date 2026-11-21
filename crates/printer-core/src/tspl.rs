use image::DynamicImage;

use crate::error::PrinterError;
use crate::image_decode::{
    decode_base64_image, is_dark_pixel, scale_to_rgba, DEFAULT_LUMINANCE_THRESHOLD,
};

/// Converts a `DynamicImage` into a 1-bit monochrome TSPL raster command stream.
///
/// Exact byte-for-byte parity with `TsplBitmapConverter.java`:
/// - 203 DPI (`8.0` dots/mm) or 300 DPI (`11.811` dots/mm)
/// - TSPL Mode 0 pixel polarity: `0` = black thermal dot, `1` = white background
/// - `SIZE / GAP / DIRECTION 1 / CLS / BITMAP ... / PRINT 1, 1`
pub fn convert_image_to_tspl_raster(
    img: &DynamicImage,
    width_mm: u32,
    height_mm: u32,
    dpi: u32,
    x_offset_mm: f64,
    y_offset_mm: f64,
) -> Vec<u8> {
    if img.width() == 0 || img.height() == 0 {
        return Vec::new();
    }

    let dots_per_mm: f64 = if dpi == 300 { 11.811 } else { 8.0 };
    let target_width = ((f64::from(width_mm) * dots_per_mm).round() as u32).max(8);
    let target_height = ((f64::from(height_mm) * dots_per_mm).round() as u32).max(8);

    let x_offset_dots = (x_offset_mm * dots_per_mm).round().max(0.0) as u32;
    let y_offset_dots = (y_offset_mm * dots_per_mm).round().max(0.0) as u32;

    let scaled = scale_to_rgba(img, target_width, target_height);
    let width_bytes = (target_width + 7) / 8;

    let effective_width_mm = width_mm + x_offset_mm.ceil().max(0.0) as u32;
    let effective_height_mm = height_mm + y_offset_mm.ceil().max(0.0) as u32;

    let header = format!(
        "SIZE {effective_width_mm} mm, {effective_height_mm} mm\r\n\
         GAP 2 mm, 0 mm\r\n\
         DIRECTION 1\r\n\
         CLS\r\n\
         BITMAP {x_offset_dots}, {y_offset_dots}, {width_bytes}, {target_height}, 0, "
    );
    let footer = "\r\nPRINT 1, 1\r\n";

    let mut out =
        Vec::with_capacity(header.len() + (width_bytes * target_height) as usize + footer.len());
    out.extend_from_slice(header.as_bytes());

    // TSPL Mode 0: 0 = Black dot/Print, 1 = White/No print
    for y in 0..target_height {
        for x_byte in 0..width_bytes {
            let mut b: u8 = 0xFF;
            for bit in 0..8 {
                let x = x_byte * 8 + bit;
                if x < target_width {
                    let px = scaled.get_pixel(x, y).0;
                    if is_dark_pixel(px, DEFAULT_LUMINANCE_THRESHOLD) {
                        b &= !(1 << (7 - bit));
                    }
                }
            }
            out.push(b);
        }
    }

    out.extend_from_slice(footer.as_bytes());
    out
}

/// Decodes a base64 PNG/JPEG image and converts it into TSPL raster bytes.
pub fn convert_base64_to_tspl_raster(
    base64_image: &str,
    width_mm: u32,
    height_mm: u32,
    dpi: u32,
    x_offset_mm: f64,
    y_offset_mm: f64,
) -> Result<Vec<u8>, PrinterError> {
    let img = decode_base64_image(base64_image)?;
    Ok(convert_image_to_tspl_raster(
        &img,
        width_mm,
        height_mm,
        dpi,
        x_offset_mm,
        y_offset_mm,
    ))
}
