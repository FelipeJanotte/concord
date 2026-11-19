use serde::{Deserialize, Serialize};

use crate::domain_error;

domain_error!(OverlayError {});

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OverlayCorner {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OverlaySize {
    Small,
    Medium,
    Large,
}

#[derive(Debug, Deserialize)]
pub struct OverlayPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Deserialize)]
pub struct OverlayConfig {
    pub enabled: bool,
    pub corner: OverlayCorner,
    pub size: OverlaySize,
    pub position: Option<OverlayPosition>,
    pub width: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayMember {
    pub id: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub color: String,
    pub speaking: bool,
    pub muted: bool,
    pub deafened: bool,
}

#[derive(Debug, Deserialize)]
pub struct OverlayRoom {
    pub members: Vec<OverlayMember>,
    pub more: u32,
}

#[derive(Debug, Deserialize)]
pub struct OverlayShortcuts {
    pub toggle: String,
    pub edit: String,
}

#[derive(Debug, Serialize)]
pub struct OverlayShortcutStatus {
    pub toggle: bool,
    pub edit: bool,
}

#[tauri::command]
pub fn overlay_config(_config: OverlayConfig) -> Result<(), OverlayError> {
    Err(OverlayError::NotImplemented)
}

#[tauri::command]
pub fn overlay_room(_room: Option<OverlayRoom>) -> Result<(), OverlayError> {
    Err(OverlayError::NotImplemented)
}

#[tauri::command]
pub fn overlay_edit(_editing: bool) -> Result<(), OverlayError> {
    Err(OverlayError::NotImplemented)
}

#[tauri::command]
pub fn overlay_shortcuts(
    _shortcuts: OverlayShortcuts,
) -> Result<OverlayShortcutStatus, OverlayError> {
    Err(OverlayError::NotImplemented)
}

#[tauri::command]
pub fn overlay_shortcuts_pause(_paused: bool) -> Result<(), OverlayError> {
    Err(OverlayError::NotImplemented)
}

#[tauri::command]
pub fn overlay_theme(_theme: serde_json::Value) -> Result<(), OverlayError> {
    Err(OverlayError::NotImplemented)
}

#[tauri::command]
pub fn overlay_resize(_width: u32, _done: bool) -> Result<(), OverlayError> {
    Err(OverlayError::NotImplemented)
}
