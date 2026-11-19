use serde::Serialize;

use crate::domain_error;

domain_error!(UpdaterError {});

#[derive(Debug, Serialize)]
#[serde(tag = "state", rename_all = "lowercase")]
pub enum UpdateStatus {
    Idle,
    Checking,
    Downloading { version: String, percent: f64 },
    Ready { version: String },
    Error { message: String },
}

#[tauri::command]
pub fn update_get() -> Result<UpdateStatus, UpdaterError> {
    Err(UpdaterError::NotImplemented)
}

#[tauri::command]
pub fn update_check() -> Result<(), UpdaterError> {
    Err(UpdaterError::NotImplemented)
}

#[tauri::command]
pub fn update_install() -> Result<(), UpdaterError> {
    Err(UpdaterError::NotImplemented)
}
