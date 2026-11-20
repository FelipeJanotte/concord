use serde::Deserialize;

pub const WINDOWS_ACRYLIC_BUILD: u32 = 22621;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WindowScheme {
    Dark,
    Light,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rgba(pub u8, pub u8, pub u8, pub u8);

pub const OPAQUE_WINDOW_COLOR: Rgba = Rgba(30, 31, 34, 255);
pub const TRANSPARENT_WINDOW_COLOR: Rgba = Rgba(0, 0, 0, 0);

pub fn supports_translucency(operating_system: &str, windows_build: Option<u32>) -> bool {
    operating_system == "windows"
        && windows_build.is_some_and(|build| build >= WINDOWS_ACRYLIC_BUILD)
}

pub fn is_supported_here() -> bool {
    supports_translucency(
        std::env::consts::OS,
        crate::native::windows_version::build_number(),
    )
}

pub fn window_color(glass: bool) -> Rgba {
    if glass {
        TRANSPARENT_WINDOW_COLOR
    } else {
        OPAQUE_WINDOW_COLOR
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_11_22h2_and_later_supports_glass() {
        assert!(supports_translucency("windows", Some(22621)));
        assert!(supports_translucency("windows", Some(26100)));
    }

    #[test]
    fn older_windows_does_not() {
        assert!(!supports_translucency("windows", Some(22000)));
        assert!(!supports_translucency("windows", Some(19045)));
    }

    #[test]
    fn unknown_build_and_other_systems_do_not() {
        assert!(!supports_translucency("windows", None));
        assert!(!supports_translucency("linux", Some(30000)));
        assert!(!supports_translucency("macos", Some(30000)));
    }

    #[test]
    fn glass_is_transparent_and_solid_matches_the_previous_desktop_app_color() {
        assert_eq!(window_color(true), Rgba(0, 0, 0, 0));
        assert_eq!(window_color(false), Rgba(30, 31, 34, 255));
    }
}
