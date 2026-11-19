use super::capture::CapturedFrame;
use super::device::GpuDevice;
use super::media_foundation::{H264Transform, TransformKind};
use super::video_processor::Nv12Converter;
use crate::error::CaptureError;
use crate::frame_size::{FrameSize, target_size};
use crate::pipeline::{EncodedUnit, EncoderFactory, VideoEncoder};
use crate::quality::QualityPreset;
use crate::rate_control::EncoderRate;
use std::thread;
use std::time::Duration;
use windows::Win32::Graphics::Direct3D11::{
    D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE, D3D11_SUBRESOURCE_DATA,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT, ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};

const PROBE_FRAMES: u32 = 10;

pub(crate) struct HardwareVideoEncoder {
    converter: Nv12Converter,
    transform: H264Transform,
}

impl VideoEncoder for HardwareVideoEncoder {
    type Frame = CapturedFrame;

    fn set_rate(&mut self, rate: EncoderRate) -> Result<(), CaptureError> {
        self.transform.set_rate(rate)
    }

    fn encode(
        &mut self,
        frame: &CapturedFrame,
        timestamp: Duration,
        force_keyframe: bool,
    ) -> Result<Vec<EncodedUnit>, CaptureError> {
        let nv12 = self.converter.convert(&frame.texture)?;
        self.transform.encode(&nv12, timestamp, force_keyframe)
    }
}

pub(crate) struct HardwareEncoderFactory {
    pub gpu: GpuDevice,
    pub frames_per_second: u32,
}

impl EncoderFactory for HardwareEncoderFactory {
    type Encoder = HardwareVideoEncoder;

    fn create(
        &mut self,
        source: FrameSize,
        target: FrameSize,
        rate: EncoderRate,
    ) -> Result<HardwareVideoEncoder, CaptureError> {
        Ok(HardwareVideoEncoder {
            converter: Nv12Converter::new(&self.gpu, source, target, self.frames_per_second)?,
            transform: H264Transform::new(&self.gpu, target, rate, TransformKind::Hardware)?,
        })
    }
}

pub(crate) fn probe_hardware_encoder(
    gpu: &GpuDevice,
    source: FrameSize,
    preset: &QualityPreset,
) -> Result<(), CaptureError> {
    let rate = EncoderRate {
        bitrate_bps: preset.max_bitrate_bps,
        frames_per_second: preset.frames_per_second,
    };
    let mut factory = HardwareEncoderFactory {
        gpu: gpu.clone(),
        frames_per_second: preset.frames_per_second,
    };
    let mut encoder = factory.create(source, target_size(source, preset), rate)?;
    let frame = CapturedFrame {
        texture: solid_bgra_texture(gpu, source, [0, 0, 0, 255])?,
        size: source,
    };
    let frame_interval = Duration::from_secs(1) / preset.frames_per_second.max(1);
    for index in 0..PROBE_FRAMES {
        if !encoder
            .encode(&frame, frame_interval * index, index == 0)?
            .is_empty()
        {
            return Ok(());
        }
        thread::sleep(frame_interval);
    }
    Err(CaptureError::Encoder(
        "hardware encoder produced no output".into(),
    ))
}

pub(crate) fn solid_bgra_texture(
    gpu: &GpuDevice,
    size: FrameSize,
    bgra: [u8; 4],
) -> Result<ID3D11Texture2D, CaptureError> {
    let pixels: Vec<u8> = bgra
        .iter()
        .copied()
        .cycle()
        .take(size.width as usize * size.height as usize * 4)
        .collect();
    let description = D3D11_TEXTURE2D_DESC {
        Width: size.width,
        Height: size.height,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_DEFAULT,
        BindFlags: (D3D11_BIND_RENDER_TARGET.0 | D3D11_BIND_SHADER_RESOURCE.0) as u32,
        CPUAccessFlags: 0,
        MiscFlags: 0,
    };
    let initial = D3D11_SUBRESOURCE_DATA {
        pSysMem: pixels.as_ptr().cast(),
        SysMemPitch: size.width * 4,
        SysMemSlicePitch: 0,
    };
    let mut texture = None;
    unsafe {
        gpu.device
            .CreateTexture2D(&description, Some(&initial), Some(&mut texture))?
    };
    texture.ok_or_else(|| CaptureError::Encoder("Direct3D returned no texture".into()))
}
