use super::{Clock, FrameSource, SourceEvent, StopSignal, VideoSink};
use crate::error::CaptureError;
use crate::pacing::{FrameDecision, FramePacer};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum VideoEnd {
    Stopped,
    SourceClosed,
}

pub(crate) fn run_video<S, K>(
    source: &mut S,
    sink: &mut K,
    pacer: &mut FramePacer,
    clock: &impl Clock,
    stop: &StopSignal,
) -> Result<VideoEnd, CaptureError>
where
    S: FrameSource,
    K: VideoSink<S::Frame>,
{
    let mut last_frame: Option<S::Frame> = None;
    while !stop.is_stopped() {
        let event = source.next_event(pacer.wait_timeout(clock.elapsed()));
        if stop.is_stopped() {
            break;
        }
        let now = clock.elapsed();
        match event? {
            SourceEvent::Frame(frame) => {
                if pacer.on_frame(now) == FrameDecision::Send {
                    sink.send(&frame, now)?;
                    last_frame = Some(frame);
                }
            }
            SourceEvent::Idle => {
                if let Some(frame) = &last_frame
                    && pacer.should_resend(now)
                {
                    sink.send(frame, now)?;
                }
            }
            SourceEvent::Closed => return Ok(VideoEnd::SourceClosed),
        }
    }
    Ok(VideoEnd::Stopped)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::frame_size::FrameSize;
    use crate::pipeline::SizedFrame;
    use std::cell::{Cell, RefCell};
    use std::collections::VecDeque;
    use std::rc::Rc;
    use std::time::Duration;

    #[derive(Debug, Clone, PartialEq, Eq)]
    struct FakeFrame(u32);

    impl SizedFrame for FakeFrame {
        fn size(&self) -> FrameSize {
            FrameSize {
                width: 1920,
                height: 1080,
            }
        }
    }

    enum Step {
        Frame(u64, u32),
        Idle(u64),
        Closed,
        Fail,
        StopAt(u64),
        FailAfterStop,
    }

    #[derive(Clone, Default)]
    struct FakeClock(Rc<Cell<Duration>>);

    impl Clock for FakeClock {
        fn elapsed(&self) -> Duration {
            self.0.get()
        }
    }

    struct ScriptedSource {
        steps: VecDeque<Step>,
        clock: FakeClock,
        stop: StopSignal,
        timeouts: Rc<RefCell<Vec<Duration>>>,
    }

    impl FrameSource for ScriptedSource {
        type Frame = FakeFrame;

        fn next_event(
            &mut self,
            timeout: Duration,
        ) -> Result<SourceEvent<FakeFrame>, CaptureError> {
            self.timeouts.borrow_mut().push(timeout);
            match self.steps.pop_front() {
                Some(Step::Frame(at, id)) => {
                    self.clock.0.set(Duration::from_millis(at));
                    Ok(SourceEvent::Frame(FakeFrame(id)))
                }
                Some(Step::Idle(at)) => {
                    self.clock.0.set(Duration::from_millis(at));
                    Ok(SourceEvent::Idle)
                }
                Some(Step::StopAt(at)) => {
                    self.clock.0.set(Duration::from_millis(at));
                    self.stop.stop();
                    Ok(SourceEvent::Frame(FakeFrame(u32::MAX)))
                }
                Some(Step::Fail) => Err(CaptureError::Capture("device lost".into())),
                Some(Step::FailAfterStop) => {
                    self.stop.stop();
                    Err(CaptureError::Capture("capture thread ended".into()))
                }
                Some(Step::Closed) | None => Ok(SourceEvent::Closed),
            }
        }
    }

    #[derive(Default)]
    struct RecordingSink {
        sent: Vec<(u32, Duration)>,
        fail: bool,
    }

    impl VideoSink<FakeFrame> for RecordingSink {
        fn send(&mut self, frame: &FakeFrame, timestamp: Duration) -> Result<(), CaptureError> {
            if self.fail {
                return Err(CaptureError::Encoder("encoder lost".into()));
            }
            self.sent.push((frame.0, timestamp));
            Ok(())
        }
    }

    struct Run {
        result: Result<VideoEnd, CaptureError>,
        sent: Vec<(u32, Duration)>,
        timeouts: Vec<Duration>,
    }

    fn run(steps: Vec<Step>, frames_per_second: u32, failing_sink: bool) -> Run {
        let clock = FakeClock::default();
        let stop = StopSignal::default();
        let timeouts = Rc::new(RefCell::new(Vec::new()));
        let mut source = ScriptedSource {
            steps: steps.into(),
            clock: clock.clone(),
            stop: stop.clone(),
            timeouts: Rc::clone(&timeouts),
        };
        let mut sink = RecordingSink {
            sent: Vec::new(),
            fail: failing_sink,
        };
        let mut pacer = FramePacer::new(frames_per_second);
        let result = run_video(&mut source, &mut sink, &mut pacer, &clock, &stop);
        let timeouts = timeouts.borrow().clone();
        Run {
            result,
            sent: sink.sent,
            timeouts,
        }
    }

    fn millis(value: u64) -> Duration {
        Duration::from_millis(value)
    }

    #[test]
    fn sends_captured_frames_with_clock_timestamps_until_the_source_closes() {
        let outcome = run(
            vec![Step::Frame(0, 1), Step::Frame(40, 2), Step::Closed],
            30,
            false,
        );
        assert!(matches!(outcome.result, Ok(VideoEnd::SourceClosed)));
        assert_eq!(outcome.sent, vec![(1, millis(0)), (2, millis(40))]);
    }

    #[test]
    fn drops_frames_faster_than_the_preset_rate() {
        let outcome = run(
            vec![
                Step::Frame(0, 1),
                Step::Frame(5, 2),
                Step::Frame(34, 3),
                Step::Closed,
            ],
            30,
            false,
        );
        assert_eq!(outcome.sent, vec![(1, millis(0)), (3, millis(34))]);
    }

    #[test]
    fn resends_the_last_frame_when_content_is_static() {
        let outcome = run(
            vec![
                Step::Frame(0, 7),
                Step::Idle(500),
                Step::Idle(1000),
                Step::Idle(1400),
                Step::Closed,
            ],
            60,
            false,
        );
        assert_eq!(outcome.sent, vec![(7, millis(0)), (7, millis(1000))]);
    }

    #[test]
    fn idle_before_any_frame_sends_nothing() {
        let outcome = run(vec![Step::Idle(3000), Step::Closed], 60, false);
        assert!(outcome.sent.is_empty());
    }

    #[test]
    fn waits_on_the_source_only_until_the_next_resend_is_due() {
        let outcome = run(
            vec![Step::Frame(200, 1), Step::Idle(700), Step::Closed],
            60,
            false,
        );
        assert_eq!(
            outcome.timeouts,
            vec![millis(1000), millis(1000), millis(500)]
        );
    }

    #[test]
    fn stop_signal_ends_the_loop_without_sending_more() {
        let outcome = run(
            vec![Step::Frame(0, 1), Step::StopAt(100), Step::Frame(200, 3)],
            60,
            false,
        );
        assert!(matches!(outcome.result, Ok(VideoEnd::Stopped)));
        assert_eq!(outcome.sent, vec![(1, millis(0))]);
    }

    #[test]
    fn source_errors_caused_by_stopping_are_a_normal_stop() {
        let outcome = run(vec![Step::Frame(0, 1), Step::FailAfterStop], 60, false);
        assert!(matches!(outcome.result, Ok(VideoEnd::Stopped)));
    }

    #[test]
    fn source_errors_end_the_loop() {
        let outcome = run(vec![Step::Frame(0, 1), Step::Fail], 60, false);
        assert!(
            matches!(outcome.result, Err(CaptureError::Capture(reason)) if reason == "device lost")
        );
    }

    #[test]
    fn sink_errors_end_the_loop() {
        let outcome = run(vec![Step::Frame(0, 1), Step::Closed], 60, true);
        assert!(
            matches!(outcome.result, Err(CaptureError::Encoder(reason)) if reason == "encoder lost")
        );
    }
}
