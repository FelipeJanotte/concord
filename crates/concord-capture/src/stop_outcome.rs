use crate::error::CaptureError;

pub(crate) fn finish_stop(
    post: Result<(), CaptureError>,
    joined: Result<(), CaptureError>,
) -> Result<(), CaptureError> {
    joined.and(post)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn failure(text: &str) -> CaptureError {
        CaptureError::Thread(text.into())
    }

    #[test]
    fn a_failed_post_is_reported_after_a_clean_join() {
        let outcome = finish_stop(Err(failure("post")), Ok(()));
        assert!(matches!(outcome, Err(CaptureError::Thread(text)) if text == "post"));
    }

    #[test]
    fn the_join_failure_wins_over_the_post_failure() {
        let outcome = finish_stop(Err(failure("post")), Err(failure("join")));
        assert!(matches!(outcome, Err(CaptureError::Thread(text)) if text == "join"));
    }

    #[test]
    fn both_clean_is_ok() {
        assert!(finish_stop(Ok(()), Ok(())).is_ok());
    }
}
