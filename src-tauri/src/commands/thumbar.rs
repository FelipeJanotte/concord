use tauri::{AppHandle, WebviewWindow};

use crate::domain_error;
pub use crate::native::thumbar::{ThumbarAction, ThumbarButton};

domain_error!(ThumbarError {
    #[error("{0}")]
    Native(String),
    #[error("A janela não respondeu na thread principal")]
    MainThreadUnavailable,
});

impl From<concord_taskbar::TaskbarError> for ThumbarError {
    fn from(error: concord_taskbar::TaskbarError) -> Self {
        Self::Native(error.to_string())
    }
}

#[cfg(windows)]
impl From<crate::native::thumbar_bar::ThumbarBarError> for ThumbarError {
    fn from(error: crate::native::thumbar_bar::ThumbarBarError) -> Self {
        Self::Native(error.to_string())
    }
}

impl From<tauri::Error> for ThumbarError {
    fn from(error: tauri::Error) -> Self {
        Self::Native(error.to_string())
    }
}

#[cfg(windows)]
#[tauri::command]
pub async fn thumbar_buttons(
    app: AppHandle,
    window: WebviewWindow,
    buttons: Vec<ThumbarButton>,
) -> Result<(), ThumbarError> {
    let cleaned = crate::native::thumbar::clean_buttons(buttons);
    let (reply, outcome) = tokio::sync::oneshot::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        if reply
            .send(crate::native::thumbar_bar::apply(&handle, &window, cleaned))
            .is_err()
        {
            log::warn!("quem pediu os botões da miniatura não esperou a resposta");
        }
    })?;
    Ok(outcome
        .await
        .map_err(|_| ThumbarError::MainThreadUnavailable)??)
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn thumbar_buttons(
    _app: AppHandle,
    _window: WebviewWindow,
    buttons: Vec<ThumbarButton>,
) -> Result<(), ThumbarError> {
    log::debug!(
        "botões da miniatura só existem no Windows ({} ignorados)",
        buttons.len()
    );
    Ok(())
}
