use super::{AudioPublisher, AudioSource, StopSignal};
use crate::audio_frames::AudioChunker;
use crate::error::CaptureError;
use std::time::Duration;

const READ_TIMEOUT: Duration = Duration::from_millis(100);

pub(crate) fn run_audio(
    source: &mut impl AudioSource,
    publisher: &impl AudioPublisher,
    stop: &StopSignal,
) -> Result<(), CaptureError> {
    let mut chunker = AudioChunker::default();
    let mut packet = Vec::new();
    while !stop.is_stopped() {
        packet.clear();
        source.read(READ_TIMEOUT, &mut packet)?;
        chunker.push_little_endian(&packet);
        while let Some(frame) = chunker.next_frame() {
            publisher.publish(&frame)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio_frames::FRAME_SAMPLES;
    use std::cell::RefCell;
    use std::collections::VecDeque;

    struct ScriptedAudio {
        packets: VecDeque<Result<Vec<u8>, CaptureError>>,
        stop: StopSignal,
        timeouts: Vec<Duration>,
    }

    impl AudioSource for ScriptedAudio {
        fn read(&mut self, timeout: Duration, into: &mut Vec<u8>) -> Result<(), CaptureError> {
            self.timeouts.push(timeout);
            match self.packets.pop_front() {
                Some(Ok(bytes)) => {
                    into.extend_from_slice(&bytes);
                    Ok(())
                }
                Some(Err(error)) => Err(error),
                None => {
                    self.stop.stop();
                    Ok(())
                }
            }
        }
    }

    #[derive(Default)]
    struct RecordingPublisher {
        frames: RefCell<Vec<Vec<i16>>>,
    }

    impl AudioPublisher for RecordingPublisher {
        fn publish(&self, frame: &[i16]) -> Result<(), CaptureError> {
            self.frames.borrow_mut().push(frame.to_vec());
            Ok(())
        }
    }

    fn samples_as_bytes(count: usize, value: i16) -> Vec<u8> {
        std::iter::repeat_n(value, count)
            .flat_map(i16::to_le_bytes)
            .collect()
    }

    #[test]
    fn publishes_only_whole_ten_millisecond_frames_until_stopped() -> Result<(), CaptureError> {
        let stop = StopSignal::default();
        let mut source = ScriptedAudio {
            packets: VecDeque::from([
                Ok(samples_as_bytes(700, 3)),
                Ok(Vec::new()),
                Ok(samples_as_bytes(1300, 3)),
            ]),
            stop: stop.clone(),
            timeouts: Vec::new(),
        };
        let publisher = RecordingPublisher::default();
        run_audio(&mut source, &publisher, &stop)?;
        assert_eq!(
            publisher.frames.borrow().clone(),
            vec![vec![3; FRAME_SAMPLES]; 2]
        );
        assert!(
            source
                .timeouts
                .iter()
                .all(|timeout| *timeout == READ_TIMEOUT)
        );
        Ok(())
    }

    #[test]
    fn does_not_read_after_a_stop() -> Result<(), CaptureError> {
        let stop = StopSignal::default();
        stop.stop();
        let mut source = ScriptedAudio {
            packets: VecDeque::new(),
            stop: stop.clone(),
            timeouts: Vec::new(),
        };
        run_audio(&mut source, &RecordingPublisher::default(), &stop)?;
        assert!(source.timeouts.is_empty());
        Ok(())
    }

    #[test]
    fn device_errors_end_the_loop() {
        let stop = StopSignal::default();
        let mut source = ScriptedAudio {
            packets: VecDeque::from([Err(CaptureError::Audio("device removed".into()))]),
            stop: stop.clone(),
            timeouts: Vec::new(),
        };
        let result = run_audio(&mut source, &RecordingPublisher::default(), &stop);
        assert!(matches!(result, Err(CaptureError::Audio(reason)) if reason == "device removed"));
    }
}
