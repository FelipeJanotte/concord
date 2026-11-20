use std::time::Duration;

const RESEND_INTERVAL: Duration = Duration::from_secs(1);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum FrameDecision {
    Send,
    Drop,
}

#[derive(Debug)]
pub(crate) struct FramePacer {
    minimum_gap: Duration,
    last_sent: Option<Duration>,
}

impl FramePacer {
    pub fn new(frames_per_second: u32) -> Self {
        let frame_interval = Duration::from_secs(1) / frames_per_second.max(1);
        Self {
            minimum_gap: frame_interval - frame_interval / 4,
            last_sent: None,
        }
    }

    pub fn on_frame(&mut self, now: Duration) -> FrameDecision {
        match self.last_sent {
            Some(last) if now.saturating_sub(last) < self.minimum_gap => FrameDecision::Drop,
            _ => {
                self.last_sent = Some(now);
                FrameDecision::Send
            }
        }
    }

    pub fn should_resend(&mut self, now: Duration) -> bool {
        match self.last_sent {
            Some(last) if now.saturating_sub(last) >= RESEND_INTERVAL => {
                self.last_sent = Some(now);
                true
            }
            _ => false,
        }
    }

    pub fn wait_timeout(&self, now: Duration) -> Duration {
        match self.last_sent {
            Some(last) => RESEND_INTERVAL.saturating_sub(now.saturating_sub(last)),
            None => RESEND_INTERVAL,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn millis(value: u64) -> Duration {
        Duration::from_millis(value)
    }

    #[test]
    fn first_frame_is_always_sent() {
        let mut pacer = FramePacer::new(60);
        assert_eq!(pacer.on_frame(millis(5)), FrameDecision::Send);
    }

    #[test]
    fn frames_arriving_faster_than_the_rate_are_dropped() {
        let mut pacer = FramePacer::new(30);
        pacer.on_frame(millis(0));
        assert_eq!(pacer.on_frame(millis(10)), FrameDecision::Drop);
        assert_eq!(pacer.on_frame(millis(33)), FrameDecision::Send);
    }

    #[test]
    fn a_frame_exactly_three_quarters_of_an_interval_later_is_sent() {
        let mut pacer = FramePacer::new(30);
        pacer.on_frame(millis(0));
        assert_eq!(pacer.on_frame(millis(25)), FrameDecision::Send);
    }

    #[test]
    fn small_capture_jitter_below_the_interval_is_tolerated() {
        let mut pacer = FramePacer::new(60);
        pacer.on_frame(millis(0));
        assert_eq!(pacer.on_frame(millis(14)), FrameDecision::Send);
    }

    #[test]
    fn dropped_frames_do_not_move_the_reference_time() {
        let mut pacer = FramePacer::new(30);
        pacer.on_frame(millis(0));
        pacer.on_frame(millis(20));
        assert_eq!(pacer.on_frame(millis(30)), FrameDecision::Send);
    }

    #[test]
    fn static_content_is_resent_once_per_second() {
        let mut pacer = FramePacer::new(60);
        pacer.on_frame(millis(0));
        assert!(!pacer.should_resend(millis(999)));
        assert!(pacer.should_resend(millis(1000)));
        assert!(!pacer.should_resend(millis(1500)));
        assert!(pacer.should_resend(millis(2000)));
    }

    #[test]
    fn nothing_to_resend_before_the_first_frame() {
        let mut pacer = FramePacer::new(60);
        assert!(!pacer.should_resend(millis(5000)));
    }

    #[test]
    fn wait_timeout_ends_when_the_resend_is_due() {
        let mut pacer = FramePacer::new(60);
        assert_eq!(pacer.wait_timeout(millis(0)), RESEND_INTERVAL);
        pacer.on_frame(millis(100));
        assert_eq!(pacer.wait_timeout(millis(400)), millis(700));
        assert_eq!(pacer.wait_timeout(millis(1500)), Duration::ZERO);
    }
}
