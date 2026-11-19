use tauri::plugin::TauriPlugin;
use tauri::Wry;
use tauri_plugin_log::{Target, TargetKind};

fn target_kinds(debug_build: bool) -> Vec<TargetKind> {
    let mut kinds = vec![TargetKind::LogDir { file_name: None }];
    if debug_build {
        kinds.push(TargetKind::Stdout);
    }
    kinds
}

pub fn plugin() -> TauriPlugin<Wry> {
    let level = if cfg!(debug_assertions) {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .targets(
            target_kinds(cfg!(debug_assertions))
                .into_iter()
                .map(Target::new),
        )
        .level(level)
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_builds_log_to_the_log_directory_only() {
        let kinds = target_kinds(false);
        assert_eq!(kinds.len(), 1);
        assert!(matches!(kinds[0], TargetKind::LogDir { .. }));
    }

    #[test]
    fn debug_builds_also_log_to_stdout() {
        let kinds = target_kinds(true);
        assert_eq!(kinds.len(), 2);
        assert!(matches!(kinds[1], TargetKind::Stdout));
    }
}
