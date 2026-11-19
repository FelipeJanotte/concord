pub mod binding;
pub mod capture;
pub mod config;
pub mod error;
pub mod input;
pub mod keymap;
pub mod mouse;
pub mod press;

pub use binding::{Binding, BindingKind, label_for};
pub use config::PushToTalkConfig;
pub use error::PushToTalkError;

#[cfg(windows)]
mod push_to_talk;

#[cfg(windows)]
pub use push_to_talk::PushToTalk;
