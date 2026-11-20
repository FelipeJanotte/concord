use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::windows::main_window::MAIN_WINDOW_LABEL;

pub fn emit_to_main<Payload: Serialize + Clone>(app: &AppHandle, event: &str, payload: Payload) {
    if let Err(error) = app.emit_to(MAIN_WINDOW_LABEL, event, payload) {
        log::warn!("não foi possível avisar a janela principal ({event}): {error}");
    }
}
