use base64::{engine::general_purpose, Engine as _};
use image::{imageops::FilterType, DynamicImage, RgbaImage};

use crate::error::PrinterError;

/// Standard thermal darkness luminance threshold matching `EscPosBitmapConverter`
/// and `TsplBitmapConverter`.
pub const DEFAULT_LUMINANCE_THRESHOLD: u8 = 175;

/// Decodes a raw or `data:<mime>;base64,...` prefixed base64 string into bytes.
pub fn decode_base64_bytes(input: &str) -> Result<Vec<u8>, PrinterError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(PrinterError::InvalidInput(
            "Base64 payload cannot be empty.".to_string(),
        ));
    }
    let clean = match trimmed.split_once(',') {
        Some((_, after)) => after.trim(),
        None => trimmed,
    };
    // Strip embedded whitespace/newlines just like Android Base64.DEFAULT.
    let compact: String = clean.chars().filter(|c| !c.is_whitespace()).collect();
    general_purpose::STANDARD
        .decode(compact.as_bytes())
        .map_err(|e| PrinterError::Base64Decode(e.to_string()))
}

/// Decodes a base64 PNG/JPEG image string into a `DynamicImage`.
pub fn decode_base64_image(base64_image: &str) -> Result<DynamicImage, PrinterError> {
    let bytes = decode_base64_bytes(base64_image)?;
    image::load_from_memory(&bytes).map_err(|e| PrinterError::ImageDecode(e.to_string()))
}

/// Scales an image with bilinear filtering (`FilterType::Triangle`), matching
/// Android `Bitmap.createScaledBitmap(bitmap, targetWidth, targetHeight, true)`.
///
/// Uses a zero-resample fast path when the input canvas already matches the
/// target dot dimensions, preventing bilinear blur on 1px receipt text and QR codes.
pub fn scale_to_rgba(img: &DynamicImage, target_width: u32, target_height: u32) -> RgbaImage {
    let w = target_width.max(1);
    let h = target_height.max(1);
    if img.width() == w && img.height() == h {
        return img.to_rgba8();
    }
    img.resize_exact(w, h, FilterType::Triangle).to_rgba8()
}

/// Evaluates whether an RGBA pixel should fire a thermal printhead dot.
///
/// Transparent/semi-transparent pixels (`alpha <= 128`) are treated as white.
#[inline]
pub fn is_dark_pixel(rgba: [u8; 4], threshold: u8) -> bool {
    let [r, g, b, a] = rgba;
    if a <= 128 {
        return false;
    }
    let luminance = (0.299_f64 * f64::from(r)
        + 0.587_f64 * f64::from(g)
        + 0.114_f64 * f64::from(b)) as i32;
    luminance < i32::from(threshold)
}
