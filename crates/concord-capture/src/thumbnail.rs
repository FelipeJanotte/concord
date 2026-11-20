use crate::error::CaptureError;
use crate::frame_size::FrameSize;

pub(crate) fn bgra_to_opaque_rgba(bgra: &[u8]) -> Vec<u8> {
    bgra.as_chunks::<4>()
        .0
        .iter()
        .flat_map(|&[blue, green, red, _]| [red, green, blue, u8::MAX])
        .collect()
}

pub(crate) fn encode_png(rgba: &[u8], size: FrameSize) -> Result<Vec<u8>, CaptureError> {
    let mut bytes = Vec::new();
    let mut encoder = png::Encoder::new(&mut bytes, size.width, size.height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header()?;
    writer.write_image_data(rgba)?;
    writer.finish()?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn swaps_red_and_blue_and_forces_opaque_alpha() {
        let bgra = [10, 20, 30, 0, 1, 2, 3, 128];
        assert_eq!(
            bgra_to_opaque_rgba(&bgra),
            vec![30, 20, 10, 255, 3, 2, 1, 255]
        );
    }

    #[test]
    fn png_decodes_back_to_the_same_pixels() -> Result<(), Box<dyn std::error::Error>> {
        let size = FrameSize {
            width: 2,
            height: 1,
        };
        let rgba = [255, 0, 0, 255, 0, 0, 255, 255];
        let png_bytes = encode_png(&rgba, size)?;
        let mut reader = png::Decoder::new(std::io::Cursor::new(png_bytes)).read_info()?;
        let mut pixels = vec![0; reader.output_buffer_size().ok_or("unknown png size")?];
        let info = reader.next_frame(&mut pixels)?;
        assert_eq!((info.width, info.height), (2, 1));
        assert_eq!(&pixels[..info.buffer_size()], &rgba);
        Ok(())
    }

    #[test]
    fn rejects_pixel_buffers_that_do_not_match_the_size() {
        let size = FrameSize {
            width: 2,
            height: 2,
        };
        assert!(encode_png(&[0; 4], size).is_err());
    }
}
