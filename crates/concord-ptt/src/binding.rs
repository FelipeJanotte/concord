#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BindingKind {
    Key,
    Mouse,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Binding {
    pub kind: BindingKind,
    pub code: u16,
    pub label: String,
}

impl Binding {
    pub fn new(kind: BindingKind, code: u16) -> Self {
        Self {
            kind,
            code,
            label: label_for(kind, code),
        }
    }

    pub fn same_input(&self, kind: BindingKind, code: u16) -> bool {
        self.kind == kind && self.code == code
    }
}

pub const MOUSE_MIDDLE: u16 = 3;
pub const MOUSE_BACK: u16 = 4;
pub const MOUSE_FORWARD: u16 = 5;
pub const ALLOWED_MOUSE_BUTTONS: [u16; 3] = [MOUSE_MIDDLE, MOUSE_BACK, MOUSE_FORWARD];

const KEY_NAMES: &[(&str, u16)] = &[
    ("Backspace", 0x000E),
    ("Tab", 0x000F),
    ("Enter", 0x001C),
    ("CapsLock", 0x003A),
    ("Escape", 0x0001),
    ("Space", 0x0039),
    ("PageUp", 0x0E49),
    ("PageDown", 0x0E51),
    ("End", 0x0E4F),
    ("Home", 0x0E47),
    ("ArrowLeft", 0xE04B),
    ("ArrowUp", 0xE048),
    ("ArrowRight", 0xE04D),
    ("ArrowDown", 0xE050),
    ("Insert", 0x0E52),
    ("Delete", 0x0E53),
    ("0", 0x000B),
    ("1", 0x0002),
    ("2", 0x0003),
    ("3", 0x0004),
    ("4", 0x0005),
    ("5", 0x0006),
    ("6", 0x0007),
    ("7", 0x0008),
    ("8", 0x0009),
    ("9", 0x000A),
    ("A", 0x001E),
    ("B", 0x0030),
    ("C", 0x002E),
    ("D", 0x0020),
    ("E", 0x0012),
    ("F", 0x0021),
    ("G", 0x0022),
    ("H", 0x0023),
    ("I", 0x0017),
    ("J", 0x0024),
    ("K", 0x0025),
    ("L", 0x0026),
    ("M", 0x0032),
    ("N", 0x0031),
    ("O", 0x0018),
    ("P", 0x0019),
    ("Q", 0x0010),
    ("R", 0x0013),
    ("S", 0x001F),
    ("T", 0x0014),
    ("U", 0x0016),
    ("V", 0x002F),
    ("W", 0x0011),
    ("X", 0x002D),
    ("Y", 0x0015),
    ("Z", 0x002C),
    ("Numpad0", 0x0052),
    ("Numpad1", 0x004F),
    ("Numpad2", 0x0050),
    ("Numpad3", 0x0051),
    ("Numpad4", 0x004B),
    ("Numpad5", 0x004C),
    ("Numpad6", 0x004D),
    ("Numpad7", 0x0047),
    ("Numpad8", 0x0048),
    ("Numpad9", 0x0049),
    ("NumpadMultiply", 0x0037),
    ("NumpadAdd", 0x004E),
    ("NumpadSubtract", 0x004A),
    ("NumpadDecimal", 0x0053),
    ("NumpadDivide", 0x0E35),
    ("NumpadEnter", 0x0E1C),
    ("NumpadEnd", 0xEE4F),
    ("NumpadArrowDown", 0xEE50),
    ("NumpadPageDown", 0xEE51),
    ("NumpadArrowLeft", 0xEE4B),
    ("NumpadArrowRight", 0xEE4D),
    ("NumpadHome", 0xEE47),
    ("NumpadArrowUp", 0xEE48),
    ("NumpadPageUp", 0xEE49),
    ("NumpadInsert", 0xEE52),
    ("NumpadDelete", 0xEE53),
    ("F1", 0x003B),
    ("F2", 0x003C),
    ("F3", 0x003D),
    ("F4", 0x003E),
    ("F5", 0x003F),
    ("F6", 0x0040),
    ("F7", 0x0041),
    ("F8", 0x0042),
    ("F9", 0x0043),
    ("F10", 0x0044),
    ("F11", 0x0057),
    ("F12", 0x0058),
    ("F13", 0x005B),
    ("F14", 0x005C),
    ("F15", 0x005D),
    ("F16", 0x0063),
    ("F17", 0x0064),
    ("F18", 0x0065),
    ("F19", 0x0066),
    ("F20", 0x0067),
    ("F21", 0x0068),
    ("F22", 0x0069),
    ("F23", 0x006A),
    ("F24", 0x006B),
    ("Semicolon", 0x0027),
    ("Equal", 0x000D),
    ("Comma", 0x0033),
    ("Minus", 0x000C),
    ("Period", 0x0034),
    ("Slash", 0x0035),
    ("Backquote", 0x0029),
    ("BracketLeft", 0x001A),
    ("Backslash", 0x002B),
    ("BracketRight", 0x001B),
    ("Quote", 0x0028),
    ("Ctrl", 0x001D),
    ("CtrlRight", 0x0E1D),
    ("Alt", 0x0038),
    ("AltRight", 0x0E38),
    ("Shift", 0x002A),
    ("ShiftRight", 0x0036),
    ("Meta", 0x0E5B),
    ("MetaRight", 0x0E5C),
    ("NumLock", 0x0045),
    ("ScrollLock", 0x0046),
    ("PrintScreen", 0x0E37),
];

const DISPLAY_NAMES: &[(&str, &str)] = &[
    ("Space", "Espaço"),
    ("CapsLock", "Caps Lock"),
    ("CtrlRight", "Ctrl direito"),
    ("AltRight", "Alt Gr"),
    ("ShiftRight", "Shift direito"),
    ("Meta", "Windows"),
    ("MetaRight", "Windows direito"),
    ("ArrowUp", "Seta para cima"),
    ("ArrowDown", "Seta para baixo"),
    ("ArrowLeft", "Seta para a esquerda"),
    ("ArrowRight", "Seta para a direita"),
    ("Backquote", "`"),
    ("Minus", "-"),
    ("Equal", "="),
    ("BracketLeft", "["),
    ("BracketRight", "]"),
    ("Backslash", "\\"),
    ("Semicolon", ";"),
    ("Quote", "'"),
    ("Comma", ","),
    ("Period", "."),
    ("Slash", "/"),
    ("PageUp", "Page Up"),
    ("PageDown", "Page Down"),
    ("PrintScreen", "Print Screen"),
    ("ScrollLock", "Scroll Lock"),
    ("NumLock", "Num Lock"),
];

const NUMERIC_KEYPAD_PREFIX: &str = "Numpad";

pub fn label_for(kind: BindingKind, code: u16) -> String {
    match kind {
        BindingKind::Mouse => mouse_label(code),
        BindingKind::Key => key_label(code),
    }
}

fn mouse_label(code: u16) -> String {
    match code {
        MOUSE_MIDDLE => "Botão do meio do mouse".to_owned(),
        MOUSE_BACK => "Botão 4 do mouse".to_owned(),
        MOUSE_FORWARD => "Botão 5 do mouse".to_owned(),
        other => format!("Tecla {other}"),
    }
}

fn key_label(code: u16) -> String {
    let Some((name, _)) = KEY_NAMES.iter().find(|(_, known)| *known == code) else {
        return format!("Tecla {code}");
    };
    if let Some((_, display)) = DISPLAY_NAMES.iter().find(|(key, _)| key == name) {
        return (*display).to_owned();
    }
    match name.strip_prefix(NUMERIC_KEYPAD_PREFIX) {
        Some(rest) => format!("{rest} (teclado numérico)"),
        None => (*name).to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_match_the_previous_desktop_app() {
        let cases = [
            (BindingKind::Key, 47, "V"),
            (BindingKind::Key, 0x0002, "1"),
            (BindingKind::Key, 0x0039, "Espaço"),
            (BindingKind::Key, 0x0E1D, "Ctrl direito"),
            (BindingKind::Key, 0x0E38, "Alt Gr"),
            (BindingKind::Key, 0xE048, "Seta para cima"),
            (BindingKind::Key, 0x0E51, "Page Down"),
            (BindingKind::Key, 0x0E5B, "Windows"),
            (BindingKind::Key, 0x0029, "`"),
            (BindingKind::Key, 0x003B, "F1"),
            (BindingKind::Key, 0x0052, "0 (teclado numérico)"),
            (BindingKind::Key, 0xEE47, "Home (teclado numérico)"),
            (BindingKind::Key, 0x0E35, "Divide (teclado numérico)"),
            (BindingKind::Key, 0x7777, "Tecla 30583"),
            (BindingKind::Mouse, 3, "Botão do meio do mouse"),
            (BindingKind::Mouse, 4, "Botão 4 do mouse"),
            (BindingKind::Mouse, 5, "Botão 5 do mouse"),
        ];
        for (kind, code, expected) in cases {
            assert_eq!(label_for(kind, code), expected, "{kind:?} {code:#06x}");
        }
    }

    #[test]
    fn new_fills_the_label() {
        let binding = Binding::new(BindingKind::Key, 47);
        assert_eq!(binding.label, "V");
    }
}
