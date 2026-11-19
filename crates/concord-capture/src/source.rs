use crate::error::CaptureError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceKind {
    Screen,
    Window,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaptureSource {
    pub id: String,
    pub kind: SourceKind,
    pub title: String,
    pub thumbnail_png: Vec<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct SourceId {
    pub kind: SourceKind,
    pub handle: u64,
}

const SCREEN_PREFIX: &str = "screen:";
const WINDOW_PREFIX: &str = "window:";

impl SourceId {
    pub fn encode(&self) -> String {
        let prefix = match self.kind {
            SourceKind::Screen => SCREEN_PREFIX,
            SourceKind::Window => WINDOW_PREFIX,
        };
        format!("{prefix}{}", self.handle)
    }

    pub fn parse(text: &str) -> Result<Self, CaptureError> {
        let invalid = || CaptureError::InvalidSourceId(text.to_owned());
        let (kind, handle_text) = if let Some(rest) = text.strip_prefix(SCREEN_PREFIX) {
            (SourceKind::Screen, rest)
        } else if let Some(rest) = text.strip_prefix(WINDOW_PREFIX) {
            (SourceKind::Window, rest)
        } else {
            return Err(invalid());
        };
        let handle = handle_text.parse::<u64>().map_err(|_| invalid())?;
        if handle == 0 {
            return Err(invalid());
        }
        Ok(Self { kind, handle })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn screen_id_round_trips() {
        let id = SourceId {
            kind: SourceKind::Screen,
            handle: 65_537,
        };
        assert_eq!(id.encode(), "screen:65537");
        assert_eq!(SourceId::parse("screen:65537").ok(), Some(id));
    }

    #[test]
    fn window_id_round_trips_with_large_handle() {
        let id = SourceId {
            kind: SourceKind::Window,
            handle: u64::MAX,
        };
        assert_eq!(SourceId::parse(&id.encode()).ok(), Some(id));
    }

    #[test]
    fn rejects_unknown_prefix_missing_or_invalid_handle() {
        for text in [
            "monitor:1",
            "screen:",
            "window:abc",
            "window:-4",
            "screen:0",
            "",
            "window:1:2",
        ] {
            assert!(
                matches!(SourceId::parse(text), Err(CaptureError::InvalidSourceId(rejected)) if rejected == text),
                "{text} should be rejected"
            );
        }
    }
}
