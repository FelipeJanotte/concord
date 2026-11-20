use crate::action::ThumbAction;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ThumbButton {
    pub action: ThumbAction,
    pub tooltip: String,
    pub icon_png: Vec<u8>,
}
