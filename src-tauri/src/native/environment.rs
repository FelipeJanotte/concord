use serde::Serialize;

use crate::native::translucency::supports_translucency;
use crate::native::windows_version;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopEnvironment {
    pub platform: &'static str,
    pub translucency_supported: bool,
    pub window_buttons: bool,
    pub can_share_audio: bool,
}

impl DesktopEnvironment {
    pub fn for_operating_system(operating_system: &str, windows_build: Option<u32>) -> Self {
        let platform = match operating_system {
            "windows" => "win32",
            "macos" => "darwin",
            _ => "linux",
        };
        Self {
            platform,
            translucency_supported: supports_translucency(operating_system, windows_build),
            window_buttons: platform != "darwin",
            can_share_audio: platform == "win32",
        }
    }

    pub fn current() -> Self {
        Self::for_operating_system(std::env::consts::OS, windows_version::build_number())
    }

    pub fn initialization_script(&self) -> Result<String, serde_json::Error> {
        Ok(format!(
            "window.__CONCORD_DESKTOP__ = {};",
            serde_json::to_string(self)?
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_reports_win32_with_buttons_and_audio() {
        let environment = DesktopEnvironment::for_operating_system("windows", Some(22621));
        assert_eq!(environment.platform, "win32");
        assert!(environment.window_buttons);
        assert!(environment.can_share_audio);
    }

    #[test]
    fn translucency_follows_the_windows_build() {
        let supported = |build| {
            DesktopEnvironment::for_operating_system("windows", build).translucency_supported
        };
        assert!(supported(Some(22621)));
        assert!(!supported(Some(22000)));
        assert!(!supported(None));
        assert!(
            !DesktopEnvironment::for_operating_system("linux", Some(30000)).translucency_supported
        );
    }

    #[test]
    fn macos_keeps_system_buttons_and_no_audio_sharing() {
        let environment = DesktopEnvironment::for_operating_system("macos", None);
        assert_eq!(environment.platform, "darwin");
        assert!(!environment.window_buttons);
        assert!(!environment.can_share_audio);
    }

    #[test]
    fn script_assigns_camel_case_json_to_the_global() {
        let script = DesktopEnvironment::for_operating_system("linux", None)
            .initialization_script()
            .unwrap_or_default();
        assert_eq!(
            script,
            r#"window.__CONCORD_DESKTOP__ = {"platform":"linux","translucencySupported":false,"windowButtons":true,"canShareAudio":false};"#
        );
    }
}
