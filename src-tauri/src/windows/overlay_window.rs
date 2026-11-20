use tauri::webview::PageLoadEvent;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::events;
use crate::native::overlay::controller::{OverlayEnvironment, OverlayWindow, Screen};
use crate::native::overlay::geometry::Rect;
use crate::native::overlay::model::{OverlayPosition, OverlayUpdate};
use crate::native::overlay::shortcuts::{OverlayShortcuts, ShortcutAction};
use crate::native::overlay::win32;
use crate::native::overlay::worker::{self, OverlayHandle};
use crate::shutdown::Shutdown;
use crate::windows::main_window::MAIN_WINDOW_LABEL;

pub const OVERLAY_WINDOW_LABEL: &str = "overlay";
const OVERLAY_PAGE: &str = "overlay.html";
const FALLBACK_SCREEN: Screen = Screen {
    work_area: Rect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040,
    },
    scale: 1.0,
};

#[derive(Debug, thiserror::Error)]
pub enum OverlayWindowError {
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
}

fn log_failure<T, E: std::fmt::Display>(action: &str, result: Result<T, E>) {
    if let Err(error) = result {
        log::warn!("overlay: {action}: {error}");
    }
}

pub struct TauriOverlayWindow {
    window: WebviewWindow,
}

impl OverlayWindow for TauriOverlayWindow {
    fn set_bounds(&self, bounds: Rect) {
        log_failure(
            "tamanho",
            self.window
                .set_size(PhysicalSize::new(bounds.width as u32, bounds.height as u32)),
        );
        log_failure(
            "posição",
            self.window
                .set_position(PhysicalPosition::new(bounds.x, bounds.y)),
        );
    }

    fn show_inactive(&self) {
        log_failure("mostrar", self.window.show());
    }

    fn hide(&self) {
        log_failure("esconder", self.window.hide());
    }

    fn send_state(&self, update: &OverlayUpdate) {
        log_failure(
            "enviar estado",
            self.window
                .app_handle()
                .emit_to(OVERLAY_WINDOW_LABEL, events::OVERLAY_UPDATE, update),
        );
    }

    fn send_theme(&self, theme: &serde_json::Value) {
        log_failure(
            "enviar tema",
            self.window
                .app_handle()
                .emit_to(OVERLAY_WINDOW_LABEL, events::OVERLAY_THEME, theme),
        );
    }

    fn set_interactive(&self, interactive: bool) {
        log_failure(
            "cliques",
            self.window.set_ignore_cursor_events(!interactive),
        );
        log_failure("foco permitido", self.window.set_focusable(interactive));
        if interactive {
            log_failure("foco", self.window.set_focus());
        }
    }

    fn destroy(self) {
        log_failure(
            "soltar a vigia do primeiro plano",
            self.window
                .app_handle()
                .run_on_main_thread(win32::stop_watching_foreground),
        );
        log_failure("destruir", self.window.destroy());
    }
}

pub struct TauriOverlayEnvironment {
    app: AppHandle,
    handle: OverlayHandle,
}

impl TauriOverlayEnvironment {
    fn build_window(&self) -> Result<WebviewWindow, OverlayWindowError> {
        let page_handle = self.handle.clone();
        let move_handle = self.handle.clone();
        let window = WebviewWindowBuilder::new(
            &self.app,
            OVERLAY_WINDOW_LABEL,
            WebviewUrl::App(OVERLAY_PAGE.into()),
        )
        .title("Concord overlay")
        .inner_size(250.0, 100.0)
        .visible(false)
        .transparent(true)
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .focused(false)
        .focusable(false)
        .on_page_load(move |_, payload| {
            if payload.event() == PageLoadEvent::Finished {
                page_handle.page_loaded();
            }
        })
        .build()?;
        window.set_ignore_cursor_events(true)?;
        window.on_window_event(move |event| {
            if let WindowEvent::Moved(position) = event {
                move_handle.moved(OverlayPosition {
                    x: f64::from(position.x),
                    y: f64::from(position.y),
                });
            }
        });
        Ok(window)
    }
}

#[cfg(windows)]
fn apply_native_behavior(window: &WebviewWindow) {
    match window.hwnd() {
        Ok(hwnd) => {
            let raw = hwnd.0 as isize;
            win32::apply_overlay_styles(raw);
            log_failure(
                "vigiar o primeiro plano",
                window
                    .app_handle()
                    .run_on_main_thread(move || win32::watch_foreground(raw)),
            );
        }
        Err(error) => log::warn!("overlay: sem o HWND da janela: {error}"),
    }
}

#[cfg(not(windows))]
fn apply_native_behavior(_window: &WebviewWindow) {}

impl OverlayEnvironment for TauriOverlayEnvironment {
    type Window = TauriOverlayWindow;

    fn create_window(&self) -> Option<TauriOverlayWindow> {
        match self.build_window() {
            Ok(window) => {
                apply_native_behavior(&window);
                Some(TauriOverlayWindow { window })
            }
            Err(error) => {
                log::error!("overlay: não foi possível criar a janela: {error}");
                None
            }
        }
    }

    fn screen_at(&self, point: Option<OverlayPosition>) -> Screen {
        let monitor = match point {
            Some(point) => self.app.monitor_from_point(point.x, point.y),
            None => self.app.primary_monitor(),
        };
        let monitor = monitor
            .ok()
            .flatten()
            .or_else(|| self.app.primary_monitor().ok().flatten());
        let Some(monitor) = monitor else {
            log::warn!("overlay: nenhum monitor encontrado, usando a tela padrão");
            return FALLBACK_SCREEN;
        };
        let area = monitor.work_area();
        Screen {
            work_area: Rect {
                x: area.position.x,
                y: area.position.y,
                width: i32::try_from(area.size.width).unwrap_or(i32::MAX),
                height: i32::try_from(area.size.height).unwrap_or(i32::MAX),
            },
            scale: monitor.scale_factor(),
        }
    }

    fn notify_toggled(&self, enabled: bool) {
        log_failure(
            "avisar ligar/desligar",
            self.app
                .emit_to(MAIN_WINDOW_LABEL, events::OVERLAY_TOGGLED, enabled),
        );
    }

    fn notify_editing(&self, editing: bool) {
        log_failure(
            "avisar modo de mover",
            self.app
                .emit_to(MAIN_WINDOW_LABEL, events::OVERLAY_EDITING, editing),
        );
    }

    fn notify_moved(&self, position: OverlayPosition) {
        log_failure(
            "avisar posição",
            self.app
                .emit_to(MAIN_WINDOW_LABEL, events::OVERLAY_MOVED, position),
        );
    }

    fn notify_resized(&self, width: f64) {
        log_failure(
            "avisar largura",
            self.app
                .emit_to(MAIN_WINDOW_LABEL, events::OVERLAY_RESIZED, width),
        );
    }

    fn register_shortcut(&self, accelerator: &str, action: ShortcutAction) -> bool {
        let handle = self.handle.clone();
        let result = self
            .app
            .global_shortcut()
            .on_shortcut(accelerator, move |_, _, event| {
                if event.state() == ShortcutState::Pressed {
                    handle.run(action);
                }
            });
        if let Err(error) = &result {
            log::warn!("overlay: atalho {accelerator} indisponível: {error}");
        }
        result.is_ok()
    }

    fn remember_foreground(&self) {
        win32::remember_foreground();
    }

    fn return_foreground(&self) {
        win32::return_foreground();
    }

    fn unregister_shortcut(&self, accelerator: &str) {
        log_failure(
            "soltar atalho",
            self.app.global_shortcut().unregister(accelerator),
        );
    }
}

pub fn setup(app: &AppHandle, main_window: &WebviewWindow) {
    let environment_app = app.clone();
    let handle = worker::spawn(move |handle| TauriOverlayEnvironment {
        app: environment_app,
        handle,
    });
    app.manage(handle.clone());

    let focus_handle = handle.clone();
    main_window.on_window_event(move |event| match event {
        WindowEvent::Focused(focused) => focus_handle.set_main_focused(*focused),
        WindowEvent::Destroyed => focus_handle.stop(),
        _ => {}
    });

    let exit_handle = handle.clone();
    app.state::<Shutdown>().register(move || {
        win32::stop_watching_foreground();
        exit_handle.stop();
    });

    tauri::async_runtime::spawn_blocking(move || {
        match handle.set_shortcuts(OverlayShortcuts::default()) {
            Some(status) if !status.toggle || !status.edit => {
                log::warn!("overlay: atalhos padrão já em uso por outro programa: {status:?}");
            }
            Some(_) => {}
            None => log::warn!("overlay: sem resposta ao registrar os atalhos padrão"),
        }
    });
}
