#![cfg_attr(not(windows), allow(dead_code))]
#![cfg_attr(test, allow(clippy::expect_used, clippy::unwrap_used))]

mod action;
mod button;
mod error;
mod pixels;
mod plan;
#[cfg(windows)]
mod win;

pub use action::ThumbAction;
pub use button::ThumbButton;
pub use error::TaskbarError;
#[cfg(windows)]
pub use win::ThumbBar;
