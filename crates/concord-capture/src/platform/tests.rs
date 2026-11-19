use super::com::ComApartment;
use super::device::GpuDevice;
use super::hardware_encoder::solid_bgra_texture;
use super::media_foundation::{H264Transform, TransformKind, pack_pair};
use super::video_processor::Nv12Converter;
use crate::annex_b::{NAL_TYPE_IDR, NAL_TYPE_PPS, NAL_TYPE_SPS, is_keyframe, nal_unit_types};
use crate::error::CaptureError;
use crate::frame_size::FrameSize;
use crate::pipeline::EncodedUnit;
use crate::rate_control::EncoderRate;
use std::mem::ManuallyDrop;
use std::time::Duration;
use windows::Win32::Graphics::Direct3D11::{
    D3D11_CPU_ACCESS_READ, D3D11_MAP_READ, D3D11_MAPPED_SUBRESOURCE, D3D11_TEXTURE2D_DESC,
    D3D11_USAGE_STAGING, ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT_NV12;
use windows::Win32::Media::MediaFoundation::{
    CLSID_MSH264DecoderMFT, IMFSample, IMFTransform, MF_E_TRANSFORM_NEED_MORE_INPUT,
    MF_E_TRANSFORM_STREAM_CHANGE, MF_MT_FRAME_SIZE, MF_MT_MAJOR_TYPE, MF_MT_SUBTYPE,
    MFCreateMediaType, MFCreateMemoryBuffer, MFCreateSample, MFMediaType_Video,
    MFT_MESSAGE_COMMAND_DRAIN, MFT_OUTPUT_DATA_BUFFER, MFVideoFormat_H264, MFVideoFormat_NV12,
};
use windows::Win32::System::Com::{CLSCTX_INPROC_SERVER, CoCreateInstance};

type TestResult = Result<(), Box<dyn std::error::Error>>;

const RED: [u8; 4] = [0, 0, 255, 255];
const WHITE: [u8; 4] = [255, 255, 255, 255];

fn size(width: u32, height: u32) -> FrameSize {
    FrameSize { width, height }
}

struct Nv12Planes {
    luma: Vec<u8>,
    chroma: Vec<u8>,
    description: D3D11_TEXTURE2D_DESC,
}

fn read_nv12(gpu: &GpuDevice, texture: &ID3D11Texture2D) -> Result<Nv12Planes, CaptureError> {
    let mut description = D3D11_TEXTURE2D_DESC::default();
    unsafe { texture.GetDesc(&mut description) };
    let staging_description = D3D11_TEXTURE2D_DESC {
        Usage: D3D11_USAGE_STAGING,
        BindFlags: 0,
        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
        ..description
    };
    let mut staging = None;
    unsafe {
        gpu.device
            .CreateTexture2D(&staging_description, None, Some(&mut staging))?
    };
    let staging = staging.ok_or_else(|| CaptureError::Capture("no staging texture".into()))?;
    unsafe { gpu.context.CopyResource(&staging, texture) };
    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
    unsafe {
        gpu.context
            .Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?
    };
    let pitch = mapped.RowPitch as usize;
    let width = description.Width as usize;
    let height = description.Height as usize;
    let all =
        unsafe { std::slice::from_raw_parts(mapped.pData.cast::<u8>(), pitch * height * 3 / 2) };
    let luma = (0..height)
        .flat_map(|row| all[row * pitch..row * pitch + width].iter().copied())
        .collect();
    let chroma = (0..height / 2)
        .flat_map(|row| {
            let start = (height + row) * pitch;
            all[start..start + width].iter().copied()
        })
        .collect();
    unsafe { gpu.context.Unmap(&staging, 0) };
    Ok(Nv12Planes {
        luma,
        chroma,
        description,
    })
}

fn assert_near(values: &[u8], expected: u8, label: &str) {
    for value in values {
        assert!(
            value.abs_diff(expected) <= 2,
            "{label}: {value} is not close to {expected}"
        );
    }
}

fn convert_solid(
    color: [u8; 4],
    source: FrameSize,
    target: FrameSize,
) -> Result<Nv12Planes, CaptureError> {
    let gpu = GpuDevice::warp()?;
    let bgra = solid_bgra_texture(&gpu, source, color)?;
    let mut converter = Nv12Converter::new(&gpu, source, target, 30)?;
    let nv12 = converter.convert(&bgra)?;
    read_nv12(&gpu, &nv12)
}

#[test]
fn red_bgra_becomes_bt709_studio_range_nv12_at_the_target_size() -> TestResult {
    let planes = convert_solid(RED, size(128, 64), size(64, 32))?;
    assert_eq!(planes.description.Format, DXGI_FORMAT_NV12);
    assert_eq!(
        (planes.description.Width, planes.description.Height),
        (64, 32)
    );
    assert_near(&planes.luma, 63, "luma");
    let blue_difference: Vec<u8> = planes.chroma.iter().step_by(2).copied().collect();
    let red_difference: Vec<u8> = planes.chroma.iter().skip(1).step_by(2).copied().collect();
    assert_near(&blue_difference, 102, "Cb");
    assert_near(&red_difference, 240, "Cr");
    Ok(())
}

#[test]
fn white_bgra_becomes_peak_luma_with_neutral_chroma() -> TestResult {
    let planes = convert_solid(WHITE, size(64, 64), size(64, 64))?;
    assert_near(&planes.luma, 235, "luma");
    assert_near(&planes.chroma, 128, "chroma");
    Ok(())
}

const ENCODED_FRAMES: u32 = 30;
const FORCED_KEYFRAME: usize = 15;

fn encode_synthetic_frames(
    gpu: &GpuDevice,
    frame_size: FrameSize,
) -> Result<Vec<EncodedUnit>, CaptureError> {
    let rate = EncoderRate {
        bitrate_bps: 2_000_000,
        frames_per_second: 30,
    };
    let mut transform = H264Transform::new(gpu, frame_size, rate, TransformKind::Software)?;
    let mut converter = Nv12Converter::new(gpu, frame_size, frame_size, 30)?;
    let mut units = Vec::new();
    for index in 0..ENCODED_FRAMES {
        let shade = (index * 8) as u8;
        let bgra = solid_bgra_texture(gpu, frame_size, [shade, 255 - shade, shade / 2, 255])?;
        let nv12 = converter.convert(&bgra)?;
        let force_keyframe = index == 0 || index as usize == FORCED_KEYFRAME;
        units.extend(transform.encode(
            &nv12,
            Duration::from_millis(u64::from(index) * 33),
            force_keyframe,
        )?);
    }
    units.extend(transform.drain()?);
    Ok(units)
}

#[test]
fn software_encoder_round_trips_thirty_frames_with_a_forced_idr() -> TestResult {
    let _apartment = ComApartment::enter()?;
    let gpu = GpuDevice::warp()?;
    let frame_size = size(320, 240);
    let units = encode_synthetic_frames(&gpu, frame_size)?;
    assert_eq!(units.len(), ENCODED_FRAMES as usize);
    for index in [0, FORCED_KEYFRAME] {
        let types = nal_unit_types(&units[index].data);
        assert_eq!(
            types.first(),
            Some(&NAL_TYPE_SPS),
            "frame {index} starts with {types:?}"
        );
        assert_eq!(
            types.get(1),
            Some(&NAL_TYPE_PPS),
            "frame {index} has {types:?}"
        );
        assert!(types.contains(&NAL_TYPE_IDR), "frame {index} has {types:?}");
        assert!(units[index].keyframe);
    }
    assert!(!is_keyframe(&units[FORCED_KEYFRAME - 1].data));
    let decoded = decode(&units, frame_size)?;
    assert_eq!(decoded.frames, ENCODED_FRAMES);
    assert_eq!(decoded.size, frame_size);
    Ok(())
}

struct Decoded {
    frames: u32,
    size: FrameSize,
}

fn decode(units: &[EncodedUnit], frame_size: FrameSize) -> Result<Decoded, CaptureError> {
    let decoder: IMFTransform =
        unsafe { CoCreateInstance(&CLSID_MSH264DecoderMFT, None, CLSCTX_INPROC_SERVER)? };
    let input = unsafe { MFCreateMediaType()? };
    unsafe {
        input.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
        input.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_H264)?;
        input.SetUINT64(
            &MF_MT_FRAME_SIZE,
            pack_pair(frame_size.width, frame_size.height),
        )?;
        decoder.SetInputType(0, &input, 0)?;
    }
    select_nv12_output(&decoder)?;
    let mut decoded = Decoded {
        frames: 0,
        size: size(0, 0),
    };
    for unit in units {
        let sample = memory_sample(&unit.data)?;
        unsafe { decoder.ProcessInput(0, &sample, 0)? };
        drain_decoder(&decoder, &mut decoded)?;
    }
    unsafe { decoder.ProcessMessage(MFT_MESSAGE_COMMAND_DRAIN, 0)? };
    drain_decoder(&decoder, &mut decoded)?;
    Ok(decoded)
}

fn select_nv12_output(decoder: &IMFTransform) -> Result<(), CaptureError> {
    for index in 0.. {
        let candidate = unsafe { decoder.GetOutputAvailableType(0, index)? };
        if unsafe { candidate.GetGUID(&MF_MT_SUBTYPE)? } == MFVideoFormat_NV12 {
            unsafe { decoder.SetOutputType(0, &candidate, 0)? };
            return Ok(());
        }
    }
    Err(CaptureError::Encoder(
        "decoder offers no NV12 output".into(),
    ))
}

fn memory_sample(bytes: &[u8]) -> Result<IMFSample, CaptureError> {
    let buffer = unsafe { MFCreateMemoryBuffer(bytes.len() as u32)? };
    let mut pointer = std::ptr::null_mut();
    unsafe {
        buffer.Lock(&mut pointer, None, None)?;
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), pointer, bytes.len());
        buffer.Unlock()?;
        buffer.SetCurrentLength(bytes.len() as u32)?;
    }
    let sample = unsafe { MFCreateSample()? };
    unsafe { sample.AddBuffer(&buffer)? };
    Ok(sample)
}

fn drain_decoder(decoder: &IMFTransform, decoded: &mut Decoded) -> Result<(), CaptureError> {
    loop {
        let info = unsafe { decoder.GetOutputStreamInfo(0)? };
        let sample = unsafe { MFCreateSample()? };
        unsafe { sample.AddBuffer(&MFCreateMemoryBuffer(info.cbSize.max(1))?)? };
        let mut output = MFT_OUTPUT_DATA_BUFFER {
            dwStreamID: 0,
            pSample: ManuallyDrop::new(Some(sample)),
            dwStatus: 0,
            pEvents: ManuallyDrop::new(None),
        };
        let mut status = 0;
        let result =
            unsafe { decoder.ProcessOutput(0, std::slice::from_mut(&mut output), &mut status) };
        drop(ManuallyDrop::into_inner(output.pSample));
        drop(ManuallyDrop::into_inner(output.pEvents));
        match result {
            Ok(()) => {
                decoded.frames += 1;
                let current = unsafe { decoder.GetOutputCurrentType(0)? };
                let packed = unsafe { current.GetUINT64(&MF_MT_FRAME_SIZE)? };
                decoded.size = size((packed >> 32) as u32, packed as u32);
            }
            Err(error) if error.code() == MF_E_TRANSFORM_NEED_MORE_INPUT => return Ok(()),
            Err(error) if error.code() == MF_E_TRANSFORM_STREAM_CHANGE => {
                select_nv12_output(decoder)?
            }
            Err(error) => return Err(error.into()),
        }
    }
}
