use std::sync::Arc;

use tauri::{AppHandle, Manager, State};

use crate::domain_error;
use crate::events;
use crate::native::main_window_events::emit_to_main;
use crate::native::push_to_talk::{
    hook_config, system_factory, PttController, SystemHook, CAPTURE_TIMEOUT,
};
pub use crate::native::push_to_talk::{PttBinding, PttBindingKind, PttConfig};
use crate::shutdown::Shutdown;

domain_error!(PushToTalkError {
    #[error("{0}")]
    Hook(String),
    #[error("A escolha da tecla foi interrompida: {0}")]
    Interrupted(String),
});

impl From<concord_ptt::PushToTalkError> for PushToTalkError {
    fn from(error: concord_ptt::PushToTalkError) -> Self {
        Self::Hook(error.to_string())
    }
}

type SharedController = Arc<PttController<SystemHook>>;

pub fn install(app: &AppHandle) {
    let announcer = app.clone();
    let alerter = app.clone();
    let controller: SharedController = Arc::new(PttController::new(
        system_factory(),
        Arc::new(move |pressed| emit_to_main(&announcer, events::PTT_CHANGE, pressed)),
        move || emit_to_main(&alerter, events::PTT_UNAVAILABLE, ()),
    ));
    let stopping = Arc::clone(&controller);
    app.state::<Shutdown>()
        .register(move || stopping.shutdown());
    app.manage(controller);
}

#[tauri::command(async)]
pub fn ptt_config(
    controller: State<'_, SharedController>,
    config: PttConfig,
) -> Result<(), PushToTalkError> {
    Ok(controller.configure(hook_config(&config))?)
}

#[tauri::command]
pub async fn ptt_capture(
    controller: State<'_, SharedController>,
) -> Result<Option<PttBinding>, PushToTalkError> {
    let controller = Arc::clone(&controller);
    let captured =
        tauri::async_runtime::spawn_blocking(move || controller.capture(CAPTURE_TIMEOUT))
            .await
            .map_err(|error| PushToTalkError::Interrupted(error.to_string()))??;
    Ok(captured.map(PttBinding::from))
}
