#[derive(Debug, thiserror::Error)]
pub enum StartupFailure {
    #[error("{0}")]
    LoginItems(String),
    #[error("não foi possível guardar a marca do padrão: {0}")]
    Marker(#[from] std::io::Error),
}

pub trait LoginItems {
    fn enabled(&self) -> Result<bool, StartupFailure>;
    fn set_enabled(&self, enabled: bool) -> Result<(), StartupFailure>;
}

pub trait DefaultMarker {
    fn applied(&self) -> bool;
    fn mark_applied(&self) -> Result<(), StartupFailure>;
}

pub struct StartupController<Items, Marker> {
    pub supported: bool,
    pub login_items: Items,
    pub marker: Marker,
}

impl<Items: LoginItems, Marker: DefaultMarker> StartupController<Items, Marker> {
    pub fn apply_default(&self) -> Result<(), StartupFailure> {
        if !self.supported || self.marker.applied() {
            return Ok(());
        }
        self.login_items.set_enabled(true)?;
        self.marker.mark_applied()
    }

    pub fn get(&self) -> Result<Option<bool>, StartupFailure> {
        if !self.supported {
            return Ok(None);
        }
        self.login_items.enabled().map(Some)
    }

    pub fn set(&self, open_at_login: bool) -> Result<Option<bool>, StartupFailure> {
        if self.supported {
            self.login_items.set_enabled(open_at_login)?;
        }
        self.get()
    }
}

pub struct FileMarker {
    pub path: std::path::PathBuf,
}

impl DefaultMarker for FileMarker {
    fn applied(&self) -> bool {
        self.path.exists()
    }

    fn mark_applied(&self) -> Result<(), StartupFailure> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&self.path, b"")?;
        Ok(())
    }
}

pub fn supports_open_at_login(is_windows: bool, is_packaged: bool) -> bool {
    is_windows && is_packaged
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};

    use super::*;

    #[derive(Default)]
    struct FakeItems {
        enabled: Cell<bool>,
        writes: RefCell<Vec<bool>>,
    }

    impl LoginItems for &FakeItems {
        fn enabled(&self) -> Result<bool, StartupFailure> {
            Ok(self.enabled.get())
        }

        fn set_enabled(&self, enabled: bool) -> Result<(), StartupFailure> {
            self.enabled.set(enabled);
            self.writes.borrow_mut().push(enabled);
            Ok(())
        }
    }

    #[derive(Default)]
    struct FakeMarker {
        applied: Cell<bool>,
    }

    impl DefaultMarker for &FakeMarker {
        fn applied(&self) -> bool {
            self.applied.get()
        }

        fn mark_applied(&self) -> Result<(), StartupFailure> {
            self.applied.set(true);
            Ok(())
        }
    }

    fn controller<'a>(
        supported: bool,
        items: &'a FakeItems,
        marker: &'a FakeMarker,
    ) -> StartupController<&'a FakeItems, &'a FakeMarker> {
        StartupController {
            supported,
            login_items: items,
            marker,
        }
    }

    #[test]
    fn first_run_turns_it_on_and_remembers() {
        let (items, marker) = (FakeItems::default(), FakeMarker::default());
        assert!(controller(true, &items, &marker).apply_default().is_ok());
        assert!(items.enabled.get());
        assert!(marker.applied.get());
    }

    #[test]
    fn later_runs_respect_the_choice_of_the_person() {
        let (items, marker) = (FakeItems::default(), FakeMarker::default());
        marker.applied.set(true);
        assert!(controller(true, &items, &marker).apply_default().is_ok());
        assert!(items.writes.borrow().is_empty());
    }

    #[test]
    fn unsupported_does_nothing_and_reports_null() {
        let (items, marker) = (FakeItems::default(), FakeMarker::default());
        let controller = controller(false, &items, &marker);
        assert!(controller.apply_default().is_ok());
        assert_eq!(controller.get().ok(), Some(None));
        assert_eq!(controller.set(true).ok(), Some(None));
        assert!(items.writes.borrow().is_empty());
        assert!(!marker.applied.get());
    }

    #[test]
    fn set_writes_and_reads_back() {
        let (items, marker) = (FakeItems::default(), FakeMarker::default());
        let controller = controller(true, &items, &marker);
        assert_eq!(controller.set(true).ok(), Some(Some(true)));
        assert_eq!(controller.set(false).ok(), Some(Some(false)));
    }

    #[test]
    fn only_a_packaged_windows_app_can_open_at_login() {
        assert!(supports_open_at_login(true, true));
        assert!(!supports_open_at_login(true, false));
        assert!(!supports_open_at_login(false, true));
    }

    #[test]
    fn file_marker_is_created_once_inside_the_directory() {
        let directory = std::env::temp_dir().join(format!("concord-marker-{}", std::process::id()));
        let marker = FileMarker {
            path: directory.join("startup-default-applied"),
        };
        assert!(!marker.applied());
        assert!(marker.mark_applied().is_ok());
        assert!(marker.applied());
        assert!(std::fs::remove_dir_all(&directory).is_ok());
    }
}
