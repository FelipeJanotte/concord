use tauri::{AppHandle, Manager, WebviewWindow};

use crate::domain_error;
use crate::native::window_controls::{apply, WindowControlAction};
use crate::windows::main_window::MAIN_WINDOW_LABEL;

domain_error!(WindowControlsError {
    #[error("{0}")]
    Native(String),
    #[error("Janela principal não existe")]
    MissingMainWindow,
});

impl From<tauri::Error> for WindowControlsError {
    fn from(error: tauri::Error) -> Self {
        Self::Native(error.to_string())
    }
}

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
