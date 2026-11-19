use serde::Deserialize;

use crate::domain_error;

domain_error!(TranslucencyError {});

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WindowScheme {
    Dark,
    Light,
}

#[derive(Debug, Deserialize)]
pub struct TranslucencyRequest {
    pub glass: bool,
    pub scheme: WindowScheme,
}

#[tauri::command]
pub fn window_translucency(_request: TranslucencyRequest) -> Result<(), TranslucencyError> {
    Err(TranslucencyError::NotImplemented)
}
