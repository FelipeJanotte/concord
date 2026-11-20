use tauri::webview::{PermissionKind, PermissionResponse};

pub fn respond(kind: &PermissionKind) -> PermissionResponse {
    if allows(kind) {
        PermissionResponse::Allow
    } else {
        PermissionResponse::Deny
    }
}

fn allows(kind: &PermissionKind) -> bool {
    matches!(
        kind,
        PermissionKind::Microphone | PermissionKind::Camera | PermissionKind::Notifications
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_microphone_camera_and_notifications() {
        for kind in [
            PermissionKind::Microphone,
            PermissionKind::Camera,
            PermissionKind::Notifications,
        ] {
            assert!(allows(&kind));
        }
    }

    #[test]
    fn denies_everything_else() {
        for kind in [
            PermissionKind::Geolocation,
            PermissionKind::ClipboardRead,
            PermissionKind::DisplayCapture,
            PermissionKind::Midi,
            PermissionKind::Sensors,
        ] {
            assert!(!allows(&kind));
        }
    }
}
