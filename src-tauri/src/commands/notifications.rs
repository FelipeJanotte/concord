use serde::{Deserialize, Serialize};

use crate::domain_error;

domain_error!(NotificationsError {});

#[derive(Debug, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum NotificationTarget {
    Dm { channel_id: String },
    Channel { channel_id: String },
    Friends,
}

#[derive(Debug, Deserialize)]
pub struct NativeNotification {
    pub title: String,
    pub body: String,
    pub target: Option<NotificationTarget>,
    pub silent: Option<bool>,
}

#[tauri::command]
pub fn notify(_notification: NativeNotification) -> Result<(), NotificationsError> {
    Err(NotificationsError::NotImplemented)
}

#[tauri::command]
pub fn badge(_count: u32, _overlay: Option<String>) -> Result<(), NotificationsError> {
    Err(NotificationsError::NotImplemented)
}
