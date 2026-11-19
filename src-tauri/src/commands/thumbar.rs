use serde::{Deserialize, Serialize};

use crate::domain_error;

domain_error!(ThumbarError {});

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThumbarAction {
    Mute,
    Deafen,
    Leave,
}

#[derive(Debug, Deserialize)]
pub struct ThumbarButton {
    pub action: ThumbarAction,
    pub tooltip: String,
    pub icon: String,
}

#[tauri::command]
pub fn thumbar_buttons(_buttons: Vec<ThumbarButton>) -> Result<(), ThumbarError> {
    Err(ThumbarError::NotImplemented)
}
