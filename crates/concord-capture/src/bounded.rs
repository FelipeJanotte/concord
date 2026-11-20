use crate::error::CaptureError;
use std::future::Future;
use std::time::Duration;

pub(crate) async fn within<T>(
    limit: Duration,
    stage: &str,
    future: impl Future<Output = Result<T, CaptureError>>,
) -> Result<T, CaptureError> {
    tokio::time::timeout(limit, future)
        .await
        .map_err(|_| CaptureError::Publish(format!("{stage} timed out")))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(start_paused = true)]
    async fn a_future_that_never_completes_fails_with_publish_after_the_limit() {
        let outcome: Result<(), CaptureError> = within(
            Duration::from_secs(3),
            "closing the room",
            std::future::pending(),
        )
        .await;
        assert!(
            matches!(outcome, Err(CaptureError::Publish(message)) if message == "closing the room timed out")
        );
    }

    #[tokio::test(start_paused = true)]
    async fn a_future_that_completes_in_time_keeps_its_value() {
        let outcome = within(Duration::from_secs(3), "stage", async { Ok(7) }).await;
        assert_eq!(outcome.unwrap(), 7);
    }

    #[tokio::test(start_paused = true)]
    async fn the_error_of_a_future_that_completes_in_time_is_kept() {
        let outcome: Result<(), CaptureError> = within(Duration::from_secs(3), "stage", async {
            Err(CaptureError::Capture("boom".into()))
        })
        .await;
        assert!(matches!(outcome, Err(CaptureError::Capture(message)) if message == "boom"));
    }
}
