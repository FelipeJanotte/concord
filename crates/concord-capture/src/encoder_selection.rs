use crate::error::CaptureError;
use crate::events::EncoderKind;

#[derive(Debug)]
pub(crate) struct EncoderChoice {
    pub kind: EncoderKind,
    pub hardware_failure: Option<CaptureError>,
}

pub(crate) fn select_encoder(
    probe_hardware: impl FnOnce() -> Result<(), CaptureError>,
) -> EncoderChoice {
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
        let choice = select_encoder(|| Ok(()));
        assert_eq!(choice.kind, EncoderKind::Hardware);
        assert!(choice.hardware_failure.is_none());
    }

    #[test]
    fn failing_hardware_falls_back_to_software_and_keeps_the_reason() {
        let choice = select_encoder(|| Err(CaptureError::Encoder("no H.264 MFT".into())));
        assert_eq!(choice.kind, EncoderKind::Software);
        assert!(
            matches!(choice.hardware_failure, Some(CaptureError::Encoder(reason)) if reason == "no H.264 MFT")
        );
    }
}
