macro_rules! event_names {
    ($($constant:ident = $name:literal),* $(,)?) => {
        $(pub const $constant: &str = $name;)*
        pub const ALL: &[&str] = &[$($constant),*];
    };
}

event_names! {
    WINDOW_MAXIMIZED = "window-maximized",
    OVERLAY_TOGGLED = "overlay-toggled",
    OVERLAY_EDITING = "overlay-editing",
    OVERLAY_MOVED = "overlay-moved",
    OVERLAY_RESIZED = "overlay-resized",
    OVERLAY_UPDATE = "overlay-update",
    OVERLAY_THEME = "overlay-theme",
    PTT_CHANGE = "ptt-change",
    PTT_UNAVAILABLE = "ptt-unavailable",
    IDLE_CHANGE = "idle-change",
    NOTIFICATION_CLICK = "notification-click",
    THUMBAR_CLICK = "thumbar-click",
    UPDATE_STATUS = "update-status",
}
