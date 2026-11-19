use thiserror::Error;

#[derive(Debug, Error)]
pub enum CaptureError {
    #[error("screen sharing is only supported on Windows")]
    UnsupportedPlatform,
    #[error("invalid source id: {0}")]
    InvalidSourceId(String),
    #[error("source not found: {0}")]
    SourceNotFound(String),
    #[error("capture failed: {0}")]
    Capture(String),
    #[error("video encoder failed: {0}")]
    Encoder(String),
    #[error("audio capture failed: {0}")]
    Audio(String),
    #[error("publishing failed: {0}")]
    Publish(String),
    #[error("thumbnail encoding failed: {0}")]
    Thumbnail(#[from] png::EncodingError),
    #[error("a share thread stopped unexpectedly: {0}")]
    Thread(String),
    #[cfg(windows)]
    #[error("Windows API call failed: {0}")]
    Windows(#[from] windows::core::Error),
}
