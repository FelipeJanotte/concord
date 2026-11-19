use crate::domain_error;

domain_error!(IdleError {});

#[tauri::command]
pub fn idle_get() -> Result<bool, IdleError> {
    Err(IdleError::NotImplemented)
}
