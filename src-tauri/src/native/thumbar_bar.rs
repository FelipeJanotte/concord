use std::cell::RefCell;

use concord_taskbar::{TaskbarError, ThumbBar, ThumbButton};
use tauri::{AppHandle, WebviewWindow};

use crate::events;
use crate::native::main_window_events::emit_to_main;
use crate::native::thumbar::ThumbarAction;

#[derive(Debug, thiserror::Error)]
pub enum ThumbarBarError {
    #[error("{0}")]
    Taskbar(#[from] TaskbarError),
    #[error("{0}")]
    Window(#[from] tauri::Error),
}

thread_local! {
    static THUMB_BAR: RefCell<Option<ThumbBar>> = const { RefCell::new(None) };
}

fn attach(app: &AppHandle, window: &WebviewWindow) -> Result<ThumbBar, ThumbarBarError> {
    let clicked = app.clone();
    Ok(ThumbBar::attach(
        window.hwnd()?.0 as isize,
        move |action| emit_to_main(&clicked, events::THUMBAR_CLICK, ThumbarAction::from(action)),
        |error| log::error!("botões da miniatura da barra de tarefas: {error}"),
    )?)
}

pub fn apply(
    app: &AppHandle,
    window: &WebviewWindow,
    buttons: Vec<ThumbButton>,
) -> Result<(), ThumbarBarError> {
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
