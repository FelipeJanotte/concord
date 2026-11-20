use std::time::{Duration, Instant};

pub struct Settling<T> {
    delay: Duration,
    pending: Option<(T, Instant)>,
}

impl<T> Settling<T> {
    pub fn new(delay: Duration) -> Self {
        Self {
            delay,
            pending: None,
        }
    }

    pub fn push(&mut self, value: T, now: Instant) {
        self.pending = Some((value, now + self.delay));
    }

    pub fn deadline(&self) -> Option<Instant> {
        self.pending.as_ref().map(|(_, deadline)| *deadline)
    }

    pub fn take_settled(&mut self, now: Instant) -> Option<T> {
        let ready = self.deadline().is_some_and(|deadline| now >= deadline);
        if ready {
            self.pending.take().map(|(value, _)| value)
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DELAY: Duration = Duration::from_millis(250);

    #[test]
    fn nothing_settles_before_the_delay() {
        let start = Instant::now();
        let mut settling = Settling::new(DELAY);
        settling.push(1, start);
        assert_eq!(
            settling.take_settled(start + Duration::from_millis(249)),
            None
        );
        assert_eq!(settling.take_settled(start + DELAY), Some(1));
        assert_eq!(settling.take_settled(start + DELAY), None);
    }

    #[test]
    fn a_new_value_restarts_the_wait_and_replaces_the_old_one() {
        let start = Instant::now();
        let mut settling = Settling::new(DELAY);
        settling.push(1, start);
        settling.push(2, start + Duration::from_millis(200));
        assert_eq!(settling.take_settled(start + DELAY), None);
        assert_eq!(
            settling.deadline(),
            Some(start + Duration::from_millis(450))
        );
        assert_eq!(
            settling.take_settled(start + Duration::from_millis(450)),
            Some(2)
        );
    }
}
