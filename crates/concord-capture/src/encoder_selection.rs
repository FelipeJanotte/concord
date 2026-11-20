use crate::error::CaptureError;
use crate::events::EncoderKind;

#[derive(Debug)]
pub(crate) struct EncoderChoice {
    pub kind: EncoderKind,
    pub hardware_failure: Option<CaptureError>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum VideoSupport {
    Available,
    Missing { reason: String },
}

pub(crate) fn select_encoder(
    video_support: &VideoSupport,
    probe_hardware: impl FnOnce() -> Result<(), CaptureError>,
) -> EncoderChoice {
    if let VideoSupport::Missing { reason } = video_support {
        return EncoderChoice {
            kind: EncoderKind::Software,
            hardware_failure: Some(CaptureError::Encoder(format!(
                "the graphics device has no video support: {reason}"
            ))),
        };
    }
    match probe_hardware() {
        Ok(()) => EncoderChoice {
            kind: EncoderKind::Hardware,
            hardware_failure: None,
        },
        Err(error) => EncoderChoice {
            kind: EncoderKind::Software,
            hardware_failure: Some(error),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn working_hardware_encoder_is_chosen() {
        let choice = select_encoder(&VideoSupport::Available, || Ok(()));
        assert_eq!(choice.kind, EncoderKind::Hardware);
        assert!(choice.hardware_failure.is_none());
    }

    #[test]
    fn failing_hardware_falls_back_to_software_and_keeps_the_reason() {
        let choice = select_encoder(&VideoSupport::Available, || {
            Err(CaptureError::Encoder("no H.264 MFT".into()))
        });
        assert_eq!(choice.kind, EncoderKind::Software);
        assert!(
            matches!(choice.hardware_failure, Some(CaptureError::Encoder(reason)) if reason == "no H.264 MFT")
        );
    }

    #[test]
    fn device_without_video_support_goes_to_software_without_probing_the_hardware() {
        let mut probed = false;
        let missing = VideoSupport::Missing {
            reason: "DXGI_ERROR_UNSUPPORTED".into(),
        };
        let choice = select_encoder(&missing, || {
            probed = true;
            Ok(())
        });
        assert_eq!(choice.kind, EncoderKind::Software);
        assert!(!probed);
        assert!(
            matches!(&choice.hardware_failure, Some(CaptureError::Encoder(reason)) if reason.contains("DXGI_ERROR_UNSUPPORTED")),
            "{:?}",
            choice.hardware_failure
        );
    }
}
