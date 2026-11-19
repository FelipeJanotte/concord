use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::thread::JoinHandle;
use std::time::Duration;

pub const IDLE_AFTER_SECONDS: u64 = 600;
pub const IDLE_CHECK_INTERVAL: Duration = Duration::from_millis(5000);

#[derive(Debug, thiserror::Error)]
pub enum IdleClockError {
    #[error("o Windows não informou o último uso do teclado e do mouse")]
    Unavailable,
}

pub trait IdleClock: Send + 'static {
    fn idle_seconds(&self) -> Result<u64, IdleClockError>;
}

pub fn is_idle(idle_seconds: u64) -> bool {
    idle_seconds >= IDLE_AFTER_SECONDS
}

#[derive(Debug, Default)]
pub struct IdleTracker {
    idle: bool,
}

impl IdleTracker {
    pub fn observe(&mut self, idle_seconds: u64) -> Option<bool> {
        let now = is_idle(idle_seconds);
        if now == self.idle {
            return None;
        }
        self.idle = now;
        Some(now)
    }
}

pub struct IdleWatcher {
    stop: Sender<()>,
    thread: Option<JoinHandle<()>>,
}

impl IdleWatcher {
    pub fn start(
        clock: impl IdleClock,
        interval: Duration,
        on_change: impl Fn(bool) + Send + 'static,
    ) -> Self {
        let (stop, stopped) = mpsc::channel();
        let thread = std::thread::spawn(move || {
            let mut tracker = IdleTracker::default();
            while let Err(RecvTimeoutError::Timeout) = stopped.recv_timeout(interval) {
                match clock.idle_seconds() {
                    Ok(seconds) => {
                        if let Some(idle) = tracker.observe(seconds) {
                            on_change(idle);
                        }
                    }
                    Err(error) => log::warn!("leitura de ociosidade falhou: {error}"),
                }
            }
        });
        Self {
            stop,
            thread: Some(thread),
        }
    }

    pub fn stop(&mut self) {
        if self.stop.send(()).is_err() {
            log::debug!("vigia de ociosidade já tinha parado");
        }
        if let Some(thread) = self.thread.take() {
            if thread.join().is_err() {
                log::error!("a thread do vigia de ociosidade terminou com pânico");
            }
        }
    }
}

impl Drop for IdleWatcher {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(windows)]
pub struct SystemIdleClock;

#[cfg(windows)]
impl IdleClock for SystemIdleClock {
    fn idle_seconds(&self) -> Result<u64, IdleClockError> {
        use windows::Win32::System::SystemInformation::GetTickCount;
        use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

        let mut information = LASTINPUTINFO {
            cbSize: size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if !unsafe { GetLastInputInfo(&mut information) }.as_bool() {
            return Err(IdleClockError::Unavailable);
        }
        let elapsed_milliseconds = unsafe { GetTickCount() }.wrapping_sub(information.dwTime);
        Ok(u64::from(elapsed_milliseconds / 1000))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;

    #[test]
    fn idle_starts_at_ten_minutes() {
        assert!(!is_idle(599));
        assert!(is_idle(600));
        assert!(is_idle(5000));
    }

    #[test]
    fn tracker_reports_transitions_only() {
        let mut tracker = IdleTracker::default();
        let observed: Vec<_> = [0, 599, 600, 900, 3, 4]
            .into_iter()
            .map(|seconds| tracker.observe(seconds))
            .collect();
        assert_eq!(
            observed,
            vec![None, None, Some(true), None, Some(false), None]
        );
    }

    struct ScriptedClock {
        readings: Arc<Mutex<Vec<Result<u64, IdleClockError>>>>,
    }

    impl IdleClock for ScriptedClock {
        fn idle_seconds(&self) -> Result<u64, IdleClockError> {
            let mut readings = self
                .readings
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if readings.is_empty() {
                return Ok(0);
            }
            readings.remove(0)
        }
    }

    #[test]
    fn watcher_announces_each_transition_and_survives_a_failed_reading() {
        let readings = vec![
            Ok(10),
            Err(IdleClockError::Unavailable),
            Ok(700),
            Ok(800),
            Ok(1),
        ];
        let (sender, receiver) = mpsc::channel();
        let mut watcher = IdleWatcher::start(
            ScriptedClock {
                readings: Arc::new(Mutex::new(readings)),
            },
            Duration::from_millis(5),
            move |idle| {
                let _ = sender.send(idle);
            },
        );
        let first = receiver.recv_timeout(Duration::from_secs(5));
        let second = receiver.recv_timeout(Duration::from_secs(5));
        watcher.stop();
        assert_eq!((first, second), (Ok(true), Ok(false)));
    }
}
