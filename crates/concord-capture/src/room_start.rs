use crate::error::CaptureError;
use std::sync::mpsc::RecvTimeoutError;
use std::time::Duration;

pub(crate) const ROOM_CONNECT_LIMIT: Duration = Duration::from_secs(10);
pub(crate) const ROOM_READY_MARGIN: Duration = Duration::from_secs(2);

pub(crate) fn room_ready_limit() -> Duration {
    ROOM_CONNECT_LIMIT + ROOM_READY_MARGIN
}

pub(crate) fn ready_or_error<T>(
    received: Result<Result<T, CaptureError>, RecvTimeoutError>,
) -> Result<T, CaptureError> {
    match received {
        Ok(outcome) => outcome,
        Err(RecvTimeoutError::Timeout) => Err(CaptureError::ConnectTimedOut),
        Err(RecvTimeoutError::Disconnected) => Err(CaptureError::Thread(
            "room thread ended before connecting".into(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_wait_for_the_room_outlasts_the_connect_limit() {
        assert!(room_ready_limit() > ROOM_CONNECT_LIMIT);
    }

    #[test]
    fn a_timed_out_wait_is_a_distinct_connect_error() {
        let outcome: Result<(), CaptureError> = ready_or_error(Err(RecvTimeoutError::Timeout));
        assert!(matches!(outcome, Err(CaptureError::ConnectTimedOut)));
    }

    #[test]
    fn a_vanished_room_thread_is_a_thread_error() {
        let outcome: Result<(), CaptureError> = ready_or_error(Err(RecvTimeoutError::Disconnected));
        assert!(matches!(outcome, Err(CaptureError::Thread(_))));
    }

    #[test]
    fn the_room_outcome_passes_through() {
        assert_eq!(ready_or_error::<u8>(Ok(Ok(3))).ok(), Some(3));
        let failed: Result<u8, CaptureError> =
            ready_or_error(Ok(Err(CaptureError::Publish("x".into()))));
        assert!(matches!(failed, Err(CaptureError::Publish(_))));
    }
}
