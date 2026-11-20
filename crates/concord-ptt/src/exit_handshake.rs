use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::thread::JoinHandle;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ExitOutcome {
    Exited,
    Panicked,
    TimedOut,
}

pub(crate) fn join_after_exit(
    exit_signal: &Receiver<()>,
    thread: JoinHandle<()>,
    limit: Duration,
) -> ExitOutcome {
    match exit_signal.recv_timeout(limit) {
        Err(RecvTimeoutError::Timeout) => ExitOutcome::TimedOut,
        Ok(()) | Err(RecvTimeoutError::Disconnected) => match thread.join() {
            Ok(()) => ExitOutcome::Exited,
            Err(_) => ExitOutcome::Panicked,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    const SHORT: Duration = Duration::from_millis(50);

    #[test]
    fn a_thread_that_exits_is_joined() {
        let (signal, exited) = mpsc::channel::<()>();
        let thread = std::thread::spawn(move || drop(signal));
        assert_eq!(
            join_after_exit(&exited, thread, SHORT * 20),
            ExitOutcome::Exited
        );
    }

    #[test]
    fn a_thread_that_panics_after_signalling_is_reported() {
        let (signal, exited) = mpsc::channel::<()>();
        let thread = std::thread::spawn(move || {
            drop(signal);
            panic!("listener failed");
        });
        assert_eq!(
            join_after_exit(&exited, thread, SHORT * 20),
            ExitOutcome::Panicked
        );
    }

    #[test]
    fn a_thread_that_never_exits_is_not_joined() {
        let (signal, exited) = mpsc::channel::<()>();
        let (release, held) = mpsc::channel::<()>();
        let thread = std::thread::spawn(move || {
            let _signal = signal;
            let _ = held.recv();
        });
        assert_eq!(
            join_after_exit(&exited, thread, SHORT),
            ExitOutcome::TimedOut
        );
        drop(release);
    }
}
