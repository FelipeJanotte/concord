use crate::quality::QualityPreset;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct RateRequest {
    pub bitrate_bps: u64,
    pub frames_per_second: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct EncoderRate {
    pub bitrate_bps: u32,
    pub frames_per_second: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct FrameCommand {
    pub force_keyframe: bool,
    pub new_rate: Option<EncoderRate>,
}

#[derive(Debug)]
pub(crate) struct EncoderControl {
    preset: QualityPreset,
    rate: EncoderRate,
    keyframe_pending: bool,
    rate_pending: bool,
}

impl EncoderControl {
    pub fn new(preset: QualityPreset) -> Self {
        Self {
            preset,
            rate: EncoderRate {
                bitrate_bps: preset.max_bitrate_bps,
                frames_per_second: preset.frames_per_second,
            },
            keyframe_pending: true,
            rate_pending: false,
        }
    }

    pub fn rate(&self) -> EncoderRate {
        self.rate
    }

    pub fn request_keyframe(&mut self) {
        self.keyframe_pending = true;
    }

    pub fn request_rate(&mut self, request: RateRequest) {
        if request.bitrate_bps == 0 {
            return;
        }
        let bitrate_bps = request
            .bitrate_bps
            .min(u64::from(self.preset.max_bitrate_bps)) as u32;
        let frames_per_second =
            (request.frames_per_second.round() as u32).clamp(1, self.preset.frames_per_second);
        let requested = EncoderRate {
            bitrate_bps,
            frames_per_second,
        };
        if requested != self.rate {
            self.rate = requested;
            self.rate_pending = true;
        }
    }

    pub fn encoder_recreated(&mut self) {
        self.keyframe_pending = true;
        self.rate_pending = false;
    }

    pub fn next_frame(&mut self) -> FrameCommand {
        let command = FrameCommand {
            force_keyframe: self.keyframe_pending,
            new_rate: self.rate_pending.then_some(self.rate),
        };
        self.keyframe_pending = false;
        self.rate_pending = false;
        command
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quality::ShareQuality;

    fn smooth_control() -> EncoderControl {
        EncoderControl::new(ShareQuality::Smooth.preset())
    }

    fn request(bitrate_bps: u64, frames_per_second: f64) -> RateRequest {
        RateRequest {
            bitrate_bps,
            frames_per_second,
        }
    }

    #[test]
    fn starts_at_the_preset_cap_and_opens_with_a_keyframe() {
        let mut control = smooth_control();
        assert_eq!(
            control.rate(),
            EncoderRate {
                bitrate_bps: 8_000_000,
                frames_per_second: 60
            }
        );
        assert_eq!(
            control.next_frame(),
            FrameCommand {
                force_keyframe: true,
                new_rate: None
            }
        );
        assert_eq!(
            control.next_frame(),
            FrameCommand {
                force_keyframe: false,
                new_rate: None
            }
        );
    }

    #[test]
    fn keyframe_request_forces_exactly_the_next_frame() {
        let mut control = smooth_control();
        control.next_frame();
        control.request_keyframe();
        control.request_keyframe();
        assert!(control.next_frame().force_keyframe);
        assert!(!control.next_frame().force_keyframe);
    }

    #[test]
    fn rate_request_below_cap_is_applied_once() {
        let mut control = smooth_control();
        control.next_frame();
        control.request_rate(request(2_500_000, 30.0));
        let expected = EncoderRate {
            bitrate_bps: 2_500_000,
            frames_per_second: 30,
        };
        assert_eq!(control.next_frame().new_rate, Some(expected));
        assert_eq!(control.next_frame().new_rate, None);
        assert_eq!(control.rate(), expected);
    }

    #[test]
    fn rate_request_above_cap_is_clamped_to_the_preset() {
        let mut control = smooth_control();
        control.next_frame();
        control.request_rate(request(3_000_000, 60.0));
        control.next_frame();
        control.request_rate(request(50_000_000, 144.0));
        assert_eq!(
            control.next_frame().new_rate,
            Some(EncoderRate {
                bitrate_bps: 8_000_000,
                frames_per_second: 60
            })
        );
    }

    #[test]
    fn unchanged_rate_does_not_reconfigure_the_encoder() {
        let mut control = smooth_control();
        control.next_frame();
        control.request_rate(request(9_000_000, 60.0));
        assert_eq!(control.next_frame().new_rate, None);
    }

    #[test]
    fn zero_bitrate_pause_request_is_ignored() {
        let mut control = smooth_control();
        control.next_frame();
        control.request_rate(request(0, 0.0));
        assert_eq!(control.next_frame().new_rate, None);
        assert_eq!(
            control.rate(),
            EncoderRate {
                bitrate_bps: 8_000_000,
                frames_per_second: 60
            }
        );
    }

    #[test]
    fn fractional_and_tiny_frame_rates_round_and_stay_positive() {
        let mut control = smooth_control();
        control.next_frame();
        control.request_rate(request(1_000_000, 0.2));
        assert_eq!(
            control
                .next_frame()
                .new_rate
                .map(|rate| rate.frames_per_second),
            Some(1)
        );
        control.request_rate(request(1_000_000, 29.97));
        assert_eq!(
            control
                .next_frame()
                .new_rate
                .map(|rate| rate.frames_per_second),
            Some(30)
        );
    }

    #[test]
    fn recreated_encoder_gets_a_keyframe_and_no_stale_rate_change() {
        let mut control = smooth_control();
        control.next_frame();
        control.request_rate(request(2_000_000, 30.0));
        control.encoder_recreated();
        assert_eq!(
            control.next_frame(),
            FrameCommand {
                force_keyframe: true,
                new_rate: None
            }
        );
        assert_eq!(
            control.rate(),
            EncoderRate {
                bitrate_bps: 2_000_000,
                frames_per_second: 30
            }
        );
    }
}
