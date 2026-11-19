use serde::Serialize;

use crate::domain_error;

domain_error!(ScreenError {});

#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ScreenSourceKind {
    Screen,
    Window,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenSource {
    pub id: String,
    pub name: String,
    pub kind: ScreenSourceKind,
    pub thumbnail: String,
    pub app_icon: Option<String>,
}

#[tauri::command]
pub fn screen_sources() -> Result<Vec<ScreenSource>, ScreenError> {
    Err(ScreenError::NotImplemented)
}

#[tauri::command]
pub fn screen_select(_source_id: String, _audio: bool) -> Result<(), ScreenError> {
    Err(ScreenError::NotImplemented)
}
