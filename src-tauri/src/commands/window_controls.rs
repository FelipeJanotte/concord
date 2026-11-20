use tauri::{AppHandle, Manager, WebviewWindow};

use crate::domain_error;
use crate::native::window_controls::{apply, WindowControlAction};
use crate::windows::main_window::MAIN_WINDOW_LABEL;

domain_error!(WindowControlsError {
    #[error("{0}")]
    Native(#[from] tauri::Error),
    #[error("Janela principal não existe")]
    MissingMainWindow,
});

#[tauri::command]
pub fn window_control(
    window: WebviewWindow,
    action: WindowControlAction,
) -> Result<(), WindowControlsError> {
    Ok(apply(&window, action)?)
}

#[tauri::command]
pub fn window_maximized_get(window: WebviewWindow) -> Result<bool, WindowControlsError> {
    Ok(window.is_maximized()?)
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) -> Result<(), WindowControlsError> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or(WindowControlsError::MissingMainWindow)?;
    window.show()?;
    Ok(window.set_focus()?)
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use super::WindowControlsError;

    #[test]
    fn a_window_failure_keeps_its_message_and_source() {
        let error = WindowControlsError::from(tauri::Error::WindowNotFound);
        assert_eq!(error.to_string(), tauri::Error::WindowNotFound.to_string());
        assert!(error.source().is_some());
    }
}
