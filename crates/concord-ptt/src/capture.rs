use crate::binding::{ALLOWED_MOUSE_BUTTONS, Binding, BindingKind};
use crate::input::InputEvent;

const ESCAPE_CODE: u16 = 0x0001;

#[derive(Debug, PartialEq, Eq)]
pub enum CaptureOutcome {
    Chosen(Binding),
    Cancelled,
}

pub fn capture_outcome(event: &InputEvent) -> Option<CaptureOutcome> {
    if !event.down {
        return None;
    }
    match event.kind {
        BindingKind::Key if event.code == ESCAPE_CODE => Some(CaptureOutcome::Cancelled),
        BindingKind::Mouse if !ALLOWED_MOUSE_BUTTONS.contains(&event.code) => None,
        kind => Some(CaptureOutcome::Chosen(Binding::new(kind, event.code))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(kind: BindingKind, code: u16, down: bool) -> InputEvent {
        InputEvent { kind, code, down }
    }

    #[test]
    fn first_key_down_is_chosen_with_its_label() {
        let outcome = capture_outcome(&event(BindingKind::Key, 47, true));
        assert_eq!(
            outcome,
            Some(CaptureOutcome::Chosen(Binding::new(BindingKind::Key, 47)))
        );
    }

    #[test]
    fn allowed_mouse_buttons_are_chosen() {
        for button in [3, 4, 5] {
            let outcome = capture_outcome(&event(BindingKind::Mouse, button, true));
            assert_eq!(
                outcome,
                Some(CaptureOutcome::Chosen(Binding::new(
                    BindingKind::Mouse,
                    button
                )))
            );
        }
    }

    #[test]
    fn left_and_right_mouse_buttons_are_ignored() {
        assert_eq!(capture_outcome(&event(BindingKind::Mouse, 1, true)), None);
        assert_eq!(capture_outcome(&event(BindingKind::Mouse, 2, true)), None);
    }

    #[test]
    fn escape_cancels() {
        let outcome = capture_outcome(&event(BindingKind::Key, 1, true));
        assert_eq!(outcome, Some(CaptureOutcome::Cancelled));
    }

    #[test]
    fn releases_are_ignored() {
        assert_eq!(capture_outcome(&event(BindingKind::Key, 47, false)), None);
        assert_eq!(capture_outcome(&event(BindingKind::Key, 1, false)), None);
    }

    #[test]
    fn mouse_button_one_is_not_escape() {
        assert_eq!(capture_outcome(&event(BindingKind::Mouse, 1, true)), None);
    }
}
