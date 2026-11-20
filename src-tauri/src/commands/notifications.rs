use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, PoisonError};

use tauri::webview::PageLoadEvent;
use tauri::UserAttentionType;
use tauri::{AppHandle, Manager, State, Webview, WebviewWindow, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;

use crate::domain_error;
use crate::events;
#[cfg(windows)]
use crate::native::data_url::png_bytes;
use crate::native::data_url::DataUrlError;
use crate::native::main_window_events::emit_to_main;
use crate::native::notifications::{
    activation_url, clean_badge_count, clean_notification, parse_activation, should_flash,
    toast_xml, ClickQueue, NotificationClick, NotificationRejection, ACTIVATION_SCHEME,
};
pub use crate::native::notifications::{NativeNotification, NotificationTarget};
use crate::native::toast::ToastError;
use crate::windows::main_window::MAIN_WINDOW_LABEL;

domain_error!(NotificationsError {
    #[error("{0}")]
    Rejected(#[from] NotificationRejection),
    #[error("Não foi possível montar a notificação: {0}")]
    Unbuildable(#[from] serde_json::Error),
    #[error("Ícone do selo inválido: {0}")]
    InvalidBadge(#[from] DataUrlError),
    #[error("{0}")]
    Native(String),
});

impl From<ToastError> for NotificationsError {
    fn from(error: ToastError) -> Self {
        Self::Native(error.to_string())
    }
}

impl From<tauri::Error> for NotificationsError {
    fn from(error: tauri::Error) -> Self {
        Self::Native(error.to_string())
    }
}

#[derive(Default)]
pub struct NotificationsState {
    clicks: Mutex<ClickQueue>,
    last_badge_count: Mutex<u32>,
    focus_listener_installed: AtomicBool,
}

pub fn focus_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        log::warn!("janela principal ausente ao focar");
        return;
    };
    let focused = window
        .is_minimized()
        .and_then(|minimized| {
            if minimized {
                window.unminimize()?;
            }
            Ok(())
        })
        .and_then(|()| window.show())
        .and_then(|()| window.set_focus());
    if let Err(error) = focused {
        log::warn!("não foi possível trazer a janela para frente: {error}");
    }
}

fn deliver(app: &AppHandle, clicks: Vec<NotificationClick>) {
    for click in clicks {
        emit_to_main(app, events::NOTIFICATION_CLICK, click);
    }
}

fn receive_click(app: &AppHandle, click: NotificationClick) {
    focus_main_window(app);
    let ready = {
        let state = app.state::<NotificationsState>();
        let mut clicks = state.clicks.lock().unwrap_or_else(PoisonError::into_inner);
        clicks.submit(click)
    };
    deliver(app, ready);
}

fn receive_urls(app: &AppHandle, urls: impl IntoIterator<Item = url::Url>) {
    for url in urls {
        match parse_activation(url.as_str()) {
            Ok(click) => receive_click(app, click),
            Err(error) => log::warn!("ativação ignorada: {error}"),
        }
    }
}

pub fn page_loaded(webview: &Webview, event: &PageLoadEvent) {
    if webview.label() != MAIN_WINDOW_LABEL || !matches!(event, PageLoadEvent::Finished) {
        return;
    }
    let app = webview.app_handle();
    let ready = {
        let state = app.state::<NotificationsState>();
        let mut clicks = state.clicks.lock().unwrap_or_else(PoisonError::into_inner);
        clicks.mark_page_ready()
    };
    deliver(app, ready);
}

pub fn install(app: &AppHandle) {
    app.manage(NotificationsState::default());
    if let Err(error) = crate::native::toast::identify_process() {
        log::warn!("identidade do aplicativo para as notificações: {error}");
    }
    let deep_links = app.deep_link();
    if cfg!(debug_assertions) {
        if let Err(error) = deep_links.register(ACTIVATION_SCHEME) {
            log::warn!("registro do endereço {ACTIVATION_SCHEME}:// falhou: {error}");
        }
    }
    let listener = app.clone();
    deep_links.on_open_url(move |event| receive_urls(&listener, event.urls()));
    match deep_links.get_current() {
        Ok(Some(urls)) => receive_urls(app, urls),
        Ok(None) => {}
        Err(error) => log::warn!("endereço de abertura ilegível: {error}"),
    }
}

#[tauri::command]
pub fn notify(notification: NativeNotification) -> Result<(), NotificationsError> {
    let clean = clean_notification(notification)?;
    let launch_url = activation_url(clean.target.as_ref())?;
    Ok(crate::native::toast::show(&toast_xml(&clean, &launch_url))?)
}

fn install_focus_listener(window: &WebviewWindow, state: &NotificationsState) {
    if state.focus_listener_installed.swap(true, Ordering::SeqCst) {
        return;
    }
    let watched = window.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Focused(true)) {
            if let Err(error) = watched.request_user_attention(None) {
                log::warn!("não foi possível parar de piscar a barra de tarefas: {error}");
            }
        }
    });
}

#[cfg(windows)]
fn overlay_icon(
    count: u32,
    overlay: Option<&str>,
) -> Result<Option<tauri::image::Image<'static>>, NotificationsError> {
    match overlay.filter(|_| count > 0) {
        Some(data_url) => Ok(Some(tauri::image::Image::from_bytes(&png_bytes(
            data_url,
        )?)?)),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn badge(
    window: WebviewWindow,
    state: State<'_, NotificationsState>,
    count: u32,
    overlay: Option<String>,
) -> Result<(), NotificationsError> {
    let count = clean_badge_count(count);
    #[cfg(windows)]
    window.set_overlay_icon(overlay_icon(count, overlay.as_deref())?)?;
    #[cfg(not(windows))]
    {
        let _ = overlay;
        window.set_badge_count((count > 0).then_some(i64::from(count)))?;
    }
    let previous = {
        let mut last = state
            .last_badge_count
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        std::mem::replace(&mut *last, count)
    };
    if cfg!(windows) && should_flash(count, previous, window.is_focused()?) {
        install_focus_listener(&window, &state);
        window.request_user_attention(Some(UserAttentionType::Informational))?;
    }
    Ok(())
}
