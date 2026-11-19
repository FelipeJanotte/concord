pub mod commands;
pub mod errors;
pub mod events;
pub mod native;
pub mod shutdown;
pub mod windows;

use tauri::{Manager, RunEvent};

pub fn run() -> Result<(), tauri::Error> {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .manage(shutdown::Shutdown::default())
        .setup(|app| {
            windows::main_window::create(app.handle())?;
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
