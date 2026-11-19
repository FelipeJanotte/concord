mod audio_loop;
mod encoded_sink;
mod stop;
mod video_loop;

pub(crate) use audio_loop::run_audio;
pub(crate) use encoded_sink::EncodedVideoSink;
pub(crate) use stop::StopSignal;
pub(crate) use video_loop::{VideoEnd, run_video};

use crate::error::CaptureError;
use crate::frame_size::FrameSize;
use crate::rate_control::{EncoderRate, RateRequest};
use std::time::{Duration, Instant};

pub(crate) trait Clock {
    fn elapsed(&self) -> Duration;
}

pub(crate) struct MonotonicClock {
    origin: Instant,
}

impl MonotonicClock {
    pub fn start() -> Self {
        Self {
            origin: Instant::now(),
        }
    }
}

impl Clock for MonotonicClock {
    fn elapsed(&self) -> Duration {
        self.origin.elapsed()
    }
}

pub(crate) trait SizedFrame {
    fn size(&self) -> FrameSize;
}

#[derive(Debug)]
pub(crate) enum SourceEvent<F> {
    Frame(F),
    Idle,
    Closed,
}

pub(crate) trait FrameSource {
    type Frame: SizedFrame + Clone;
    fn next_event(&mut self, timeout: Duration) -> Result<SourceEvent<Self::Frame>, CaptureError>;
}

pub(crate) trait VideoSink<F> {
    fn send(&mut self, frame: &F, timestamp: Duration) -> Result<(), CaptureError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct EncodedUnit {
    pub data: Vec<u8>,
    pub timestamp: Duration,
    pub keyframe: bool,
}

pub(crate) trait VideoEncoder {
    type Frame;
    fn set_rate(&mut self, rate: EncoderRate) -> Result<(), CaptureError>;
    fn encode(
        &mut self,
        frame: &Self::Frame,
        timestamp: Duration,
        force_keyframe: bool,
    ) -> Result<Vec<EncodedUnit>, CaptureError>;
}

pub(crate) trait EncoderFactory {
    type Encoder: VideoEncoder;
    fn create(
        &mut self,
        source: FrameSize,
        target: FrameSize,
        rate: EncoderRate,
    ) -> Result<Self::Encoder, CaptureError>;
}

pub(crate) trait EncodedPublisher {
    fn publish(&self, unit: &EncodedUnit, size: FrameSize);
    fn take_keyframe_request(&self) -> bool;
    fn take_rate_request(&self) -> Option<RateRequest>;
}

pub(crate) trait AudioSource {
    fn read(&mut self, timeout: Duration, into: &mut Vec<u8>) -> Result<(), CaptureError>;
}

pub(crate) trait AudioPublisher {
    fn publish(&self, frame: &[i16]) -> Result<(), CaptureError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn monotonic_clock_advances_with_real_time() {
        let clock = MonotonicClock::start();
        std::thread::sleep(Duration::from_millis(5));
        assert!(clock.elapsed() >= Duration::from_millis(5));
    }
}
