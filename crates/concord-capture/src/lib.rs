#![cfg_attr(not(windows), allow(dead_code, unused_imports))]

mod annex_b;
mod audio_frames;
mod encoder_selection;
mod error;
mod events;
mod frame_size;
mod pacing;
mod pipeline;
#[cfg(windows)]
mod platform;
mod quality;
mod rate_control;
mod share;
mod source;
mod thumbnail;

pub use error::CaptureError;
pub use events::{EncoderKind, EndReason, ShareEvent};
pub use quality::ShareQuality;
pub use share::{ScreenShare, ShareRequest, list_sources};
pub use source::{CaptureSource, SourceKind};
