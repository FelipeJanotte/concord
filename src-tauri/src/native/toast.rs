pub const APP_USER_MODEL_ID: &str = "com.concord.app";

#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub struct ToastError(pub String);

#[cfg(windows)]
mod platform {
    use windows::core::HSTRING;
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
    use windows::UI::Notifications::{ToastNotification, ToastNotificationManager};

    use super::{ToastError, APP_USER_MODEL_ID};

    fn native(error: windows::core::Error) -> ToastError {
        ToastError(error.to_string())
    }

    pub fn identify_process() -> Result<(), ToastError> {
        unsafe { SetCurrentProcessExplicitAppUserModelID(&HSTRING::from(APP_USER_MODEL_ID)) }
            .map_err(native)
    }

    pub fn show(xml: &str) -> Result<(), ToastError> {
        let document = XmlDocument::new().map_err(native)?;
        document.LoadXml(&HSTRING::from(xml)).map_err(native)?;
        let toast = ToastNotification::CreateToastNotification(&document).map_err(native)?;
        ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_USER_MODEL_ID))
            .map_err(native)?
            .Show(&toast)
            .map_err(native)
    }
}

#[cfg(not(windows))]
mod platform {
    use super::ToastError;

    pub fn identify_process() -> Result<(), ToastError> {
        Ok(())
    }

    pub fn show(_xml: &str) -> Result<(), ToastError> {
        Err(ToastError(
            "Notificações nativas só existem no Windows".into(),
        ))
    }
}

pub use platform::{identify_process, show};
