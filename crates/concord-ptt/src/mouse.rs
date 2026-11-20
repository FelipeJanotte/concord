use crate::binding::{BindingKind, MOUSE_BACK, MOUSE_FORWARD, MOUSE_MIDDLE};
use crate::input::InputEvent;

const BUTTON_FLAGS: [(u16, u16, bool); 6] = [
    (0x0010, MOUSE_MIDDLE, true),
    (0x0020, MOUSE_MIDDLE, false),
    (0x0040, MOUSE_BACK, true),
    (0x0080, MOUSE_BACK, false),
    (0x0100, MOUSE_FORWARD, true),
    (0x0200, MOUSE_FORWARD, false),
];

pub fn mouse_events(button_flags: u16) -> impl Iterator<Item = InputEvent> {
    BUTTON_FLAGS
        .into_iter()
        .filter(move |(flag, _, _)| button_flags & flag != 0)
        .map(|(_, code, down)| InputEvent {
            kind: BindingKind::Mouse,
            code,
            down,
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn events(button_flags: u16) -> Vec<(u16, bool)> {
        mouse_events(button_flags)
            .map(|event| (event.code, event.down))
            .collect()
    }

    #[test]
    fn middle_back_and_forward_buttons() {
        assert_eq!(events(0x0010), [(3, true)]);
        assert_eq!(events(0x0020), [(3, false)]);
        assert_eq!(events(0x0040), [(4, true)]);
        assert_eq!(events(0x0080), [(4, false)]);
        assert_eq!(events(0x0100), [(5, true)]);
        assert_eq!(events(0x0200), [(5, false)]);
    }

    #[test]
    fn left_right_and_wheel_are_ignored() {
        assert_eq!(events(0x0001 | 0x0002 | 0x0004 | 0x0008 | 0x0400), []);
    }

    #[test]
    fn several_buttons_in_one_report() {
        assert_eq!(events(0x0010 | 0x0080), [(3, true), (4, false)]);
    }
}
