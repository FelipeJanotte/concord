use crate::error::CaptureError;
use crate::events::ShareEvent;
use crate::quality::ShareQuality;
use crate::source::CaptureSource;

#[derive(Debug, Clone)]
pub struct ShareRequest {
    pub source_id: String,
    pub with_audio: bool,
    pub livekit_url: String,
    pub token: String,
    pub quality: ShareQuality,
}

pub struct ScreenShare {
    #[cfg(windows)]
    session: crate::platform::session::Session,
}

#[cfg(windows)]
impl ScreenShare {
    pub fn start(
        request: ShareRequest,
        on_event: impl Fn(ShareEvent) + Send + Sync + 'static,
    ) -> Result<Self, CaptureError> {
        let session = crate::platform::session::Session::start(request, Box::new(on_event))?;
        Ok(Self { session })
    }

    pub fn stop(self) {
        self.session.stop();
    }
}

#[cfg(windows)]
pub fn list_sources() -> Result<Vec<CaptureSource>, CaptureError> {
    crate::platform::sources::list_sources()
}

#[cfg(not(windows))]
impl ScreenShare {
    pub fn start(
        request: ShareRequest,
        on_event: impl Fn(ShareEvent) + Send + Sync + 'static,
    ) -> Result<Self, CaptureError> {
        let _ = (request, on_event);
        Err(CaptureError::UnsupportedPlatform)
    }

    pub fn stop(self) {}
}

#[cfg(not(windows))]
pub fn list_sources() -> Result<Vec<CaptureSource>, CaptureError> {
    Err(CaptureError::UnsupportedPlatform)
}

#[cfg(all(test, not(windows)))]
mod tests {
    use super::*;

    #[test]
    fn other_platforms_report_unsupported() {
        assert!(matches!(
            list_sources(),
            Err(CaptureError::UnsupportedPlatform)
        ));
        let request = ShareRequest {
            source_id: "screen:1".into(),
            with_audio: true,
            livekit_url: "wss://example.invalid".into(),
            token: "token".into(),
            quality: ShareQuality::Smooth,
        };
        assert!(matches!(
            ScreenShare::start(request, |_| {}),
            Err(CaptureError::UnsupportedPlatform)
        ));
    }
}
