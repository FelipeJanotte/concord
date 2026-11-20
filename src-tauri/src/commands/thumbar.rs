use tauri::{AppHandle, WebviewWindow};

use crate::domain_error;
pub use crate::native::thumbar::{ThumbarAction, ThumbarButton};

domain_error!(ThumbarError {
    #[error("{0}")]
    Taskbar(#[from] concord_taskbar::TaskbarError),
    #[cfg(windows)]
    #[error("{0}")]
    Bar(#[from] crate::native::thumbar_bar::ThumbarBarError),
    #[error("{0}")]
    Window(#[from] tauri::Error),
    #[error("A janela não respondeu na thread principal")]
    MainThreadUnavailable,
});

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
    crate::native::thumbar_bar::run_on_main_thread(&app, move |main_thread| {
        if reply
            .send(crate::native::thumbar_bar::apply(
                &main_thread,
                &handle,
                &window,
                cleaned,
            ))
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

#[cfg(test)]
mod tests {
    use std::error::Error;

    use super::ThumbarError;

    #[test]
    fn a_window_failure_keeps_its_message_and_source() {
        let error = ThumbarError::from(tauri::Error::WindowNotFound);
        assert_eq!(error.to_string(), tauri::Error::WindowNotFound.to_string());
        assert!(error.source().is_some());
    }
}
