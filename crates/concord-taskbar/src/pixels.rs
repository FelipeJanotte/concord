use crate::error::TaskbarError;
use png::{ColorType, Decoder, Transformations};
use std::io::Cursor;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IconPixels {
    pub width: u32,
    pub height: u32,
    pub premultiplied_bgra: Vec<u8>,
}

pub fn decode_icon_png(png_bytes: &[u8]) -> Result<IconPixels, TaskbarError> {
    let mut decoder = Decoder::new(Cursor::new(png_bytes));
    decoder.set_transformations(Transformations::normalize_to_color8());
    let mut reader = decoder.read_info()?;
    let mut buffer = vec![0; reader.output_buffer_size().unwrap_or(0)];
    let frame = reader.next_frame(&mut buffer)?;
    if frame.width == 0 || frame.height == 0 {
        return Err(TaskbarError::InvalidIconSize {
            width: frame.width,
            height: frame.height,
        });
    }
    let rgba = to_rgba(&buffer[..frame.buffer_size()], frame.color_type);
    Ok(IconPixels {
        width: frame.width,
        height: frame.height,
        premultiplied_bgra: rgba
            .as_chunks::<4>()
            .0
            .iter()
            .flat_map(premultiplied_bgra)
            .collect(),
    })
}

fn to_rgba(bytes: &[u8], color_type: ColorType) -> Vec<u8> {
    match color_type {
        ColorType::Rgba => bytes.to_vec(),
        ColorType::Rgb => bytes
            .as_chunks::<3>()
            .0
            .iter()
            .flat_map(|p| [p[0], p[1], p[2], 255])
            .collect(),
        ColorType::GrayscaleAlpha => bytes
            .as_chunks::<2>()
            .0
            .iter()
            .flat_map(|p| [p[0], p[0], p[0], p[1]])
            .collect(),
        ColorType::Grayscale | ColorType::Indexed => {
            bytes.iter().flat_map(|&g| [g, g, g, 255]).collect()
        }
    }
}

fn premultiplied_bgra(rgba: &[u8; 4]) -> [u8; 4] {
    let alpha = u32::from(rgba[3]);
    let scale = |channel: u8| ((u32::from(channel) * alpha + 127) / 255) as u8;
    [scale(rgba[2]), scale(rgba[1]), scale(rgba[0]), rgba[3]]
}

#[cfg(test)]
mod tests {
    use super::*;
    use png::{BitDepth, Encoder};

    fn encode(width: u32, height: u32, color: ColorType, data: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        let mut encoder = Encoder::new(&mut out, width, height);
        encoder.set_color(color);
        encoder.set_depth(BitDepth::Eight);
        let mut writer = encoder.write_header().expect("header");
        writer.write_image_data(data).expect("data");
        writer.finish().expect("finish");
        out
    }

    #[test]
    fn opaque_rgba_becomes_bgra_with_same_alpha() {
        let png = encode(1, 1, ColorType::Rgba, &[10, 20, 30, 255]);
        let pixels = decode_icon_png(&png).expect("decode");
        assert_eq!((pixels.width, pixels.height), (1, 1));
        assert_eq!(pixels.premultiplied_bgra, vec![30, 20, 10, 255]);
    }

    #[test]
    fn color_is_premultiplied_by_alpha() {
        let png = encode(1, 1, ColorType::Rgba, &[200, 100, 50, 128]);
        let pixels = decode_icon_png(&png).expect("decode");
        assert_eq!(pixels.premultiplied_bgra, vec![25, 50, 100, 128]);
    }

    #[test]
    fn fully_transparent_pixel_becomes_zero_color() {
        let png = encode(1, 1, ColorType::Rgba, &[200, 100, 50, 0]);
        let pixels = decode_icon_png(&png).expect("decode");
        assert_eq!(pixels.premultiplied_bgra, vec![0, 0, 0, 0]);
    }

    #[test]
    fn rgb_is_opaque() {
        let png = encode(1, 1, ColorType::Rgb, &[1, 2, 3]);
        let pixels = decode_icon_png(&png).expect("decode");
        assert_eq!(pixels.premultiplied_bgra, vec![3, 2, 1, 255]);
    }

    #[test]
    fn grayscale_alpha_expands_to_all_channels() {
        let png = encode(1, 1, ColorType::GrayscaleAlpha, &[100, 255]);
        let pixels = decode_icon_png(&png).expect("decode");
        assert_eq!(pixels.premultiplied_bgra, vec![100, 100, 100, 255]);
    }

    #[test]
    fn rows_stay_top_down() {
        let png = encode(1, 2, ColorType::Rgba, &[1, 0, 0, 255, 2, 0, 0, 255]);
        let pixels = decode_icon_png(&png).expect("decode");
        assert_eq!(pixels.premultiplied_bgra, vec![0, 0, 1, 255, 0, 0, 2, 255]);
    }

    #[test]
    fn garbage_is_an_invalid_png() {
        assert!(matches!(
            decode_icon_png(b"not a png"),
            Err(TaskbarError::InvalidPng(_))
        ));
    }
}
