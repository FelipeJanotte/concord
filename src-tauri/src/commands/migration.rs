use tauri::{AppHandle, Manager};

use crate::domain_error;
use crate::native::migration::file::{remove, FILE_NAME};

domain_error!(MigrationError {
    #[error("Não foi possível localizar a pasta de dados: {0}")]
    DataDirectory(String),
    #[error("Não foi possível apagar o arquivo de migração: {0}")]
    Remove(String),
});

#[tauri::command]
pub fn migration_done(app: AppHandle) -> Result<(), MigrationError> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| MigrationError::DataDirectory(error.to_string()))?;
    remove(&directory.join(FILE_NAME)).map_err(|error| MigrationError::Remove(error.to_string()))
}
