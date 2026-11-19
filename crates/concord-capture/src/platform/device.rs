use crate::error::CaptureError;
use windows::Win32::Foundation::{HMODULE, LUID};
use windows::Win32::Graphics::Direct3D::{
    D3D_DRIVER_TYPE, D3D_DRIVER_TYPE_UNKNOWN, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1,
};
use windows::Win32::Graphics::Direct3D11::{
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_CREATE_DEVICE_VIDEO_SUPPORT, D3D11_SDK_VERSION,
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Multithread,
};
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIAdapter, IDXGIAdapter1, IDXGIDevice, IDXGIFactory1,
};
use windows::Win32::Graphics::Gdi::HMONITOR;
use windows::core::Interface;

#[derive(Clone)]
pub(crate) struct GpuDevice {
    pub device: ID3D11Device,
    pub context: ID3D11DeviceContext,
    pub adapter_luid: LUID,
}

unsafe impl Send for GpuDevice {}

impl GpuDevice {
    pub fn for_monitor(monitor: HMONITOR) -> Result<Self, CaptureError> {
        let adapter = adapter_owning(monitor)?;
        Self::create(
            Some(&adapter.cast::<IDXGIAdapter>()?),
            D3D_DRIVER_TYPE_UNKNOWN,
        )
    }

    #[cfg(test)]
    pub fn warp() -> Result<Self, CaptureError> {
        Self::create(
            None,
            windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_WARP,
        )
    }

    fn create(
        adapter: Option<&IDXGIAdapter>,
        driver_type: D3D_DRIVER_TYPE,
    ) -> Result<Self, CaptureError> {
        let mut device = None;
        let mut context = None;
        unsafe {
            D3D11CreateDevice(
                adapter,
                driver_type,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT,
                Some(&[D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0]),
                D3D11_SDK_VERSION,
                Some(&mut device),
                None,
                Some(&mut context),
            )?;
        }
        let device: ID3D11Device =
            device.ok_or_else(|| CaptureError::Capture("Direct3D returned no device".into()))?;
        let context =
            context.ok_or_else(|| CaptureError::Capture("Direct3D returned no context".into()))?;
        let _previously_protected = unsafe {
            context
                .cast::<ID3D11Multithread>()?
                .SetMultithreadProtected(true)
        };
        let adapter_luid = unsafe {
            device
                .cast::<IDXGIDevice>()?
                .GetAdapter()?
                .GetDesc()?
                .AdapterLuid
        };
        Ok(Self {
            device,
            context,
            adapter_luid,
        })
    }
}

fn adapter_owning(monitor: HMONITOR) -> Result<IDXGIAdapter1, CaptureError> {
    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1()? };
    let mut first_adapter = None;
    for adapter_index in 0.. {
        let Ok(adapter) = (unsafe { factory.EnumAdapters1(adapter_index) }) else {
            break;
        };
        for output_index in 0.. {
            let Ok(output) = (unsafe { adapter.EnumOutputs(output_index) }) else {
                break;
            };
            if unsafe { output.GetDesc()? }.Monitor == monitor {
                return Ok(adapter);
            }
        }
        first_adapter.get_or_insert(adapter);
    }
    first_adapter.ok_or_else(|| CaptureError::Capture("no graphics adapter found".into()))
}
