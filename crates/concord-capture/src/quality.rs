#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ShareQuality {
    #[default]
    Smooth,
    Sharp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct QualityPreset {
    pub long_edge: u32,
    pub short_edge: u32,
    pub frames_per_second: u32,
    pub max_bitrate_bps: u32,
}

impl ShareQuality {
    pub(crate) fn preset(self) -> QualityPreset {
        match self {
            Self::Smooth => QualityPreset {
                long_edge: 1920,
                short_edge: 1080,
                frames_per_second: 60,
                max_bitrate_bps: 8_000_000,
            },
            Self::Sharp => QualityPreset {
                long_edge: 2560,
                short_edge: 1440,
                frames_per_second: 30,
                max_bitrate_bps: 12_000_000,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smooth_is_1080p60_at_8_megabits() {
        assert_eq!(
            ShareQuality::Smooth.preset(),
            QualityPreset {
                long_edge: 1920,
                short_edge: 1080,
                frames_per_second: 60,
                max_bitrate_bps: 8_000_000
            }
        );
    }

    #[test]
    fn sharp_is_1440p30_at_12_megabits() {
        assert_eq!(
            ShareQuality::Sharp.preset(),
            QualityPreset {
                long_edge: 2560,
                short_edge: 1440,
                frames_per_second: 30,
                max_bitrate_bps: 12_000_000
            }
        );
    }
}
