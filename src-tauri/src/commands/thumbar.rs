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

impl From<tauri::Error> for ThumbarError {
    fn from(error: tauri::Error) -> Self {
        Self::Native(error.to_string())
    }
}

#[cfg(windows)]
mod windows_bar {
    use std::cell::RefCell;

    use concord_taskbar::{ThumbBar, ThumbButton};
    use tauri::{AppHandle, WebviewWindow};

    use super::{ThumbarAction, ThumbarError};
    use crate::events;
    use crate::native::main_window_events::emit_to_main;

    thread_local! {
        static THUMB_BAR: RefCell<Option<ThumbBar>> = const { RefCell::new(None) };
    }

    fn attach(app: &AppHandle, window: &WebviewWindow) -> Result<ThumbBar, ThumbarError> {
        let clicked = app.clone();
        Ok(ThumbBar::attach(
            window.hwnd()?.0 as isize,
            move |action| {
                emit_to_main(&clicked, events::THUMBAR_CLICK, ThumbarAction::from(action))
            },
            |error| log::error!("botões da miniatura da barra de tarefas: {error}"),
        )?)
    }

    pub fn apply(
        app: &AppHandle,
        window: &WebviewWindow,
        buttons: Vec<ThumbButton>,
    ) -> Result<(), ThumbarError> {
        THUMB_BAR.with(|cell| {
            let mut bar = cell.borrow_mut();
            if bar.is_none() {
                *bar = Some(attach(app, window)?);
            }
            match bar.as_ref() {
                Some(bar) => Ok(bar.set_buttons(buttons)?),
                None => Ok(()),
            }
        })
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
            .send(windows_bar::apply(&handle, &window, cleaned))
            .is_err()
        {
            log::warn!("quem pediu os botões da miniatura não esperou a resposta");
        }
    })?;
    outcome
        .await
        .map_err(|_| ThumbarError::MainThreadUnavailable)?
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
