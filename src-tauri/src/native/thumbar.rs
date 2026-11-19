use concord_taskbar::{ThumbAction, ThumbButton};
use serde::{Deserialize, Serialize};

use crate::native::data_url::png_bytes;

pub const TOOLTIP_MAX_CHARACTERS: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThumbarAction {
    Mute,
    Deafen,
    Leave,
}

impl From<ThumbarAction> for ThumbAction {
    fn from(action: ThumbarAction) -> Self {
        match action {
            ThumbarAction::Mute => ThumbAction::Mute,
            ThumbarAction::Deafen => ThumbAction::Deafen,
            ThumbarAction::Leave => ThumbAction::Leave,
        }
    }
}

impl From<ThumbAction> for ThumbarAction {
    fn from(action: ThumbAction) -> Self {
        match action {
            ThumbAction::Mute => ThumbarAction::Mute,
            ThumbAction::Deafen => ThumbarAction::Deafen,
            ThumbAction::Leave => ThumbarAction::Leave,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct ThumbarButton {
    pub action: ThumbarAction,
    pub tooltip: String,
    pub icon: String,
}

pub fn clean_buttons(requested: Vec<ThumbarButton>) -> Vec<ThumbButton> {
    let mut cleaned: Vec<ThumbButton> = Vec::new();
    for request in requested {
        let action = ThumbAction::from(request.action);
        if cleaned.iter().any(|button| button.action == action) {
            continue;
        }
        if request.tooltip.trim().is_empty() {
            log::warn!("botão da miniatura ignorado: dica vazia");
            continue;
        }
        match png_bytes(&request.icon) {
            Ok(icon_png) => cleaned.push(ThumbButton {
                action,
                tooltip: request
                    .tooltip
                    .chars()
                    .take(TOOLTIP_MAX_CHARACTERS)
                    .collect(),
                icon_png,
            }),
            Err(error) => log::warn!("botão da miniatura ignorado: {error}"),
        }
    }
    cleaned
}

#[cfg(test)]
mod tests {
    use super::*;

    const ICON: &str = "data:image/png;base64,iVBORw0K";

    fn request(action: ThumbarAction, tooltip: &str, icon: &str) -> ThumbarButton {
        ThumbarButton {
            action,
            tooltip: tooltip.into(),
            icon: icon.into(),
        }
    }

    #[test]
    fn keeps_valid_buttons_with_decoded_icons() {
        let cleaned = clean_buttons(vec![request(ThumbarAction::Mute, "Silenciar", ICON)]);
        assert_eq!(
            cleaned,
            vec![ThumbButton {
                action: ThumbAction::Mute,
                tooltip: "Silenciar".into(),
                icon_png: vec![0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a],
            }]
        );
    }

    #[test]
    fn drops_blank_tooltips_and_non_png_icons() {
        let cleaned = clean_buttons(vec![
            request(ThumbarAction::Mute, "   ", ICON),
            request(
                ThumbarAction::Deafen,
                "Ensurdecer",
                "data:image/gif;base64,AAAA",
            ),
            request(ThumbarAction::Leave, "Sair", ICON),
        ]);
        let actions: Vec<_> = cleaned.iter().map(|button| button.action).collect();
        assert_eq!(actions, vec![ThumbAction::Leave]);
    }

    #[test]
    fn keeps_only_the_first_button_of_each_action() {
        let cleaned = clean_buttons(vec![
            request(ThumbarAction::Mute, "Primeiro", ICON),
            request(ThumbarAction::Mute, "Segundo", ICON),
        ]);
        assert_eq!(cleaned.len(), 1);
        assert_eq!(cleaned[0].tooltip, "Primeiro");
    }

    #[test]
    fn truncates_long_tooltips() {
        let long = "a".repeat(100);
        let cleaned = clean_buttons(vec![request(ThumbarAction::Mute, &long, ICON)]);
        assert_eq!(cleaned[0].tooltip.chars().count(), TOOLTIP_MAX_CHARACTERS);
    }

    #[test]
    fn actions_serialize_as_the_renderer_strings() {
        let strings: Vec<_> = [
            ThumbarAction::Mute,
            ThumbarAction::Deafen,
            ThumbarAction::Leave,
        ]
        .iter()
        .map(|action| serde_json::to_string(action).unwrap_or_default())
        .collect();
        assert_eq!(strings, vec!["\"mute\"", "\"deafen\"", "\"leave\""]);
    }
}
