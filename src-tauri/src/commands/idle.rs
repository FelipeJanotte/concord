use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Manager, State};

pub struct IdleState(Arc<AtomicBool>);

#[cfg(windows)]
pub fn install(app: &AppHandle) {
    use crate::events;
    use crate::native::idle::{IdleWatcher, SystemIdleClock, IDLE_CHECK_INTERVAL};
    use crate::native::main_window_events::emit_to_main;
    use crate::shutdown::Shutdown;

    let idle = Arc::new(AtomicBool::new(false));
    let announced = Arc::clone(&idle);
    let announcer = app.clone();
    let mut watcher = IdleWatcher::start(SystemIdleClock, IDLE_CHECK_INTERVAL, move |now| {
        announced.store(now, Ordering::SeqCst);
        emit_to_main(&announcer, events::IDLE_CHANGE, now);
    });
    app.state::<Shutdown>().register(move || watcher.stop());
    app.manage(IdleState(idle));
}

#[cfg(not(windows))]
pub fn install(app: &AppHandle) {
    app.manage(IdleState(Arc::new(AtomicBool::new(false))));
}

#[tauri::command]
pub fn idle_get(state: State<'_, IdleState>) -> bool {
    state.0.load(Ordering::SeqCst)
}
