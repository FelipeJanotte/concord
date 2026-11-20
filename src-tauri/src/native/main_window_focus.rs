#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MainWindowFocus {
    Focused,
    Unfocused,
}

impl From<bool> for MainWindowFocus {
    fn from(focused: bool) -> Self {
        if focused {
            Self::Focused
        } else {
            Self::Unfocused
        }
    }
}
