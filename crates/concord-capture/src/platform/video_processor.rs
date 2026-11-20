use super::device::GpuDevice;
use crate::error::CaptureError;
use crate::frame_size::FrameSize;
use std::mem::ManuallyDrop;
use windows::Win32::Graphics::Direct3D11::{
    D3D11_BIND_RENDER_TARGET, D3D11_TEX2D_VPIV, D3D11_TEX2D_VPOV, D3D11_TEXTURE2D_DESC,
    D3D11_USAGE_DEFAULT, D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE, D3D11_VIDEO_PROCESSOR_CONTENT_DESC,
    D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC, D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0,
    D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC, D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC_0,
    D3D11_VIDEO_PROCESSOR_STREAM, D3D11_VIDEO_USAGE_PLAYBACK_NORMAL,
    D3D11_VPIV_DIMENSION_TEXTURE2D, D3D11_VPOV_DIMENSION_TEXTURE2D, ID3D11Texture2D,
    ID3D11VideoContext1, ID3D11VideoDevice, ID3D11VideoProcessor, ID3D11VideoProcessorEnumerator,
    ID3D11VideoProcessorInputView, ID3D11VideoProcessorOutputView,
};
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709, DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709,
    DXGI_FORMAT_NV12, DXGI_RATIONAL, DXGI_SAMPLE_DESC,
};
use windows::core::Interface;

const NV12_POOL_SIZE: usize = 4;

struct Nv12Slot {
    texture: ID3D11Texture2D,
    view: ID3D11VideoProcessorOutputView,
}

pub(crate) struct Nv12Converter {
    video_device: ID3D11VideoDevice,
    video_context: ID3D11VideoContext1,
    enumerator: ID3D11VideoProcessorEnumerator,
    processor: ID3D11VideoProcessor,
    slots: Vec<Nv12Slot>,
    next: usize,
}

impl Nv12Converter {
    pub fn new(
        gpu: &GpuDevice,
        source: FrameSize,
        target: FrameSize,
        frames_per_second: u32,
    ) -> Result<Self, CaptureError> {
        let video_device: ID3D11VideoDevice = gpu.device.cast()?;
        let video_context: ID3D11VideoContext1 = gpu.context.cast()?;
        let rate = DXGI_RATIONAL {
            Numerator: frames_per_second,
            Denominator: 1,
        };
        let content = D3D11_VIDEO_PROCESSOR_CONTENT_DESC {
            InputFrameFormat: D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE,
            InputFrameRate: rate,
            InputWidth: source.width,
            InputHeight: source.height,
            OutputFrameRate: rate,
            OutputWidth: target.width,
            OutputHeight: target.height,
            Usage: D3D11_VIDEO_USAGE_PLAYBACK_NORMAL,
        };
        let enumerator = unsafe { video_device.CreateVideoProcessorEnumerator(&content)? };
        let processor = unsafe { video_device.CreateVideoProcessor(&enumerator, 0)? };
        unsafe {
            video_context.VideoProcessorSetStreamColorSpace1(
                &processor,
                0,
                DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709,
            );
            video_context.VideoProcessorSetOutputColorSpace1(
                &processor,
                DXGI_COLOR_SPACE_YCBCR_STUDIO_G22_LEFT_P709,
            );
        }
        let slots = (0..NV12_POOL_SIZE)
            .map(|_| create_slot(gpu, &video_device, &enumerator, target))
            .collect::<Result<_, _>>()?;
        Ok(Self {
            video_device,
            video_context,
            enumerator,
            processor,
            slots,
            next: 0,
        })
    }

    pub fn convert(&mut self, bgra: &ID3D11Texture2D) -> Result<ID3D11Texture2D, CaptureError> {
        let input = self.input_view(bgra)?;
        self.next = (self.next + 1) % self.slots.len();
        let slot = &self.slots[self.next];
        let mut stream = D3D11_VIDEO_PROCESSOR_STREAM {
            Enable: true.into(),
            pInputSurface: ManuallyDrop::new(Some(input)),
            ..Default::default()
        };
        let blit = unsafe {
            self.video_context.VideoProcessorBlt(
                &self.processor,
                &slot.view,
                0,
                std::slice::from_ref(&stream),
            )
        };
        unsafe { ManuallyDrop::drop(&mut stream.pInputSurface) };
        blit?;
        Ok(slot.texture.clone())
    }

    fn input_view(
        &self,
        bgra: &ID3D11Texture2D,
    ) -> Result<ID3D11VideoProcessorInputView, CaptureError> {
        let description = D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC {
            FourCC: 0,
            ViewDimension: D3D11_VPIV_DIMENSION_TEXTURE2D,
            Anonymous: D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC_0 {
                Texture2D: D3D11_TEX2D_VPIV {
                    MipSlice: 0,
                    ArraySlice: 0,
                },
            },
        };
        let mut view = None;
        unsafe {
            self.video_device.CreateVideoProcessorInputView(
                bgra,
                &self.enumerator,
                &description,
                Some(&mut view),
            )?
        };
        view.ok_or_else(|| CaptureError::Encoder("Direct3D returned no input view".into()))
    }
}

fn create_slot(
    gpu: &GpuDevice,
    video_device: &ID3D11VideoDevice,
    enumerator: &ID3D11VideoProcessorEnumerator,
    size: FrameSize,
) -> Result<Nv12Slot, CaptureError> {
    let description = D3D11_TEXTURE2D_DESC {
        Width: size.width,
        Height: size.height,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_NV12,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_DEFAULT,
        BindFlags: D3D11_BIND_RENDER_TARGET.0 as u32,
        CPUAccessFlags: 0,
        MiscFlags: 0,
    };
    let mut texture = None;
    unsafe {
        gpu.device
            .CreateTexture2D(&description, None, Some(&mut texture))?
    };
    let texture: ID3D11Texture2D =
        texture.ok_or_else(|| CaptureError::Encoder("Direct3D returned no texture".into()))?;
    let view_description = D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC {
        ViewDimension: D3D11_VPOV_DIMENSION_TEXTURE2D,
        Anonymous: D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC_0 {
            Texture2D: D3D11_TEX2D_VPOV { MipSlice: 0 },
        },
    };
    let mut view = None;
    unsafe {
        video_device.CreateVideoProcessorOutputView(
            &texture,
            enumerator,
            &view_description,
            Some(&mut view),
        )?
    };
    let view =
        view.ok_or_else(|| CaptureError::Encoder("Direct3D returned no output view".into()))?;
    Ok(Nv12Slot { texture, view })
}
