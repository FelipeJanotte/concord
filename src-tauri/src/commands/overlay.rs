use tauri::State;

use crate::domain_error;
use crate::native::overlay::model::{OverlayConfig, OverlayRoom, ResizePhase};
use crate::native::overlay::shortcuts::{OverlayShortcutStatus, OverlayShortcuts};
use crate::native::overlay::worker::{OverlayHandle, ShortcutsError};

domain_error!(OverlayError {
    #[error("Não foi possível registrar os atalhos do overlay")]
    ShortcutsUnavailable,
    #[error("{0}")]
    Shortcuts(#[from] ShortcutsError),
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
        .map_err(|_| OverlayError::ShortcutsUnavailable)?
        .map_err(OverlayError::from)
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
    handle.resize(width, ResizePhase::from(done));
}
