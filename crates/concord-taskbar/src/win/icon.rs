use std::ffi::c_void;
use std::ptr::null_mut;

use windows::Win32::Foundation::HANDLE;
use windows::Win32::Graphics::Gdi::{
    CreateBitmap, CreateDIBSection, DeleteObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    DIB_RGB_COLORS, HBITMAP, HGDIOBJ,
};
use windows::Win32::UI::WindowsAndMessaging::{CreateIconIndirect, DestroyIcon, HICON, ICONINFO};

use crate::error::TaskbarError;
use crate::pixels::{decode_icon_png, IconPixels};

struct OwnedBitmap(HBITMAP);

impl Drop for OwnedBitmap {
    fn drop(&mut self) {
        unsafe {
            if !DeleteObject(HGDIOBJ(self.0 .0)).as_bool() {
                log::warn!("icon bitmap not deleted");
            }
        }
    }
}

pub struct OwnedIcon(HICON);

impl OwnedIcon {
    pub fn from_png(png_bytes: &[u8]) -> Result<OwnedIcon, TaskbarError> {
        let pixels = decode_icon_png(png_bytes)?;
        let (width, height) = signed_size(&pixels)?;
        let color = color_bitmap(&pixels, width, height)?;
        let mask = OwnedBitmap(unsafe { CreateBitmap(width, height, 1, 1, None) });
        let info = ICONINFO {
            fIcon: true.into(),
            xHotspot: 0,
            yHotspot: 0,
            hbmMask: mask.0,
            hbmColor: color.0,
        };
        let icon = unsafe { CreateIconIndirect(&info) }?;
        Ok(OwnedIcon(icon))
    }

    pub fn handle(&self) -> HICON {
        self.0
    }
}

impl Drop for OwnedIcon {
    fn drop(&mut self) {
        unsafe {
            if let Err(error) = DestroyIcon(self.0) {
                log::warn!("icon not destroyed: {error}");
            }
        }
    }
}

fn signed_size(pixels: &IconPixels) -> Result<(i32, i32), TaskbarError> {
    match (i32::try_from(pixels.width), i32::try_from(pixels.height)) {
        (Ok(width), Ok(height)) => Ok((width, height)),
        _ => Err(TaskbarError::InvalidIconSize {
            width: pixels.width,
            height: pixels.height,
        }),
    }
}

fn color_bitmap(pixels: &IconPixels, width: i32, height: i32) -> Result<OwnedBitmap, TaskbarError> {
    let header = BITMAPINFOHEADER {
        biSize: size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: width,
        biHeight: -height,
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB.0,
        ..Default::default()
    };
    let info = BITMAPINFO {
        bmiHeader: header,
        ..Default::default()
    };
    let mut bits: *mut c_void = null_mut();
    let bitmap =
        unsafe { CreateDIBSection(None, &info, DIB_RGB_COLORS, &mut bits, None::<HANDLE>, 0) }?;
    let owned = OwnedBitmap(bitmap);
    unsafe {
        std::ptr::copy_nonoverlapping(
            pixels.premultiplied_bgra.as_ptr(),
            bits.cast::<u8>(),
            pixels.premultiplied_bgra.len(),
        );
    }
    Ok(owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::Graphics::Gdi::{GetObjectW, BITMAP};
    use windows::Win32::UI::WindowsAndMessaging::GetIconInfo;

    fn sixteen_by_sixteen_png() -> Vec<u8> {
        let mut out = Vec::new();
        let mut encoder = png::Encoder::new(&mut out, 16, 16);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().expect("header");
        writer
            .write_image_data(&[255u8; 16 * 16 * 4])
            .expect("data");
        writer.finish().expect("finish");
        out
    }

    #[test]
    fn icon_keeps_the_png_dimensions() {
        let icon = OwnedIcon::from_png(&sixteen_by_sixteen_png()).expect("icon");
        let mut info = ICONINFO::default();
        unsafe { GetIconInfo(icon.handle(), &mut info) }.expect("icon info");
        let color = OwnedBitmap(info.hbmColor);
        let _mask = OwnedBitmap(info.hbmMask);
        let mut bitmap = BITMAP::default();
        unsafe {
            GetObjectW(
                HGDIOBJ(color.0 .0),
                size_of::<BITMAP>() as i32,
                Some((&mut bitmap as *mut BITMAP).cast()),
            )
        };
        assert_eq!((bitmap.bmWidth, bitmap.bmHeight), (16, 16));
    }

    #[test]
    fn invalid_png_creates_no_icon() {
        assert!(OwnedIcon::from_png(b"nope").is_err());
    }
}
