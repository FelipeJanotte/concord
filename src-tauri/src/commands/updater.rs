use std::sync::{Mutex, MutexGuard, PoisonError};
use std::thread;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::domain_error;
use crate::events;
use crate::native::updater::state::{UpdateEvent, UpdateMachine, UpdateStatus, CHECK_INTERVAL};

domain_error!(UpdaterError {
    #[error("Falha ao instalar a atualização: {0}")]
    Install(String),
});

#[derive(Default)]
pub struct UpdaterState {
    machine: Mutex<UpdateMachine>,
    downloaded: Mutex<Option<DownloadedUpdate>>,
}

struct DownloadedUpdate {
    update: Update,
    bytes: Vec<u8>,
}

fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn publish(app: &AppHandle, event: UpdateEvent) -> bool {
    let changed = locked(&app.state::<UpdaterState>().machine).apply(event);
    match changed {
        Some(status) => {
            if let Err(error) = app.emit(events::UPDATE_STATUS, status) {
                log::warn!("não foi possível avisar a atualização: {error}");
            }
            true
        }
        None => false,
    }
}

async fn download_available(app: &AppHandle) -> Result<(), tauri_plugin_updater::Error> {
    let Some(update) = app.updater()?.check().await? else {
        publish(app, UpdateEvent::NotAvailable);
        return Ok(());
    };
    let version = update.version.clone();
    publish(
        app,
        UpdateEvent::Available {
            version: version.clone(),
        },
    );
    let mut downloaded = 0u64;
    let bytes = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                publish(app, UpdateEvent::Progress { downloaded, total });
            },
            || {},
        )
        .await?;
    *locked(&app.state::<UpdaterState>().downloaded) = Some(DownloadedUpdate { update, bytes });
    publish(app, UpdateEvent::Downloaded { version });
    Ok(())
}

async fn run_check(app: AppHandle) {
    if !publish(&app, UpdateEvent::Checking) {
        return;
    }
    if let Err(error) = download_available(&app).await {
        log::error!("atualização falhou: {error}");
        publish(&app, UpdateEvent::Failed);
    }
}

pub fn start(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    thread::spawn(move || loop {
        tauri::async_runtime::block_on(run_check(app.clone()));
        thread::sleep(CHECK_INTERVAL);
    });
}

#[tauri::command]
pub fn update_get(state: State<UpdaterState>) -> Result<UpdateStatus, UpdaterError> {
    Ok(locked(&state.machine).status().clone())
}

#[tauri::command]
pub fn update_check(app: AppHandle) -> Result<(), UpdaterError> {
    if cfg!(debug_assertions) {
        publish(&app, UpdateEvent::Unsupported);
    } else {
        tauri::async_runtime::spawn(run_check(app));
    }
    Ok(())
}

#[tauri::command]
pub fn update_install(app: AppHandle, state: State<UpdaterState>) -> Result<(), UpdaterError> {
    let guard = locked(&state.downloaded);
    let Some(ready) = guard.as_ref() else {
        return Ok(());
    };
    ready
        .update
        .install(&ready.bytes)
        .map_err(|error| UpdaterError::Install(error.to_string()))?;
    drop(guard);
    app.restart()
}
