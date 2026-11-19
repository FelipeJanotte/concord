use crate::quality::QualityPreset;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct FrameSize {
    pub width: u32,
    pub height: u32,
}

const THUMBNAIL_WIDTH: u32 = 320;

pub(crate) fn target_size(source: FrameSize, preset: &QualityPreset) -> FrameSize {
    let long = source.width.max(source.height).max(1);
    let short = source.width.min(source.height).max(1);
    let scale = (f64::from(preset.long_edge) / f64::from(long))
        .min(f64::from(preset.short_edge) / f64::from(short))
        .min(1.0);
    FrameSize {
        width: scaled_even(source.width, scale),
        height: scaled_even(source.height, scale),
    }
}

pub(crate) fn thumbnail_size(source: FrameSize) -> FrameSize {
    if source.width <= THUMBNAIL_WIDTH {
        return source;
    }
    let height = u64::from(source.height) * u64::from(THUMBNAIL_WIDTH) / u64::from(source.width);
    FrameSize {
        width: THUMBNAIL_WIDTH,
        height: u32::try_from(height).unwrap_or(u32::MAX).max(1),
    }
}

fn scaled_even(dimension: u32, scale: f64) -> u32 {
    let scaled = (f64::from(dimension) * scale).floor() as u32;
    (scaled & !1).max(2)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quality::ShareQuality;

    fn size(width: u32, height: u32) -> FrameSize {
        FrameSize { width, height }
    }

    #[test]
    fn downscales_4k_screen_to_preset_keeping_aspect() {
        let smooth = ShareQuality::Smooth.preset();
        assert_eq!(target_size(size(3840, 2160), &smooth), size(1920, 1080));
        let sharp = ShareQuality::Sharp.preset();
        assert_eq!(target_size(size(3840, 2160), &sharp), size(2560, 1440));
    }

    #[test]
    fn four_by_three_sources_are_limited_by_the_short_edge() {
        let smooth = ShareQuality::Smooth.preset();
        assert_eq!(target_size(size(2000, 1500), &smooth), size(1440, 1080));
    }

    #[test]
    fn never_upscales_small_sources() {
        let smooth = ShareQuality::Smooth.preset();
        assert_eq!(target_size(size(1280, 720), &smooth), size(1280, 720));
    }

    #[test]
    fn rounds_odd_dimensions_down_to_even() {
        let smooth = ShareQuality::Smooth.preset();
        assert_eq!(target_size(size(801, 601), &smooth), size(800, 600));
    }

    #[test]
    fn portrait_sources_use_the_long_edge_bound() {
        let smooth = ShareQuality::Smooth.preset();
        assert_eq!(target_size(size(2160, 3840), &smooth), size(1080, 1920));
    }

    #[test]
    fn ultrawide_is_limited_by_the_long_edge() {
        let smooth = ShareQuality::Smooth.preset();
        assert_eq!(target_size(size(5120, 1440), &smooth), size(1920, 540));
    }

    #[test]
    fn tiny_sources_keep_at_least_two_pixels() {
        let smooth = ShareQuality::Smooth.preset();
        assert_eq!(target_size(size(1, 1), &smooth), size(2, 2));
        assert_eq!(target_size(size(7680, 1), &smooth), size(1920, 2));
    }

    #[test]
    fn thumbnails_are_320_wide_with_proportional_height() {
        assert_eq!(thumbnail_size(size(1920, 1080)), size(320, 180));
        assert_eq!(thumbnail_size(size(1000, 3000)), size(320, 960));
    }

    #[test]
    fn thumbnails_never_upscale_or_collapse() {
        assert_eq!(thumbnail_size(size(200, 100)), size(200, 100));
        assert_eq!(thumbnail_size(size(6400, 1)), size(320, 1));
    }
}
