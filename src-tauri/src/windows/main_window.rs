use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_opener::OpenerExt;
use url::Url;

use crate::events;
use crate::native::environment::DesktopEnvironment;
use crate::native::links::{decide_navigation, external_url, NavigationDecision};
use crate::native::migration::file::{script_from_file, FILE_NAME};
use crate::native::permissions;
use crate::native::window_controls::maximized_change;

pub const MAIN_WINDOW_LABEL: &str = "main";

#[derive(Debug, thiserror::Error)]
pub enum MainWindowError {
    #[error("tauri.conf.json sem a janela principal")]
    MissingConfiguration,
    #[error(transparent)]
    Script(#[from] serde_json::Error),
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
}

pub fn create(app: &AppHandle) -> Result<WebviewWindow, MainWindowError> {
    let configuration = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW_LABEL)
        .ok_or(MainWindowError::MissingConfiguration)?;
    let development_server = app.config().build.dev_url.clone();
    let navigation_app = app.clone();
    let new_window_app = app.clone();

    let mut builder = WebviewWindowBuilder::from_config(app, configuration)?
        .initialization_script(DesktopEnvironment::current().initialization_script()?);
    if let Some(script) = migration_script(app) {
        builder = builder.initialization_script(script);
    }

    #[cfg(windows)]
    {
        builder = builder.transparent(true);
    }

    let window = builder
        .on_navigation(
            move |target| match decide_navigation(target, development_server.as_ref()) {
                NavigationDecision::Allow => true,
                NavigationDecision::OpenExternally(url) => {
                    open_in_browser(&navigation_app, &url);
                    false
                }
                NavigationDecision::Block => false,
            },
        )
        .on_new_window(move |target, _features| {
            if let Some(url) = external_url(target.as_str()) {
                open_in_browser(&new_window_app, &url);
            }
            NewWindowResponse::Deny
        })
        .on_permission_request(|_webview, kind| permissions::respond(&kind))
        .build()?;

    announce_maximized_changes(&window);
    Ok(window)
}

fn migration_script(app: &AppHandle) -> Option<String> {
    match app.path().app_data_dir() {
        Ok(directory) => script_from_file(&directory.join(FILE_NAME)),
        Err(error) => {
            eprintln!("Não foi possível localizar a pasta de dados: {error}");
            None
        }
    }
}

fn open_in_browser(app: &AppHandle, url: &Url) {
    if let Err(error) = app.opener().open_url(url.as_str(), None::<&str>) {
        eprintln!("Não foi possível abrir {url} no navegador: {error}");
    }
}

fn announce_maximized_changes(window: &WebviewWindow) {
    let was_maximized = Arc::new(AtomicBool::new(window.is_maximized().unwrap_or(false)));
    let watched = window.clone();
    window.on_window_event(move |event| {
        if !matches!(event, WindowEvent::Resized(_)) {
            return;
        }
        let Ok(is_maximized) = watched.is_maximized() else {
            return;
        };
        let previous = was_maximized.swap(is_maximized, Ordering::SeqCst);
        if let Some(maximized) = maximized_change(previous, is_maximized) {
            if let Err(error) = watched
                .app_handle()
                .emit(events::WINDOW_MAXIMIZED, maximized)
            {
                eprintln!("Não foi possível avisar a mudança de maximizar: {error}");
            }
        }
    });
}
