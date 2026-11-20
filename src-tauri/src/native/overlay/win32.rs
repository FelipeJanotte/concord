#[cfg(windows)]
mod platform {
    use std::sync::atomic::{AtomicIsize, Ordering};

    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowLongPtrW, IsWindow, SetForegroundWindow, SetWindowLongPtrW,
        SetWindowPos, EVENT_SYSTEM_FOREGROUND, GWL_EXSTYLE, HWND_TOPMOST, SWP_NOACTIVATE,
        SWP_NOMOVE, SWP_NOSIZE, WINEVENT_OUTOFCONTEXT, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };

    static TOPMOST_TARGET: AtomicIsize = AtomicIsize::new(0);
    static HOOK: AtomicIsize = AtomicIsize::new(0);
    static REMEMBERED_FOREGROUND: AtomicIsize = AtomicIsize::new(0);

    fn window_handle(raw: isize) -> HWND {
        HWND(raw as *mut core::ffi::c_void)
    }

    pub fn apply_overlay_styles(raw: isize) {
        let window = window_handle(raw);
        let extra = (WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW).0 as isize;
        unsafe {
            let current = GetWindowLongPtrW(window, GWL_EXSTYLE);
            SetWindowLongPtrW(window, GWL_EXSTYLE, current | extra);
        }
    }

    fn keep_topmost(raw: isize) {
        let flags = SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE;
        let result =
            unsafe { SetWindowPos(window_handle(raw), Some(HWND_TOPMOST), 0, 0, 0, 0, flags) };
        if let Err(error) = result {
            log::warn!("overlay: não foi possível manter a janela no topo: {error}");
        }
    }

    unsafe extern "system" fn on_foreground_change(
        _hook: HWINEVENTHOOK,
        _event: u32,
        _window: HWND,
        _object: i32,
        _child: i32,
        _thread: u32,
        _time: u32,
    ) {
        let target = TOPMOST_TARGET.load(Ordering::SeqCst);
        if target != 0 {
            keep_topmost(target);
        }
    }

    pub fn watch_foreground(raw: isize) {
        TOPMOST_TARGET.store(raw, Ordering::SeqCst);
        if HOOK.load(Ordering::SeqCst) != 0 {
            return;
        }
        let hook = unsafe {
            SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                None,
                Some(on_foreground_change),
                0,
                0,
                WINEVENT_OUTOFCONTEXT,
            )
        };
        if hook.0.is_null() {
            log::warn!("overlay: não foi possível vigiar a janela em primeiro plano");
            return;
        }
        HOOK.store(hook.0 as isize, Ordering::SeqCst);
    }

    pub fn remember_foreground() {
        let foreground = unsafe { GetForegroundWindow() };
        REMEMBERED_FOREGROUND.store(foreground.0 as isize, Ordering::SeqCst);
    }

    pub fn return_foreground() {
        let raw = REMEMBERED_FOREGROUND.swap(0, Ordering::SeqCst);
        if raw == 0 {
            return;
        }
        let window = window_handle(raw);
        if !unsafe { IsWindow(Some(window)) }.as_bool() {
            log::warn!("overlay: a janela em primeiro plano de antes não existe mais");
            return;
        }
        if !unsafe { SetForegroundWindow(window) }.as_bool() {
            log::warn!("overlay: não foi possível devolver o foco à janela de antes");
        }
    }

    pub fn stop_watching_foreground() {
        TOPMOST_TARGET.store(0, Ordering::SeqCst);
        let raw = HOOK.swap(0, Ordering::SeqCst);
        if raw == 0 {
            return;
        }
        let hook = HWINEVENTHOOK(raw as *mut core::ffi::c_void);
        if !unsafe { UnhookWinEvent(hook) }.as_bool() {
            log::warn!("overlay: não foi possível soltar a vigia da janela em primeiro plano");
        }
    }
}

#[cfg(not(windows))]
mod platform {
    pub fn apply_overlay_styles(_raw: isize) {}
    pub fn watch_foreground(_raw: isize) {}
    pub fn stop_watching_foreground() {}
    pub fn remember_foreground() {}
    pub fn return_foreground() {}
}

pub use platform::{
    apply_overlay_styles, remember_foreground, return_foreground, stop_watching_foreground,
    watch_foreground,
};
