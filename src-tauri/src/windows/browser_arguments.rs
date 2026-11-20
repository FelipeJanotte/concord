#[cfg_attr(not(windows), allow(dead_code))]
pub const WEBVIEW_BROWSER_ARGUMENTS: &str = concat!(
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection",
    " --autoplay-policy=no-user-gesture-required",
    " --disable-background-timer-throttling",
    " --disable-renderer-backgrounding",
    " --disable-backgrounding-occluded-windows"
);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_three_background_throttling_flags() {
        for flag in [
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
        ] {
            assert!(WEBVIEW_BROWSER_ARGUMENTS
                .split(' ')
                .any(|part| part == flag));
        }
    }

    #[test]
    fn keeps_the_defaults_that_setting_arguments_would_replace() {
        assert!(WEBVIEW_BROWSER_ARGUMENTS
            .split(' ')
            .any(|part| part == "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection"));
        assert!(WEBVIEW_BROWSER_ARGUMENTS
            .split(' ')
            .any(|part| part == "--autoplay-policy=no-user-gesture-required"));
    }
}
