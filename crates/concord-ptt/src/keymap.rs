use crate::binding::BindingKind;
use crate::input::InputEvent;

const FLAG_BREAK: u16 = 0x01;
const FLAG_E0: u16 = 0x02;

const VK_PAUSE: u16 = 0x13;
const VK_NUMLOCK: u16 = 0x90;
const VK_FIRST_EXTRA_FUNCTION: u16 = 0x7C;
const VK_LAST_EXTRA_FUNCTION: u16 = 0x87;
const VK_FAKE_SHIFT: u16 = 0xFF;

const CODE_PAUSE: u16 = 0x0E45;
const CODE_NUM_LOCK: u16 = 0x0045;
const PREFIX_EXTENDED_SHARED: u16 = 0x0E00;
const PREFIX_EXTENDED_OTHER: u16 = 0xE000;
const PREFIX_KEYPAD_NAVIGATION: u16 = 0xEE00;

const EXTENDED_SHARED_MAKE_CODES: [u16; 14] = [
    0x1C, 0x1D, 0x35, 0x37, 0x38, 0x47, 0x49, 0x4F, 0x51, 0x52, 0x53, 0x5B, 0x5C, 0x5D,
];
const KEYPAD_NAVIGATION_VIRTUAL_KEYS: [u16; 11] = [
    0x0C, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2D, 0x2E,
];
const EXTRA_FUNCTION_CODES: [u16; 12] = [
    0x5B, 0x5C, 0x5D, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x6B,
];

pub fn key_event(make_code: u16, flags: u16, virtual_key: u16) -> Option<InputEvent> {
    Some(InputEvent {
        kind: BindingKind::Key,
        code: uiohook_code(make_code, flags, virtual_key)?,
        down: flags & FLAG_BREAK == 0,
    })
}

fn uiohook_code(make_code: u16, flags: u16, virtual_key: u16) -> Option<u16> {
    match virtual_key {
        VK_FAKE_SHIFT => None,
        VK_PAUSE => Some(CODE_PAUSE),
        VK_NUMLOCK => Some(CODE_NUM_LOCK),
        VK_FIRST_EXTRA_FUNCTION..=VK_LAST_EXTRA_FUNCTION => EXTRA_FUNCTION_CODES
            .get(usize::from(virtual_key - VK_FIRST_EXTRA_FUNCTION))
            .copied(),
        _ if make_code == 0 => None,
        _ if flags & FLAG_E0 != 0 => Some(extended_code(make_code)),
        _ if is_keypad_navigation(virtual_key) => Some(PREFIX_KEYPAD_NAVIGATION | make_code),
        _ => Some(make_code),
    }
}

fn extended_code(make_code: u16) -> u16 {
    if EXTENDED_SHARED_MAKE_CODES.contains(&make_code) {
        PREFIX_EXTENDED_SHARED | make_code
    } else {
        PREFIX_EXTENDED_OTHER | make_code
    }
}

fn is_keypad_navigation(virtual_key: u16) -> bool {
    KEYPAD_NAVIGATION_VIRTUAL_KEYS.contains(&virtual_key)
}

#[cfg(test)]
mod tests {
    use super::*;

    const E0: u16 = 2;
    const E1: u16 = 4;
    const BREAK: u16 = 1;

    const VK_CLEAR: u16 = 0x0C;
    const VK_PAUSE: u16 = 0x13;
    const VK_PRIOR: u16 = 0x21;
    const VK_NEXT: u16 = 0x22;
    const VK_END: u16 = 0x23;
    const VK_HOME: u16 = 0x24;
    const VK_LEFT: u16 = 0x25;
    const VK_UP: u16 = 0x26;
    const VK_INSERT: u16 = 0x2D;
    const VK_DELETE: u16 = 0x2E;
    const VK_NUMLOCK: u16 = 0x90;
    const VK_F13: u16 = 0x7C;
    const VK_F24: u16 = 0x87;
    const VK_FAKE: u16 = 0xFF;
    const ANY_LETTER: u16 = 0x41;

    fn code(make_code: u16, flags: u16, virtual_key: u16) -> Option<u16> {
        key_event(make_code, flags, virtual_key).map(|event| event.code)
    }

    #[test]
    fn maps_raw_input_to_uiohook_codes() {
        let cases: &[(&str, u16, u16, u16, u16)] = &[
            ("V", 0x2F, 0, 0x56, 47),
            ("A", 0x1E, 0, 0x41, 0x1E),
            ("Z", 0x2C, 0, 0x5A, 0x2C),
            ("Escape", 0x01, 0, 0x1B, 0x01),
            ("1", 0x02, 0, 0x31, 0x02),
            ("0", 0x0B, 0, 0x30, 0x0B),
            ("F1", 0x3B, 0, 0x70, 0x3B),
            ("F10", 0x44, 0, 0x79, 0x44),
            ("F11", 0x57, 0, 0x7A, 0x57),
            ("F12", 0x58, 0, 0x7B, 0x58),
            ("F13", 0x64, 0, VK_F13, 0x5B),
            ("F14", 0x65, 0, VK_F13 + 1, 0x5C),
            ("F15", 0x66, 0, VK_F13 + 2, 0x5D),
            ("F16", 0x67, 0, VK_F13 + 3, 0x63),
            ("F24", 0x76, 0, VK_F24, 0x6B),
            ("Numpad0", 0x52, 0, 0x60, 0x52),
            ("Numpad7", 0x47, 0, 0x67, 0x47),
            ("NumpadMultiply", 0x37, 0, 0x6A, 0x37),
            ("NumpadSubtract", 0x4A, 0, 0x6D, 0x4A),
            ("NumpadAdd", 0x4E, 0, 0x6B, 0x4E),
            ("NumpadDecimal", 0x53, 0, 0x6E, 0x53),
            ("NumpadDivide", 0x35, E0, 0x6F, 0x0E35),
            ("NumpadEnter", 0x1C, E0, 0x0D, 0x0E1C),
            ("Enter", 0x1C, 0, 0x0D, 0x1C),
            ("NumpadHome (num lock off)", 0x47, 0, VK_HOME, 0xEE47),
            ("NumpadArrowUp (num lock off)", 0x48, 0, VK_UP, 0xEE48),
            ("NumpadPageUp (num lock off)", 0x49, 0, VK_PRIOR, 0xEE49),
            ("NumpadArrowLeft (num lock off)", 0x4B, 0, VK_LEFT, 0xEE4B),
            ("NumpadClear (num lock off)", 0x4C, 0, VK_CLEAR, 0xEE4C),
            ("NumpadEnd (num lock off)", 0x4F, 0, VK_END, 0xEE4F),
            ("NumpadPageDown (num lock off)", 0x51, 0, VK_NEXT, 0xEE51),
            ("NumpadInsert (num lock off)", 0x52, 0, VK_INSERT, 0xEE52),
            ("NumpadDelete (num lock off)", 0x53, 0, VK_DELETE, 0xEE53),
            ("Left Ctrl", 0x1D, 0, 0xA2, 0x1D),
            ("Right Ctrl", 0x1D, E0, 0xA3, 0x0E1D),
            ("Left Alt", 0x38, 0, 0xA4, 0x38),
            ("Right Alt", 0x38, E0, 0xA5, 0x0E38),
            ("Left Shift", 0x2A, 0, 0xA0, 0x2A),
            ("Right Shift", 0x36, 0, 0xA1, 0x36),
            ("Left Windows", 0x5B, E0, 0x5B, 0x0E5B),
            ("Right Windows", 0x5C, E0, 0x5C, 0x0E5C),
            ("ArrowUp", 0x48, E0, VK_UP, 0xE048),
            ("ArrowLeft", 0x4B, E0, VK_LEFT, 0xE04B),
            ("ArrowRight", 0x4D, E0, 0x27, 0xE04D),
            ("ArrowDown", 0x50, E0, 0x28, 0xE050),
            ("Insert", 0x52, E0, VK_INSERT, 0x0E52),
            ("Delete", 0x53, E0, VK_DELETE, 0x0E53),
            ("Home", 0x47, E0, VK_HOME, 0x0E47),
            ("End", 0x4F, E0, VK_END, 0x0E4F),
            ("PageUp", 0x49, E0, VK_PRIOR, 0x0E49),
            ("PageDown", 0x51, E0, VK_NEXT, 0x0E51),
            ("PrintScreen", 0x37, E0, 0x2C, 0x0E37),
            ("Pause", 0x1D, E1, VK_PAUSE, 0x0E45),
            ("NumLock", 0x45, 0, VK_NUMLOCK, 0x45),
            ("NumLock flagged extended", 0x45, E0, VK_NUMLOCK, 0x45),
            ("ScrollLock", 0x46, 0, 0x91, 0x46),
            ("Space", 0x39, 0, 0x20, 0x39),
            ("Backquote", 0x29, 0, 0xC0, 0x29),
            ("Volume mute", 0x20, E0, 0xAD, 0xE020),
        ];
        for (name, make_code, flags, virtual_key, expected) in cases {
            assert_eq!(
                code(*make_code, *flags, *virtual_key),
                Some(*expected),
                "{name}"
            );
        }
    }

    #[test]
    fn break_flag_means_released() {
        let pressed = key_event(0x2F, 0, 0x56).map(|event| event.down);
        let released = key_event(0x2F, BREAK, 0x56).map(|event| event.down);
        assert_eq!((pressed, released), (Some(true), Some(false)));
    }

    #[test]
    fn events_are_keys() {
        let event = key_event(0x2F, 0, 0x56);
        assert_eq!(event.map(|event| event.kind), Some(BindingKind::Key));
    }

    #[test]
    fn ignores_the_fake_shift_and_empty_scan_codes() {
        assert_eq!(code(0x2A, E0, VK_FAKE), None);
        assert_eq!(code(0, 0, ANY_LETTER), None);
    }
}
