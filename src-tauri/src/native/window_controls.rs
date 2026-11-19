use serde::Deserialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WindowControlAction {
    Minimize,
    Maximize,
    Close,
}

pub trait ControllableWindow {
    type Error;
    fn minimize(&self) -> Result<(), Self::Error>;
    fn maximize(&self) -> Result<(), Self::Error>;
    fn unmaximize(&self) -> Result<(), Self::Error>;
    fn is_maximized(&self) -> Result<bool, Self::Error>;
    fn close(&self) -> Result<(), Self::Error>;
}

pub fn apply<W: ControllableWindow>(
    window: &W,
    action: WindowControlAction,
) -> Result<(), W::Error> {
    match action {
        WindowControlAction::Minimize => window.minimize(),
        WindowControlAction::Close => window.close(),
        WindowControlAction::Maximize if window.is_maximized()? => window.unmaximize(),
        WindowControlAction::Maximize => window.maximize(),
    }
}

pub fn maximized_change(previous: bool, current: bool) -> Option<bool> {
    (previous != current).then_some(current)
}

impl<R: tauri::Runtime> ControllableWindow for tauri::WebviewWindow<R> {
    type Error = tauri::Error;

    fn minimize(&self) -> Result<(), Self::Error> {
        tauri::WebviewWindow::minimize(self)
    }

    fn maximize(&self) -> Result<(), Self::Error> {
        tauri::WebviewWindow::maximize(self)
    }

    fn unmaximize(&self) -> Result<(), Self::Error> {
        tauri::WebviewWindow::unmaximize(self)
    }

    fn is_maximized(&self) -> Result<bool, Self::Error> {
        tauri::WebviewWindow::is_maximized(self)
    }

    fn close(&self) -> Result<(), Self::Error> {
        tauri::WebviewWindow::close(self)
    }
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};

    use super::*;

    #[derive(Default)]
    struct FakeWindow {
        maximized: Cell<bool>,
        calls: RefCell<Vec<&'static str>>,
        failing: Cell<bool>,
    }

    impl FakeWindow {
        fn record(&self, call: &'static str) -> Result<(), String> {
            if self.failing.get() {
                return Err("falhou".into());
            }
            self.calls.borrow_mut().push(call);
            Ok(())
        }
    }

    impl ControllableWindow for FakeWindow {
        type Error = String;

        fn minimize(&self) -> Result<(), String> {
            self.record("minimize")
        }

        fn maximize(&self) -> Result<(), String> {
            self.maximized.set(true);
            self.record("maximize")
        }

        fn unmaximize(&self) -> Result<(), String> {
            self.maximized.set(false);
            self.record("unmaximize")
        }

        fn is_maximized(&self) -> Result<bool, String> {
            Ok(self.maximized.get())
        }

        fn close(&self) -> Result<(), String> {
            self.record("close")
        }
    }

    #[test]
    fn maximize_toggles_between_maximized_and_restored() {
        let window = FakeWindow::default();
        assert_eq!(apply(&window, WindowControlAction::Maximize), Ok(()));
        assert!(window.maximized.get());
        assert_eq!(apply(&window, WindowControlAction::Maximize), Ok(()));
        assert!(!window.maximized.get());
        assert_eq!(*window.calls.borrow(), vec!["maximize", "unmaximize"]);
    }

    #[test]
    fn minimize_and_close_do_exactly_that() {
        let window = FakeWindow::default();
        assert_eq!(apply(&window, WindowControlAction::Minimize), Ok(()));
        assert_eq!(apply(&window, WindowControlAction::Close), Ok(()));
        assert_eq!(*window.calls.borrow(), vec!["minimize", "close"]);
    }

    #[test]
    fn native_failures_reach_the_caller() {
        let window = FakeWindow::default();
        window.failing.set(true);
        assert_eq!(
            apply(&window, WindowControlAction::Close),
            Err("falhou".into())
        );
    }

    #[test]
    fn reports_only_real_maximized_changes() {
        assert_eq!(maximized_change(false, true), Some(true));
        assert_eq!(maximized_change(true, false), Some(false));
        assert_eq!(maximized_change(true, true), None);
        assert_eq!(maximized_change(false, false), None);
    }

    #[test]
    fn actions_arrive_as_the_lowercase_names_the_renderer_sends() {
        let action: Result<WindowControlAction, _> = serde_json::from_str("\"maximize\"");
        assert_eq!(action.ok(), Some(WindowControlAction::Maximize));
        assert!(serde_json::from_str::<WindowControlAction>("\"explode\"").is_err());
    }
}
