use serde::{Deserialize, Serialize};

const MODIFIERS: [&str; 5] = ["CommandOrControl", "Ctrl", "Alt", "Shift", "Super"];
const NAMED_KEYS: [&str; 25] = [
    "`",
    "-",
    "=",
    "[",
    "]",
    "\\",
    ";",
    "'",
    ",",
    ".",
    "/",
    "Space",
    "Tab",
    "Enter",
    "Backspace",
    "Insert",
    "Delete",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "Up",
    "Down",
    "Left",
    "Right",
];
const MAX_LENGTH: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShortcutAction {
    Toggle,
    Edit,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OverlayShortcuts {
    pub toggle: String,
    pub edit: String,
}

impl Default for OverlayShortcuts {
    fn default() -> Self {
        Self {
            toggle: "Shift+`".into(),
            edit: "CommandOrControl+Shift+`".into(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct OverlayShortcutStatus {
    pub toggle: bool,
    pub edit: bool,
}

impl OverlayShortcuts {
    pub fn sanitized(self) -> Self {
        let defaults = Self::default();
        let toggle = clean_shortcut(&self.toggle).unwrap_or(defaults.toggle.as_str());
        let edit = clean_shortcut(&self.edit).unwrap_or(defaults.edit.as_str());
        if toggle == edit {
            return defaults;
        }
        Self {
            toggle: toggle.into(),
            edit: edit.into(),
        }
    }

    pub fn entries(&self) -> [(ShortcutAction, &str); 2] {
        [
            (ShortcutAction::Toggle, &self.toggle),
            (ShortcutAction::Edit, &self.edit),
        ]
    }
}

fn is_function_key(key: &str) -> bool {
    key.strip_prefix('F').is_some_and(|digits| {
        digits.bytes().all(|byte| byte.is_ascii_digit())
            && !digits.starts_with('0')
            && digits.parse::<u8>().is_ok_and(|number| number <= 24)
    })
}

fn is_shortcut_key(key: &str) -> bool {
    let mut characters = key.chars();
    let single = matches!(
        (characters.next(), characters.next()),
        (Some('A'..='Z' | '0'..='9'), None)
    );
    let numpad = key
        .strip_prefix("num")
        .is_some_and(|digit| digit.len() == 1 && digit.bytes().all(|byte| byte.is_ascii_digit()));
    single || numpad || is_function_key(key) || NAMED_KEYS.contains(&key)
}

pub fn clean_shortcut(raw: &str) -> Option<&str> {
    if raw.chars().count() > MAX_LENGTH {
        return None;
    }
    let mut parts: Vec<&str> = raw.split('+').collect();
    let key = parts.pop().unwrap_or_default();
    let known_modifiers = parts.iter().all(|part| MODIFIERS.contains(part));
    let unique = parts
        .iter()
        .enumerate()
        .all(|(index, part)| !parts[..index].contains(part));
    let has_modifier_or_is_function_key = !parts.is_empty() || is_function_key(key);
    (is_shortcut_key(key) && known_modifiers && unique && has_modifier_or_is_function_key)
        .then_some(raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shortcuts(toggle: &str, edit: &str) -> OverlayShortcuts {
        OverlayShortcuts {
            toggle: toggle.into(),
            edit: edit.into(),
        }
    }

    #[test]
    fn accepts_modifier_plus_key_and_lone_function_keys() {
        for valid in [
            "Alt+1",
            "Shift+`",
            "CommandOrControl+Shift+`",
            "F5",
            "Ctrl+num3",
            "Alt+Up",
        ] {
            assert_eq!(clean_shortcut(valid), Some(valid), "{valid}");
        }
    }

    #[test]
    fn rejects_unknown_repeated_or_modifierless_shortcuts() {
        for invalid in [
            "a",
            "Alt",
            "Alt+Alt+1",
            "Hyper+1",
            "Alt+F25",
            "Alt+F0",
            "Alt+ab",
            "",
            "Alt+",
        ] {
            assert_eq!(clean_shortcut(invalid), None, "{invalid}");
        }
        assert_eq!(clean_shortcut(&"Alt+1".repeat(20)), None);
    }

    #[test]
    fn invalid_or_equal_shortcuts_fall_back_to_the_defaults() {
        assert_eq!(
            shortcuts("Alt+1", "Alt+1").sanitized(),
            OverlayShortcuts::default()
        );
        assert_eq!(shortcuts("lixo", "Alt+2").sanitized().edit, "Alt+2");
        assert_eq!(shortcuts("lixo", "Alt+2").sanitized().toggle, "Shift+`");
        assert_eq!(
            shortcuts("Alt+1", "Alt+2").sanitized(),
            shortcuts("Alt+1", "Alt+2")
        );
    }
}
