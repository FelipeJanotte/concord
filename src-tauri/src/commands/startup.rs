use crate::domain_error;

domain_error!(StartupError {});

#[tauri::command]
pub fn startup_get() -> Result<Option<bool>, StartupError> {
    Err(StartupError::NotImplemented)
}

#[tauri::command]
pub fn startup_set(_open_at_login: bool) -> Result<Option<bool>, StartupError> {
    Err(StartupError::NotImplemented)
}
