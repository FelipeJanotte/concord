use tauri::State;

use crate::domain_error;
use crate::native::overlay::model::{OverlayConfig, OverlayRoom};
use crate::native::overlay::shortcuts::{OverlayShortcutStatus, OverlayShortcuts};
use crate::native::overlay::worker::OverlayHandle;

domain_error!(OverlayError {
    #[error("Não foi possível registrar os atalhos do overlay")]
    ShortcutsUnavailable,
});

#[tauri::command]
pub fn overlay_config(handle: State<OverlayHandle>, config: OverlayConfig) {
    handle.set_config(config);
}

#[tauri::command]
pub fn overlay_room(handle: State<OverlayHandle>, room: Option<OverlayRoom>) {
    handle.set_room(room);
}

#[tauri::command]
pub fn overlay_edit(handle: State<OverlayHandle>, editing: bool) {
    handle.set_editing(editing);
}

#[tauri::command]
pub async fn overlay_shortcuts(
    handle: State<'_, OverlayHandle>,
    shortcuts: OverlayShortcuts,
) -> Result<OverlayShortcutStatus, OverlayError> {
    let handle = handle.inner().clone();
    tauri::async_runtime::spawn_blocking(move || handle.set_shortcuts(shortcuts))
        .await
        .ok()
        .flatten()
        .ok_or(OverlayError::ShortcutsUnavailable)
}

#[tauri::command]
pub fn overlay_shortcuts_pause(handle: State<OverlayHandle>, paused: bool) {
    handle.pause_shortcuts(paused);
}

#[tauri::command]
pub fn overlay_theme(handle: State<OverlayHandle>, theme: serde_json::Value) {
    handle.set_theme(theme);
}

#[tauri::command]
pub fn overlay_resize(handle: State<OverlayHandle>, width: f64, done: bool) {
    handle.resize(width, done);
}
