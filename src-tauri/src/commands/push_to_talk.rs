use serde::{Deserialize, Serialize};

use crate::domain_error;

domain_error!(PushToTalkError {});

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PttBindingKind {
    Key,
    Mouse,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PttBinding {
    pub kind: PttBindingKind,
    pub code: u32,
    pub label: String,
}

#[derive(Debug, Deserialize)]
pub struct PttConfig {
    pub enabled: bool,
    pub binding: Option<PttBinding>,
}

#[tauri::command]
pub fn ptt_config(_config: PttConfig) -> Result<(), PushToTalkError> {
    Err(PushToTalkError::NotImplemented)
}

#[tauri::command]
pub fn ptt_capture() -> Result<Option<PttBinding>, PushToTalkError> {
    Err(PushToTalkError::NotImplemented)
}
