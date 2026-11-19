use crate::error::CaptureError;
use crate::frame_size::FrameSize;
use crate::source::{SourceId, SourceKind};
use std::ffi::c_void;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, HMONITOR, MONITOR_DEFAULTTONEAREST, MONITORINFO, MonitorFromWindow,
};
use windows::Win32::UI::WindowsAndMessaging::{GetWindowRect, IsWindow};

#[derive(Debug, Clone, Copy)]
pub(crate) enum CaptureTarget {
    Monitor(HMONITOR),
    Window(HWND),
}

unsafe impl Send for CaptureTarget {}

impl CaptureTarget {
    pub fn resolve(id: SourceId) -> Result<Self, CaptureError> {
        let pointer = id.handle as usize as *mut c_void;
        let target = match id.kind {
            SourceKind::Screen => Self::Monitor(HMONITOR(pointer)),
            SourceKind::Window => Self::Window(HWND(pointer)),
        };
        match target {
            Self::Window(window) if !unsafe { IsWindow(Some(window)) }.as_bool() => {
                Err(CaptureError::SourceNotFound(id.encode()))
            }
            Self::Monitor(monitor) if monitor_rect(monitor).is_err() => {
                Err(CaptureError::SourceNotFound(id.encode()))
            }
            _ => Ok(target),
        }
    }

    pub fn monitor(&self) -> HMONITOR {
        match *self {
            Self::Monitor(monitor) => monitor,
            Self::Window(window) => unsafe { MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST) },
        }
    }

    pub fn size(&self) -> Result<FrameSize, CaptureError> {
        let rect = match *self {
            Self::Monitor(monitor) => monitor_rect(monitor)?,
            Self::Window(window) => window_rect(window)?,
        };
        Ok(rect_size(&rect))
    }
}

pub(crate) fn monitor_rect(monitor: HMONITOR) -> Result<RECT, CaptureError> {
    let mut info = MONITORINFO {
        cbSize: size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    if unsafe { GetMonitorInfoW(monitor, &mut info) }.as_bool() {
        Ok(info.rcMonitor)
    } else {
        Err(CaptureError::Windows(windows::core::Error::from_thread()))
    }
}

pub(crate) fn window_rect(window: HWND) -> Result<RECT, CaptureError> {
    let mut rect = RECT::default();
    unsafe { GetWindowRect(window, &mut rect)? };
    Ok(rect)
}

pub(crate) fn rect_size(rect: &RECT) -> FrameSize {
    FrameSize {
        width: rect.right.saturating_sub(rect.left).max(1).unsigned_abs(),
        height: rect.bottom.saturating_sub(rect.top).max(1).unsigned_abs(),
    }
}
