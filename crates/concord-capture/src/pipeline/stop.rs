use std::sync::{Arc, Condvar, Mutex, PoisonError};

#[derive(Debug, Clone, Default)]
pub(crate) struct StopSignal {
    state: Arc<(Mutex<bool>, Condvar)>,
}

impl StopSignal {
    pub fn stop(&self) {
        let (stopped, wake) = &*self.state;
        *stopped.lock().unwrap_or_else(PoisonError::into_inner) = true;
        wake.notify_all();
    }

    pub fn is_stopped(&self) -> bool {
        *self.state.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn wait(&self) {
        let (stopped, wake) = &*self.state;
        let guard = stopped.lock().unwrap_or_else(PoisonError::into_inner);
        drop(
            wake.wait_while(guard, |stopped| !*stopped)
                .unwrap_or_else(PoisonError::into_inner),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn starts_running_and_stops_for_every_clone() {
        let signal = StopSignal::default();
        let clone = signal.clone();
        assert!(!clone.is_stopped());
        signal.stop();
        assert!(clone.is_stopped());
    }

    #[test]
    fn wait_returns_once_stopped() {
        let signal = StopSignal::default();
        let stopper = signal.clone();
        let handle = thread::spawn(move || {
            thread::sleep(Duration::from_millis(20));
            stopper.stop();
        });
        signal.wait();
        assert!(signal.is_stopped());
        assert!(handle.join().is_ok());
    }
}
