pub mod google;
pub mod idle;
pub mod migration;
pub mod notifications;
pub mod overlay;
pub mod push_to_talk;
pub mod screen;
pub mod startup;
pub mod thumbar;
pub mod translucency;
pub mod updater;
pub mod window_controls;

macro_rules! command_registry {
    ($($module:ident :: $command:ident),* $(,)?) => {
        pub const NAMES: &[&str] = &[$(stringify!($command)),*];

        pub fn handler() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
            tauri::generate_handler![$($module::$command),*]
        }
    };
}

command_registry! {
    google::google_sign_in,
    screen::screen_sources,
    screen::screen_start,
    screen::screen_stop,
    screen::screen_preview,
    overlay::overlay_config,
    overlay::overlay_room,
    overlay::overlay_edit,
    overlay::overlay_shortcuts,
    overlay::overlay_shortcuts_pause,
    overlay::overlay_theme,
    overlay::overlay_resize,
    push_to_talk::ptt_config,
    push_to_talk::ptt_capture,
    idle::idle_get,
    notifications::notify,
    notifications::badge,
    thumbar::thumbar_buttons,
    updater::update_get,
    updater::update_check,
    updater::update_install,
    translucency::window_translucency,
    startup::startup_get,
    startup::startup_set,
    window_controls::window_control,
    window_controls::window_maximized_get,
    window_controls::show_main_window,
    migration::migration_done,
}
