use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;

use crate::domain_error;
use crate::native::startup::{
    supports_open_at_login, FileMarker, LoginItems, StartupController, StartupFailure,
};

const DEFAULT_MARKER_FILE: &str = "startup-default-applied";

domain_error!(StartupError {
    #[error("{0}")]
    Failed(String),
});

impl From<StartupFailure> for StartupError {
    fn from(failure: StartupFailure) -> Self {
        Self::Failed(failure.to_string())
    }
}

struct AutostartItems(AppHandle);

impl LoginItems for AutostartItems {
    fn enabled(&self) -> Result<bool, StartupFailure> {
        self.0
            .autolaunch()
            .is_enabled()
            .map_err(|error| StartupFailure::LoginItems(error.to_string()))
    }

    fn set_enabled(&self, enabled: bool) -> Result<(), StartupFailure> {
        let autolaunch = self.0.autolaunch();
        let outcome = if enabled {
            autolaunch.enable()
        } else {
            autolaunch.disable()
        };
        outcome.map_err(|error| StartupFailure::LoginItems(error.to_string()))
    }
}

fn controller(
    app: &AppHandle,
) -> Result<StartupController<AutostartItems, FileMarker>, StartupError> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| StartupError::Failed(error.to_string()))?;
    Ok(StartupController {
        supported: supports_open_at_login(cfg!(windows), !cfg!(debug_assertions)),
        login_items: AutostartItems(app.clone()),
        marker: FileMarker {
            path: directory.join(DEFAULT_MARKER_FILE),
        },
    })
}

pub fn install(app: &AppHandle) {
    let applied = controller(app).and_then(|controller| Ok(controller.apply_default()?));
    if let Err(error) = applied {
        log::warn!("iniciar com o Windows: padrão não aplicado: {error}");
    }
}

#[tauri::command(async)]
pub fn startup_get(app: AppHandle) -> Result<Option<bool>, StartupError> {
    Ok(controller(&app)?.get()?)
}

#[tauri::command(async)]
pub fn startup_set(app: AppHandle, open_at_login: bool) -> Result<Option<bool>, StartupError> {
    Ok(controller(&app)?.set(open_at_login)?)
}
