#[cfg(windows)]
pub fn build_number() -> Option<u32> {
    use windows::Wdk::System::SystemServices::RtlGetVersion;
    use windows::Win32::System::SystemInformation::OSVERSIONINFOW;

    let mut information = OSVERSIONINFOW {
        dwOSVersionInfoSize: size_of::<OSVERSIONINFOW>() as u32,
        ..Default::default()
    };
    let status = unsafe { RtlGetVersion(&mut information) };
    if status.is_ok() {
        Some(information.dwBuildNumber)
    } else {
        log::warn!("RtlGetVersion falhou: {status:?}");
        None
    }
}

#[cfg(not(windows))]
pub fn build_number() -> Option<u32> {
    None
}
