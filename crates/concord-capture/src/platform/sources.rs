use super::target::{CaptureTarget, monitor_rect, rect_size, window_rect};
use crate::error::CaptureError;
use crate::frame_size::{FrameSize, thumbnail_size};
use crate::source::{CaptureSource, SourceId, SourceKind};
use crate::thumbnail::{bgra_to_opaque_rgba, encode_png};
use std::ffi::c_void;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{
    BI_RGB, BITMAPINFO, BITMAPINFOHEADER, CAPTUREBLT, CreateCompatibleBitmap, CreateCompatibleDC,
    CreateDIBSection, DIB_RGB_COLORS, DeleteDC, DeleteObject, GdiFlush, GetDC, HALFTONE, HBITMAP,
    HDC, HGDIOBJ, HMONITOR, ReleaseDC, SRCCOPY, SelectObject, SetStretchBltMode, StretchBlt,
};
use windows::Win32::Storage::Xps::{PRINT_WINDOW_FLAGS, PrintWindow};
use windows_capture::monitor::Monitor;
use windows_capture::window::Window;

const PW_RENDERFULLCONTENT: u32 = 2;

pub(crate) fn list_sources() -> Result<Vec<CaptureSource>, CaptureError> {
    let monitors =
        Monitor::enumerate().map_err(|error| CaptureError::Capture(error.to_string()))?;
    let windows = Window::enumerate().map_err(|error| CaptureError::Capture(error.to_string()))?;
    let mut sources = Vec::with_capacity(monitors.len() + windows.len());
    for monitor in monitors {
        keep_listable("screen", screen_source(&monitor), &mut sources);
    }
    for window in windows {
        if let Some(source) = keep_listable_window(window_source(&window)) {
            sources.push(source);
        }
    }
    Ok(sources)
}

fn keep_listable(
    kind: &str,
    outcome: Result<CaptureSource, CaptureError>,
    sources: &mut Vec<CaptureSource>,
) {
    match outcome {
        Ok(source) => sources.push(source),
        Err(error) => log::warn!("skipping {kind} source: {error}"),
    }
}

fn keep_listable_window(
    outcome: Result<Option<CaptureSource>, CaptureError>,
) -> Option<CaptureSource> {
    outcome.unwrap_or_else(|error| {
        log::warn!("skipping window source: {error}");
        None
    })
}

pub(crate) fn thumbnail_of(source_id: &str) -> Result<Vec<u8>, CaptureError> {
    match CaptureTarget::resolve(SourceId::parse(source_id)?)? {
        CaptureTarget::Monitor(monitor) => screen_thumbnail(&monitor_rect(monitor)?),
        CaptureTarget::Window(window) => window_thumbnail(window),
    }
}

fn screen_source(monitor: &Monitor) -> Result<CaptureSource, CaptureError> {
    let handle = HMONITOR(monitor.as_raw_hmonitor());
    let title = monitor
        .name()
        .or_else(|_| monitor.device_name())
        .map_err(|error| CaptureError::Capture(error.to_string()))?;
    Ok(CaptureSource {
        id: SourceId {
            kind: SourceKind::Screen,
            handle: handle.0 as usize as u64,
        }
        .encode(),
        kind: SourceKind::Screen,
        title,
        thumbnail_png: screen_thumbnail(&monitor_rect(handle)?)?,
    })
}

fn window_source(window: &Window) -> Result<Option<CaptureSource>, CaptureError> {
    let title = window
        .title()
        .map_err(|error| CaptureError::Capture(error.to_string()))?;
    if title.trim().is_empty() {
        return Ok(None);
    }
    let handle = HWND(window.as_raw_hwnd());
    Ok(Some(CaptureSource {
        id: SourceId {
            kind: SourceKind::Window,
            handle: handle.0 as usize as u64,
        }
        .encode(),
        kind: SourceKind::Window,
        title,
        thumbnail_png: window_thumbnail(handle).unwrap_or_default(),
    }))
}

struct WindowDc {
    window: Option<HWND>,
    dc: HDC,
}

impl WindowDc {
    fn get(window: Option<HWND>) -> Result<Self, CaptureError> {
        let dc = unsafe { GetDC(window) };
        if dc.is_invalid() {
            return Err(CaptureError::Capture(
                "no device context for the source".into(),
            ));
        }
        Ok(Self { window, dc })
    }
}

impl Drop for WindowDc {
    fn drop(&mut self) {
        unsafe { ReleaseDC(self.window, self.dc) };
    }
}

struct MemoryDc(HDC);

impl MemoryDc {
    fn compatible_with(dc: HDC) -> Result<Self, CaptureError> {
        let memory = unsafe { CreateCompatibleDC(Some(dc)) };
        if memory.is_invalid() {
            return Err(CaptureError::Capture(
                "could not create a memory device context".into(),
            ));
        }
        Ok(Self(memory))
    }
}

impl Drop for MemoryDc {
    fn drop(&mut self) {
        let _ = unsafe { DeleteDC(self.0) };
    }
}

struct SelectedBitmap {
    dc: HDC,
    bitmap: HBITMAP,
    previous: HGDIOBJ,
}

impl SelectedBitmap {
    fn select(dc: &MemoryDc, bitmap: HBITMAP) -> Self {
        let previous = unsafe { SelectObject(dc.0, bitmap.into()) };
        Self {
            dc: dc.0,
            bitmap,
            previous,
        }
    }
}

impl Drop for SelectedBitmap {
    fn drop(&mut self) {
        unsafe {
            SelectObject(self.dc, self.previous);
            let _ = DeleteObject(self.bitmap.into());
        }
    }
}

fn screen_thumbnail(rect: &RECT) -> Result<Vec<u8>, CaptureError> {
    let screen = WindowDc::get(None)?;
    shrink_to_png(screen.dc, rect.left, rect.top, rect_size(rect))
}

fn window_thumbnail(window: HWND) -> Result<Vec<u8>, CaptureError> {
    let size = rect_size(&window_rect(window)?);
    let window_dc = WindowDc::get(Some(window))?;
    let full = MemoryDc::compatible_with(window_dc.dc)?;
    let bitmap =
        unsafe { CreateCompatibleBitmap(window_dc.dc, size.width as i32, size.height as i32) };
    if bitmap.is_invalid() {
        return Err(CaptureError::Capture(
            "could not create a window bitmap".into(),
        ));
    }
    let _selected = SelectedBitmap::select(&full, bitmap);
    unsafe { PrintWindow(window, full.0, PRINT_WINDOW_FLAGS(PW_RENDERFULLCONTENT)) }.ok()?;
    shrink_to_png(full.0, 0, 0, size)
}

fn shrink_to_png(
    source: HDC,
    left: i32,
    top: i32,
    source_size: FrameSize,
) -> Result<Vec<u8>, CaptureError> {
    let size = thumbnail_size(source_size);
    let memory = MemoryDc::compatible_with(source)?;
    let header = BITMAPINFOHEADER {
        biSize: size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: size.width as i32,
        biHeight: -(size.height as i32),
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB.0,
        ..Default::default()
    };
    let info = BITMAPINFO {
        bmiHeader: header,
        ..Default::default()
    };
    let mut bits: *mut c_void = std::ptr::null_mut();
    let bitmap =
        unsafe { CreateDIBSection(Some(memory.0), &info, DIB_RGB_COLORS, &mut bits, None, 0)? };
    let _selected = SelectedBitmap::select(&memory, bitmap);
    unsafe {
        SetStretchBltMode(memory.0, HALFTONE);
        StretchBlt(
            memory.0,
            0,
            0,
            size.width as i32,
            size.height as i32,
            Some(source),
            left,
            top,
            source_size.width as i32,
            source_size.height as i32,
            SRCCOPY | CAPTUREBLT,
        )
        .ok()?;
        GdiFlush().ok()?;
    }
    if bits.is_null() {
        return Err(CaptureError::Capture(
            "thumbnail bitmap has no pixels".into(),
        ));
    }
    let length = size.width as usize * size.height as usize * 4;
    let bgra = unsafe { std::slice::from_raw_parts(bits.cast::<u8>(), length) };
    encode_png(&bgra_to_opaque_rgba(bgra), size)
}
