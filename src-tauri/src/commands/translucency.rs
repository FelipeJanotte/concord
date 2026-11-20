use serde::Deserialize;
use tauri::utils::config::WindowEffectsConfig;
use tauri::window::{Color, Effect, EffectsBuilder};
use tauri::{Theme, WebviewWindow};

use crate::domain_error;
use crate::native::translucency::{is_supported_here, window_color, Rgba, WindowScheme};

domain_error!(TranslucencyError {
    #[error("{0}")]
    Native(#[from] tauri::Error),
});

#[derive(Debug, Deserialize)]
pub struct TranslucencyRequest {
    pub glass: bool,
    pub scheme: WindowScheme,
}

fn theme_of(scheme: WindowScheme) -> Theme {
    match scheme {
        WindowScheme::Dark => Theme::Dark,
        WindowScheme::Light => Theme::Light,
    }
}

fn glass_effects(glass: bool) -> Option<WindowEffectsConfig> {
    glass.then(|| EffectsBuilder::new().effect(Effect::Acrylic).build())
}

fn color_of(Rgba(red, green, blue, alpha): Rgba) -> Color {
    Color(red, green, blue, alpha)
}

#[tauri::command]
pub fn window_translucency(
    window: WebviewWindow,
    request: TranslucencyRequest,
) -> Result<(), TranslucencyError> {
    window.set_theme(Some(theme_of(request.scheme)))?;
    if !is_supported_here() {
        return Ok(());
    }
    window.set_effects(glass_effects(request.glass))?;
    window.set_background_color(Some(color_of(window_color(request.glass))))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    #[test]
    fn a_window_failure_keeps_its_message_and_source() {
        let error = super::TranslucencyError::from(tauri::Error::WindowNotFound);
        assert_eq!(error.to_string(), tauri::Error::WindowNotFound.to_string());
        assert!(error.source().is_some());
    }

    use super::*;

    #[test]
    fn schemes_map_to_the_matching_native_theme() {
        assert_eq!(theme_of(WindowScheme::Dark), Theme::Dark);
        assert_eq!(theme_of(WindowScheme::Light), Theme::Light);
    }

    #[test]
    fn glass_asks_for_acrylic_and_solid_clears_the_effect() {
        assert!(glass_effects(true).is_some_and(|config| config.effects == vec![Effect::Acrylic]));
        assert!(glass_effects(false).is_none());
    }

    #[test]
    fn colors_keep_their_channels() {
        let Color(red, green, blue, alpha) = color_of(Rgba(30, 31, 34, 255));
        assert_eq!((red, green, blue, alpha), (30, 31, 34, 255));
    }
}
