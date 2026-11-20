use crate::binding::BindingKind;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InputEvent {
    pub kind: BindingKind,
    pub code: u16,
    pub down: bool,
}
