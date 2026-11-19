use super::capture::CapturedFrame;
use super::device::GpuDevice;
use crate::error::CaptureError;
use crate::frame_size::{FrameSize, target_size};
use crate::pipeline::VideoSink;
use crate::quality::QualityPreset;
use livekit::webrtc::native::yuv_helper::argb_to_i420;
use livekit::webrtc::video_frame::{I420Buffer, VideoFrame, VideoRotation};
use livekit::webrtc::video_source::native::NativeVideoSource;
use std::time::Duration;
use windows::Win32::Graphics::Direct3D11::{
    D3D11_CPU_ACCESS_READ, D3D11_MAP_READ, D3D11_MAPPED_SUBRESOURCE, D3D11_TEXTURE2D_DESC,
    D3D11_USAGE_STAGING, ID3D11DeviceContext, ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};

pub(crate) struct SoftwareVideoSink {
    gpu: GpuDevice,
    source: NativeVideoSource,
    preset: QualityPreset,
    staging: Option<(FrameSize, ID3D11Texture2D)>,
}

impl SoftwareVideoSink {
    pub fn new(gpu: GpuDevice, source: NativeVideoSource, preset: QualityPreset) -> Self {
        Self {
            gpu,
            source,
            preset,
            staging: None,
        }
    }

    fn staging_texture(&mut self, size: FrameSize) -> Result<ID3D11Texture2D, CaptureError> {
        if let Some((staged_size, texture)) = &self.staging
            && *staged_size == size
        {
            return Ok(texture.clone());
        }
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
            Usage: D3D11_USAGE_STAGING,
            BindFlags: 0,
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
            MiscFlags: 0,
        };
        let mut texture = None;
        unsafe {
            self.gpu
                .device
                .CreateTexture2D(&description, None, Some(&mut texture))?
        };
        let texture = texture
            .ok_or_else(|| CaptureError::Encoder("Direct3D returned no staging texture".into()))?;
        self.staging = Some((size, texture.clone()));
        Ok(texture)
    }
}

impl VideoSink<CapturedFrame> for SoftwareVideoSink {
    fn send(&mut self, frame: &CapturedFrame, timestamp: Duration) -> Result<(), CaptureError> {
        let staging = self.staging_texture(frame.size)?;
        unsafe { self.gpu.context.CopyResource(&staging, &frame.texture) };
        let mut i420 = I420Buffer::new(frame.size.width, frame.size.height);
        {
            let mapping = MappedTexture::map(&self.gpu.context, &staging)?;
            let (stride_y, stride_u, stride_v) = i420.strides();
            let (y, u, v) = i420.data_mut();
            argb_to_i420(
                mapping.bytes(frame.size.height),
                mapping.row_pitch(),
                y,
                stride_y,
                u,
                stride_u,
                v,
                stride_v,
                frame.size.width as i32,
                frame.size.height as i32,
            );
        }
        let target = target_size(frame.size, &self.preset);
        let buffer = if target == frame.size {
            i420
        } else {
            i420.scale(target.width as i32, target.height as i32)
        };
        self.source.capture_frame(&VideoFrame {
            rotation: VideoRotation::VideoRotation0,
            timestamp_us: i64::try_from(timestamp.as_micros()).unwrap_or(i64::MAX),
            frame_metadata: None,
            buffer,
        });
        Ok(())
    }
}

struct MappedTexture<'a> {
    context: &'a ID3D11DeviceContext,
    texture: &'a ID3D11Texture2D,
    mapped: D3D11_MAPPED_SUBRESOURCE,
}

impl<'a> MappedTexture<'a> {
    fn map(
        context: &'a ID3D11DeviceContext,
        texture: &'a ID3D11Texture2D,
    ) -> Result<Self, CaptureError> {
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        unsafe { context.Map(texture, 0, D3D11_MAP_READ, 0, Some(&mut mapped))? };
        Ok(Self {
            context,
            texture,
            mapped,
        })
    }

    fn row_pitch(&self) -> u32 {
        self.mapped.RowPitch
    }

    fn bytes(&self, height: u32) -> &[u8] {
        let length = self.mapped.RowPitch as usize * height as usize;
        unsafe { std::slice::from_raw_parts(self.mapped.pData.cast::<u8>(), length) }
    }
}

impl Drop for MappedTexture<'_> {
    fn drop(&mut self) {
        unsafe { self.context.Unmap(self.texture, 0) };
    }
}
