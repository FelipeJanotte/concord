use super::{EncodedPublisher, EncoderFactory, SizedFrame, VideoEncoder, VideoSink};
use crate::error::CaptureError;
use crate::frame_size::{FrameSize, target_size};
use crate::quality::QualityPreset;
use crate::rate_control::EncoderControl;
use std::time::Duration;

struct ActiveEncoder<E> {
    encoder: E,
    source: FrameSize,
    target: FrameSize,
}

pub(crate) struct EncodedVideoSink<M: EncoderFactory, P> {
    factory: M,
    publisher: P,
    preset: QualityPreset,
    control: EncoderControl,
    active: Option<ActiveEncoder<M::Encoder>>,
}

impl<M: EncoderFactory, P: EncodedPublisher> EncodedVideoSink<M, P> {
    pub fn new(factory: M, publisher: P, preset: QualityPreset) -> Self {
        Self {
            factory,
            publisher,
            preset,
            control: EncoderControl::new(preset),
            active: None,
        }
    }
}

impl<M, P> VideoSink<<M::Encoder as VideoEncoder>::Frame> for EncodedVideoSink<M, P>
where
    M: EncoderFactory,
    P: EncodedPublisher,
    <M::Encoder as VideoEncoder>::Frame: SizedFrame,
{
    fn send(
        &mut self,
        frame: &<M::Encoder as VideoEncoder>::Frame,
        timestamp: Duration,
    ) -> Result<(), CaptureError> {
        if self.publisher.take_keyframe_request() {
            self.control.request_keyframe();
        }
        if let Some(request) = self.publisher.take_rate_request() {
            self.control.request_rate(request);
        }
        let source = frame.size();
        let active = match self.active.take() {
            Some(active) if active.source == source => active,
            _ => {
                let target = target_size(source, &self.preset);
                let encoder = self.factory.create(source, target, self.control.rate())?;
                self.control.encoder_recreated();
                ActiveEncoder {
                    encoder,
                    source,
                    target,
                }
            }
        };
        let active = self.active.insert(active);
        let command = self.control.next_frame();
        if let Some(rate) = command.new_rate {
            active.encoder.set_rate(rate)?;
        }
        let units = active
            .encoder
            .encode(frame, timestamp, command.force_keyframe)?;
        for unit in &units {
            self.publisher.publish(unit, active.target);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::EncodedUnit;
    use crate::quality::ShareQuality;
    use crate::rate_control::{EncoderRate, RateRequest};
    use std::cell::RefCell;
    use std::rc::Rc;

    #[derive(Debug, Clone)]
    struct FakeFrame {
        id: u32,
        size: FrameSize,
    }

    impl SizedFrame for FakeFrame {
        fn size(&self) -> FrameSize {
            self.size
        }
    }

    #[derive(Debug, Clone, PartialEq, Eq)]
    struct Encoded {
        encoder: usize,
        frame: u32,
        forced_keyframe: bool,
        rate: EncoderRate,
    }

    #[derive(Default)]
    struct Log {
        created: Vec<(FrameSize, FrameSize, EncoderRate)>,
        encoded: Vec<Encoded>,
        published: Vec<(EncodedUnit, FrameSize)>,
        keyframe_requested: bool,
        rate_request: Option<RateRequest>,
        fail_encode: bool,
    }

    type SharedLog = Rc<RefCell<Log>>;

    struct FakeEncoder {
        index: usize,
        rate: EncoderRate,
        log: SharedLog,
    }

    impl VideoEncoder for FakeEncoder {
        type Frame = FakeFrame;

        fn set_rate(&mut self, rate: EncoderRate) -> Result<(), CaptureError> {
            self.rate = rate;
            Ok(())
        }

        fn encode(
            &mut self,
            frame: &FakeFrame,
            timestamp: Duration,
            force_keyframe: bool,
        ) -> Result<Vec<EncodedUnit>, CaptureError> {
            let mut log = self.log.borrow_mut();
            if log.fail_encode {
                return Err(CaptureError::Encoder("hardware hung".into()));
            }
            log.encoded.push(Encoded {
                encoder: self.index,
                frame: frame.id,
                forced_keyframe: force_keyframe,
                rate: self.rate,
            });
            Ok(vec![EncodedUnit {
                data: vec![frame.id as u8],
                timestamp,
                keyframe: force_keyframe,
            }])
        }
    }

    struct FakeFactory(SharedLog);

    impl EncoderFactory for FakeFactory {
        type Encoder = FakeEncoder;

        fn create(
            &mut self,
            source: FrameSize,
            target: FrameSize,
            rate: EncoderRate,
        ) -> Result<FakeEncoder, CaptureError> {
            let mut log = self.0.borrow_mut();
            log.created.push((source, target, rate));
            Ok(FakeEncoder {
                index: log.created.len() - 1,
                rate,
                log: Rc::clone(&self.0),
            })
        }
    }

    struct FakePublisher(SharedLog);

    impl EncodedPublisher for FakePublisher {
        fn publish(&self, unit: &EncodedUnit, size: FrameSize) {
            self.0.borrow_mut().published.push((unit.clone(), size));
        }

        fn take_keyframe_request(&self) -> bool {
            std::mem::take(&mut self.0.borrow_mut().keyframe_requested)
        }

        fn take_rate_request(&self) -> Option<RateRequest> {
            self.0.borrow_mut().rate_request.take()
        }
    }

    fn size(width: u32, height: u32) -> FrameSize {
        FrameSize { width, height }
    }

    fn frame(id: u32, width: u32, height: u32) -> FakeFrame {
        FakeFrame {
            id,
            size: size(width, height),
        }
    }

    fn smooth_sink() -> (EncodedVideoSink<FakeFactory, FakePublisher>, SharedLog) {
        let log = SharedLog::default();
        let sink = EncodedVideoSink::new(
            FakeFactory(Rc::clone(&log)),
            FakePublisher(Rc::clone(&log)),
            ShareQuality::Smooth.preset(),
        );
        (sink, log)
    }

    const PRESET_RATE: EncoderRate = EncoderRate {
        bitrate_bps: 8_000_000,
        frames_per_second: 60,
    };

    #[test]
    fn first_frame_creates_a_scaled_encoder_and_publishes_a_keyframe() -> Result<(), CaptureError> {
        let (mut sink, log) = smooth_sink();
        sink.send(&frame(1, 3840, 2160), Duration::from_millis(16))?;
        let log = log.borrow();
        assert_eq!(
            log.created,
            vec![(size(3840, 2160), size(1920, 1080), PRESET_RATE)]
        );
        assert_eq!(
            log.encoded,
            vec![Encoded {
                encoder: 0,
                frame: 1,
                forced_keyframe: true,
                rate: PRESET_RATE
            }]
        );
        assert_eq!(
            log.published,
            vec![(
                EncodedUnit {
                    data: vec![1],
                    timestamp: Duration::from_millis(16),
                    keyframe: true
                },
                size(1920, 1080)
            )]
        );
        Ok(())
    }

    #[test]
    fn later_frames_reuse_the_encoder_as_delta_frames() -> Result<(), CaptureError> {
        let (mut sink, log) = smooth_sink();
        sink.send(&frame(1, 1920, 1080), Duration::ZERO)?;
        sink.send(&frame(2, 1920, 1080), Duration::from_millis(16))?;
        let log = log.borrow();
        assert_eq!(log.created.len(), 1);
        assert_eq!(
            log.encoded[1],
            Encoded {
                encoder: 0,
                frame: 2,
                forced_keyframe: false,
                rate: PRESET_RATE
            }
        );
        Ok(())
    }

    #[test]
    fn receiver_keyframe_request_forces_the_next_frame() -> Result<(), CaptureError> {
        let (mut sink, log) = smooth_sink();
        sink.send(&frame(1, 1920, 1080), Duration::ZERO)?;
        log.borrow_mut().keyframe_requested = true;
        sink.send(&frame(2, 1920, 1080), Duration::from_millis(16))?;
        sink.send(&frame(3, 1920, 1080), Duration::from_millis(32))?;
        let forced: Vec<bool> = log
            .borrow()
            .encoded
            .iter()
            .map(|entry| entry.forced_keyframe)
            .collect();
        assert_eq!(forced, vec![true, true, false]);
        Ok(())
    }

    #[test]
    fn rate_request_reaches_the_encoder_capped_by_the_preset() -> Result<(), CaptureError> {
        let (mut sink, log) = smooth_sink();
        sink.send(&frame(1, 1920, 1080), Duration::ZERO)?;
        log.borrow_mut().rate_request = Some(RateRequest {
            bitrate_bps: 3_000_000,
            frames_per_second: 30.0,
        });
        sink.send(&frame(2, 1920, 1080), Duration::from_millis(33))?;
        log.borrow_mut().rate_request = Some(RateRequest {
            bitrate_bps: 40_000_000,
            frames_per_second: 60.0,
        });
        sink.send(&frame(3, 1920, 1080), Duration::from_millis(66))?;
        let rates: Vec<EncoderRate> = log
            .borrow()
            .encoded
            .iter()
            .map(|entry| entry.rate)
            .collect();
        assert_eq!(
            rates,
            vec![
                PRESET_RATE,
                EncoderRate {
                    bitrate_bps: 3_000_000,
                    frames_per_second: 30
                },
                PRESET_RATE
            ]
        );
        Ok(())
    }

    #[test]
    fn resized_source_recreates_the_encoder_with_the_current_rate_and_a_keyframe()
    -> Result<(), CaptureError> {
        let (mut sink, log) = smooth_sink();
        sink.send(&frame(1, 1920, 1080), Duration::ZERO)?;
        log.borrow_mut().rate_request = Some(RateRequest {
            bitrate_bps: 2_000_000,
            frames_per_second: 60.0,
        });
        sink.send(&frame(2, 1920, 1080), Duration::from_millis(16))?;
        sink.send(&frame(3, 1281, 721), Duration::from_millis(32))?;
        let log = log.borrow();
        let reduced = EncoderRate {
            bitrate_bps: 2_000_000,
            frames_per_second: 60,
        };
        assert_eq!(log.created[1], (size(1281, 721), size(1280, 720), reduced));
        assert_eq!(
            log.encoded[2],
            Encoded {
                encoder: 1,
                frame: 3,
                forced_keyframe: true,
                rate: reduced
            }
        );
        assert_eq!(log.published[2].1, size(1280, 720));
        Ok(())
    }

    #[test]
    fn encoder_errors_are_returned() {
        let (mut sink, log) = smooth_sink();
        log.borrow_mut().fail_encode = true;
        let result = sink.send(&frame(1, 1920, 1080), Duration::ZERO);
        assert!(matches!(result, Err(CaptureError::Encoder(reason)) if reason == "hardware hung"));
        assert!(log.borrow().published.is_empty());
    }
}
