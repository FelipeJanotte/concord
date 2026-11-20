pub mod commands;
pub mod errors;
pub mod events;
pub mod native;
pub mod shutdown;
pub mod windows;

use tauri::{Manager, RunEvent};

pub fn run() -> Result<(), tauri::Error> {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(
            |app, _arguments, _directory| commands::notifications::focus_main_window(app),
        ))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(native::logging::plugin())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .on_page_load(|webview, payload| {
            commands::notifications::page_loaded(webview, &payload.event())
        })
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(shutdown::Shutdown::default())
        .manage(commands::screen::ScreenShareState::default())
        .setup(|app| {
            let main_window = windows::main_window::create(app.handle())?;
            windows::overlay_window::setup(app.handle(), &main_window);
            commands::screen::stop_share_on_shutdown(app.handle());
            commands::push_to_talk::install(app.handle());
            commands::idle::install(app.handle());
            commands::notifications::install(app.handle());
            commands::startup::install(app.handle());
            Ok(())
        })
        .invoke_handler(commands::handler())
        .build(tauri::generate_context!())?
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<shutdown::Shutdown>().run_all();
            }
        });
    Ok(())
}
