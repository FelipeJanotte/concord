use super::device::GpuDevice;
use crate::annex_b::{ParameterSets, is_keyframe};
use crate::error::CaptureError;
use crate::frame_size::FrameSize;
use crate::pipeline::EncodedUnit;
use crate::rate_control::EncoderRate;
use std::mem::ManuallyDrop;
use std::thread;
use std::time::{Duration, Instant};
use windows::Win32::Graphics::Direct3D11::ID3D11Texture2D;
use windows::Win32::Media::MediaFoundation::{
    CODECAPI_AVEncCommonMeanBitRate, CODECAPI_AVEncCommonRateControlMode,
    CODECAPI_AVEncMPVDefaultBPictureCount, CODECAPI_AVEncMPVGOPSize,
    CODECAPI_AVEncVideoForceKeyFrame, CODECAPI_AVLowLatencyMode, ICodecAPI, IMF2DBuffer,
    IMFActivate, IMFAttributes, IMFDXGIDeviceManager, IMFMediaEventGenerator, IMFMediaType,
    IMFSample, IMFTransform, METransformHaveOutput, METransformNeedInput, MF_E_NO_EVENTS_AVAILABLE,
    MF_E_TRANSFORM_NEED_MORE_INPUT, MF_E_TRANSFORM_STREAM_CHANGE, MF_EVENT_FLAG_NO_WAIT,
    MF_LOW_LATENCY, MF_MT_AVG_BITRATE, MF_MT_FRAME_RATE, MF_MT_FRAME_SIZE, MF_MT_INTERLACE_MODE,
    MF_MT_MAJOR_TYPE, MF_MT_MPEG_SEQUENCE_HEADER, MF_MT_MPEG2_PROFILE, MF_MT_PIXEL_ASPECT_RATIO,
    MF_MT_SUBTYPE, MF_MT_TRANSFER_FUNCTION, MF_MT_VIDEO_NOMINAL_RANGE, MF_MT_VIDEO_PRIMARIES,
    MF_MT_YUV_MATRIX, MF_SA_D3D11_AWARE, MF_TRANSFORM_ASYNC, MF_TRANSFORM_ASYNC_UNLOCK, MF_VERSION,
    MFCreateAttributes, MFCreateDXGIDeviceManager, MFCreateDXGISurfaceBuffer, MFCreateMediaType,
    MFCreateMemoryBuffer, MFCreateSample, MFMediaType_Video, MFNominalRange_16_235,
    MFSTARTUP_NOSOCKET, MFShutdown, MFStartup, MFT_CATEGORY_VIDEO_ENCODER, MFT_ENUM_ADAPTER_LUID,
    MFT_ENUM_FLAG, MFT_ENUM_FLAG_HARDWARE, MFT_ENUM_FLAG_SORTANDFILTER, MFT_ENUM_FLAG_SYNCMFT,
    MFT_MESSAGE_COMMAND_FLUSH, MFT_MESSAGE_NOTIFY_BEGIN_STREAMING,
    MFT_MESSAGE_NOTIFY_START_OF_STREAM, MFT_MESSAGE_SET_D3D_MANAGER, MFT_OUTPUT_DATA_BUFFER,
    MFT_OUTPUT_STREAM_CAN_PROVIDE_SAMPLES, MFT_OUTPUT_STREAM_PROVIDES_SAMPLES,
    MFT_REGISTER_TYPE_INFO, MFTEnum2, MFVideoFormat_H264, MFVideoFormat_NV12,
    MFVideoInterlace_Progressive, MFVideoPrimaries_BT709, MFVideoTransFunc_709,
    MFVideoTransferMatrix_BT709, eAVEncCommonRateControlMode_CBR, eAVEncH264VProfile_Base,
};
use windows::Win32::System::Com::CoTaskMemFree;
use windows::Win32::System::Variant::VARIANT;
use windows::core::{GUID, Interface};

const EVENT_TIMEOUT: Duration = Duration::from_secs(2);
const EVENT_POLL: Duration = Duration::from_millis(1);
const HUNDRED_NANOSECONDS_PER_SECOND: u64 = 10_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum TransformKind {
    Hardware,
    #[cfg_attr(not(test), allow(dead_code))]
    Software,
}

pub(crate) struct MediaFoundationRuntime;

impl MediaFoundationRuntime {
    pub fn start() -> Result<Self, CaptureError> {
        unsafe { MFStartup(MF_VERSION, MFSTARTUP_NOSOCKET)? };
        Ok(Self)
    }
}

impl Drop for MediaFoundationRuntime {
    fn drop(&mut self) {
        unsafe { MFShutdown() }.ok();
    }
}

struct ActivateList {
    pointer: *mut Option<IMFActivate>,
    count: u32,
}

impl ActivateList {
    fn first(&self) -> Option<&IMFActivate> {
        if self.pointer.is_null() || self.count == 0 {
            return None;
        }
        unsafe { (*self.pointer).as_ref() }
    }
}

impl Drop for ActivateList {
    fn drop(&mut self) {
        if self.pointer.is_null() {
            return;
        }
        for index in 0..self.count as usize {
            unsafe { std::ptr::drop_in_place(self.pointer.add(index)) };
        }
        unsafe { CoTaskMemFree(Some(self.pointer.cast())) };
    }
}

pub(crate) fn pack_pair(high: u32, low: u32) -> u64 {
    (u64::from(high) << 32) | u64::from(low)
}

pub(crate) struct H264Transform {
    transform: IMFTransform,
    codec_api: ICodecAPI,
    events: Option<IMFMediaEventGenerator>,
    input_credits: u32,
    allocates_output: bool,
    output_buffer_size: u32,
    frame_duration: i64,
    parameter_sets: ParameterSets,
    _device_manager: IMFDXGIDeviceManager,
    _runtime: MediaFoundationRuntime,
}

impl H264Transform {
    pub fn new(
        gpu: &GpuDevice,
        size: FrameSize,
        rate: EncoderRate,
        kind: TransformKind,
    ) -> Result<Self, CaptureError> {
        let runtime = MediaFoundationRuntime::start()?;
        let transform = activate_encoder(gpu, kind)?;
        let attributes = unsafe { transform.GetAttributes()? };
        let is_async = attribute_flag(&attributes, &MF_TRANSFORM_ASYNC);
        if is_async {
            unsafe { attributes.SetUINT32(&MF_TRANSFORM_ASYNC_UNLOCK, 1)? };
        }
        let device_manager = device_manager(gpu)?;
        if attribute_flag(&attributes, &MF_SA_D3D11_AWARE) {
            unsafe {
                transform.ProcessMessage(
                    MFT_MESSAGE_SET_D3D_MANAGER,
                    device_manager.as_raw() as usize,
                )?
            };
        }
        unsafe { attributes.SetUINT32(&MF_LOW_LATENCY, 1)? };
        let codec_api: ICodecAPI = transform.cast()?;
        configure_codec(&codec_api, rate)?;
        unsafe {
            transform.SetOutputType(0, &output_type(size, rate)?, 0)?;
            transform.SetInputType(0, &input_type(size, rate)?, 0)?;
        }
        let stream_info = unsafe { transform.GetOutputStreamInfo(0)? };
        let provided =
            (MFT_OUTPUT_STREAM_PROVIDES_SAMPLES.0 | MFT_OUTPUT_STREAM_CAN_PROVIDE_SAMPLES.0) as u32;
        let mut parameter_sets = ParameterSets::default();
        if let Ok(header) = sequence_header(&transform) {
            parameter_sets.remember(&header);
        }
        unsafe {
            transform.ProcessMessage(MFT_MESSAGE_COMMAND_FLUSH, 0)?;
            transform.ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0)?;
            transform.ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0)?;
        }
        let events = if is_async {
            Some(transform.cast::<IMFMediaEventGenerator>()?)
        } else {
            None
        };
        Ok(Self {
            transform,
            codec_api,
            events,
            input_credits: 0,
            allocates_output: stream_info.dwFlags & provided == 0,
            output_buffer_size: stream_info.cbSize.max(1024 * 1024),
            frame_duration: frame_duration(rate),
            parameter_sets,
            _device_manager: device_manager,
            _runtime: runtime,
        })
    }

    pub fn set_rate(&mut self, rate: EncoderRate) -> Result<(), CaptureError> {
        unsafe {
            self.codec_api.SetValue(
                &CODECAPI_AVEncCommonMeanBitRate,
                &VARIANT::from(rate.bitrate_bps),
            )?
        };
        self.frame_duration = frame_duration(rate);
        Ok(())
    }

    pub fn encode(
        &mut self,
        nv12: &ID3D11Texture2D,
        timestamp: Duration,
        force_keyframe: bool,
    ) -> Result<Vec<EncodedUnit>, CaptureError> {
        if force_keyframe {
            unsafe {
                self.codec_api
                    .SetValue(&CODECAPI_AVEncVideoForceKeyFrame, &VARIANT::from(1u32))?
            };
        }
        let sample = self.input_sample(nv12, timestamp)?;
        let mut units = Vec::new();
        if self.events.is_some() {
            self.wait_for_input_credit(&mut units)?;
            unsafe { self.transform.ProcessInput(0, &sample, 0)? };
            self.input_credits -= 1;
            self.collect_async_events(&mut units, None)?;
        } else {
            unsafe { self.transform.ProcessInput(0, &sample, 0)? };
            while let Some(unit) = self.next_output()? {
                units.push(unit);
            }
        }
        Ok(units)
    }

    #[cfg(test)]
    pub fn drain(&mut self) -> Result<Vec<EncodedUnit>, CaptureError> {
        use windows::Win32::Media::MediaFoundation::{
            METransformDrainComplete, MFT_MESSAGE_COMMAND_DRAIN,
        };
        unsafe {
            self.transform
                .ProcessMessage(MFT_MESSAGE_COMMAND_DRAIN, 0)?
        };
        let mut units = Vec::new();
        if self.events.is_some() {
            let deadline = Instant::now() + EVENT_TIMEOUT;
            while !self.collect_async_events(&mut units, Some(METransformDrainComplete.0 as u32))? {
                if Instant::now() > deadline {
                    return Err(CaptureError::Encoder(
                        "encoder did not finish draining".into(),
                    ));
                }
                thread::sleep(EVENT_POLL);
            }
        } else {
            while let Some(unit) = self.next_output()? {
                units.push(unit);
            }
        }
        Ok(units)
    }

    fn input_sample(
        &self,
        nv12: &ID3D11Texture2D,
        timestamp: Duration,
    ) -> Result<IMFSample, CaptureError> {
        let buffer = unsafe { MFCreateDXGISurfaceBuffer(&ID3D11Texture2D::IID, nv12, 0, false)? };
        let length = unsafe { buffer.cast::<IMF2DBuffer>()?.GetContiguousLength()? };
        unsafe { buffer.SetCurrentLength(length)? };
        let sample = unsafe { MFCreateSample()? };
        unsafe {
            sample.AddBuffer(&buffer)?;
            sample.SetSampleTime(to_hundred_nanoseconds(timestamp))?;
            sample.SetSampleDuration(self.frame_duration)?;
        }
        Ok(sample)
    }

    fn wait_for_input_credit(&mut self, units: &mut Vec<EncodedUnit>) -> Result<(), CaptureError> {
        let deadline = Instant::now() + EVENT_TIMEOUT;
        loop {
            self.collect_async_events(units, None)?;
            if self.input_credits > 0 {
                return Ok(());
            }
            if Instant::now() > deadline {
                return Err(CaptureError::Encoder(
                    "hardware encoder stopped asking for input".into(),
                ));
            }
            thread::sleep(EVENT_POLL);
        }
    }

    fn collect_async_events(
        &mut self,
        units: &mut Vec<EncodedUnit>,
        until: Option<u32>,
    ) -> Result<bool, CaptureError> {
        let Some(events) = self.events.clone() else {
            return Ok(false);
        };
        loop {
            let event = match unsafe { events.GetEvent(MF_EVENT_FLAG_NO_WAIT) } {
                Ok(event) => event,
                Err(error) if error.code() == MF_E_NO_EVENTS_AVAILABLE => return Ok(false),
                Err(error) => return Err(error.into()),
            };
            let event_type = unsafe { event.GetType()? };
            if event_type == METransformNeedInput.0 as u32 {
                self.input_credits += 1;
            } else if event_type == METransformHaveOutput.0 as u32 {
                if let Some(unit) = self.next_output()? {
                    units.push(unit);
                }
            } else if Some(event_type) == until {
                return Ok(true);
            }
        }
    }

    fn next_output(&mut self) -> Result<Option<EncodedUnit>, CaptureError> {
        loop {
            let provided_sample = if self.allocates_output {
                Some(self.output_sample()?)
            } else {
                None
            };
            let mut output = MFT_OUTPUT_DATA_BUFFER {
                dwStreamID: 0,
                pSample: ManuallyDrop::new(provided_sample),
                dwStatus: 0,
                pEvents: ManuallyDrop::new(None),
            };
            let mut status = 0;
            let result = unsafe {
                self.transform
                    .ProcessOutput(0, std::slice::from_mut(&mut output), &mut status)
            };
            let sample = ManuallyDrop::into_inner(output.pSample);
            drop(ManuallyDrop::into_inner(output.pEvents));
            match result {
                Ok(()) => {
                    let Some(sample) = sample else {
                        return Err(CaptureError::Encoder("encoder returned no sample".into()));
                    };
                    return self.encoded_unit(&sample).map(Some);
                }
                Err(error) if error.code() == MF_E_TRANSFORM_NEED_MORE_INPUT => return Ok(None),
                Err(error) if error.code() == MF_E_TRANSFORM_STREAM_CHANGE => {
                    self.renegotiate_output()?
                }
                Err(error) => return Err(error.into()),
            }
        }
    }

    fn renegotiate_output(&mut self) -> Result<(), CaptureError> {
        let available = unsafe { self.transform.GetOutputAvailableType(0, 0)? };
        unsafe { self.transform.SetOutputType(0, &available, 0)? };
        if let Ok(header) = sequence_header(&self.transform) {
            self.parameter_sets.remember(&header);
        }
        Ok(())
    }

    fn output_sample(&self) -> Result<IMFSample, CaptureError> {
        let sample = unsafe { MFCreateSample()? };
        let buffer = unsafe { MFCreateMemoryBuffer(self.output_buffer_size)? };
        unsafe { sample.AddBuffer(&buffer)? };
        Ok(sample)
    }

    fn encoded_unit(&mut self, sample: &IMFSample) -> Result<EncodedUnit, CaptureError> {
        let data = self.parameter_sets.complete(sample_bytes(sample)?);
        let timestamp = unsafe { sample.GetSampleTime()? };
        Ok(EncodedUnit {
            keyframe: is_keyframe(&data),
            data,
            timestamp: Duration::from_nanos(u64::try_from(timestamp).unwrap_or_default() * 100),
        })
    }
}

fn sample_bytes(sample: &IMFSample) -> Result<Vec<u8>, CaptureError> {
    let buffer = unsafe { sample.ConvertToContiguousBuffer()? };
    let mut pointer = std::ptr::null_mut();
    let mut length = 0;
    unsafe { buffer.Lock(&mut pointer, None, Some(&mut length))? };
    let bytes = unsafe { std::slice::from_raw_parts(pointer, length as usize) }.to_vec();
    unsafe { buffer.Unlock()? };
    Ok(bytes)
}

fn attribute_flag(attributes: &IMFAttributes, key: &GUID) -> bool {
    unsafe { attributes.GetUINT32(key) }.is_ok_and(|value| value != 0)
}

fn activate_encoder(gpu: &GpuDevice, kind: TransformKind) -> Result<IMFTransform, CaptureError> {
    let input = MFT_REGISTER_TYPE_INFO {
        guidMajorType: MFMediaType_Video,
        guidSubtype: MFVideoFormat_NV12,
    };
    let output = MFT_REGISTER_TYPE_INFO {
        guidMajorType: MFMediaType_Video,
        guidSubtype: MFVideoFormat_H264,
    };
    let (flags, adapter_filter) = match kind {
        TransformKind::Hardware => {
            let mut attributes = None;
            unsafe { MFCreateAttributes(&mut attributes, 1)? };
            let attributes =
                attributes.ok_or_else(|| CaptureError::Encoder("no attribute store".into()))?;
            let luid =
                pack_pair(gpu.adapter_luid.HighPart as u32, gpu.adapter_luid.LowPart).to_le_bytes();
            unsafe { attributes.SetBlob(&MFT_ENUM_ADAPTER_LUID, &luid)? };
            (
                MFT_ENUM_FLAG_HARDWARE | MFT_ENUM_FLAG_SORTANDFILTER,
                Some(attributes),
            )
        }
        TransformKind::Software => (MFT_ENUM_FLAG_SYNCMFT | MFT_ENUM_FLAG_SORTANDFILTER, None),
    };
    let list = enumerate_transforms(flags, &input, &output, adapter_filter.as_ref())?;
    let activate = list.first().ok_or_else(|| {
        CaptureError::Encoder(format!("no {kind:?} H.264 encoder on this adapter"))
    })?;
    Ok(unsafe { activate.ActivateObject::<IMFTransform>()? })
}

fn enumerate_transforms(
    flags: MFT_ENUM_FLAG,
    input: &MFT_REGISTER_TYPE_INFO,
    output: &MFT_REGISTER_TYPE_INFO,
    attributes: Option<&IMFAttributes>,
) -> Result<ActivateList, CaptureError> {
    let mut list = ActivateList {
        pointer: std::ptr::null_mut(),
        count: 0,
    };
    unsafe {
        MFTEnum2(
            MFT_CATEGORY_VIDEO_ENCODER,
            flags,
            Some(input),
            Some(output),
            attributes,
            &mut list.pointer,
            &mut list.count,
        )?
    };
    Ok(list)
}

fn device_manager(gpu: &GpuDevice) -> Result<IMFDXGIDeviceManager, CaptureError> {
    let mut token = 0;
    let mut manager = None;
    unsafe { MFCreateDXGIDeviceManager(&mut token, &mut manager)? };
    let manager = manager.ok_or_else(|| CaptureError::Encoder("no DXGI device manager".into()))?;
    unsafe { manager.ResetDevice(&gpu.device, token)? };
    Ok(manager)
}

fn configure_codec(codec_api: &ICodecAPI, rate: EncoderRate) -> Result<(), CaptureError> {
    let settings = [
        (
            CODECAPI_AVEncCommonRateControlMode,
            VARIANT::from(eAVEncCommonRateControlMode_CBR.0 as u32),
        ),
        (
            CODECAPI_AVEncCommonMeanBitRate,
            VARIANT::from(rate.bitrate_bps),
        ),
        (CODECAPI_AVLowLatencyMode, VARIANT::from(true)),
        (CODECAPI_AVEncMPVDefaultBPictureCount, VARIANT::from(0u32)),
        (CODECAPI_AVEncMPVGOPSize, VARIANT::from(u32::MAX)),
    ];
    for (api, value) in &settings {
        if unsafe { codec_api.IsSupported(api) }.is_ok() {
            unsafe { codec_api.SetValue(api, value)? };
        }
    }
    Ok(())
}

fn video_type(
    subtype: &GUID,
    size: FrameSize,
    rate: EncoderRate,
) -> Result<IMFMediaType, CaptureError> {
    let media_type = unsafe { MFCreateMediaType()? };
    unsafe {
        media_type.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
        media_type.SetGUID(&MF_MT_SUBTYPE, subtype)?;
        media_type.SetUINT64(&MF_MT_FRAME_SIZE, pack_pair(size.width, size.height))?;
        media_type.SetUINT64(&MF_MT_FRAME_RATE, pack_pair(rate.frames_per_second, 1))?;
        media_type.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, pack_pair(1, 1))?;
        media_type.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)?;
        media_type.SetUINT32(&MF_MT_YUV_MATRIX, MFVideoTransferMatrix_BT709.0 as u32)?;
        media_type.SetUINT32(&MF_MT_VIDEO_NOMINAL_RANGE, MFNominalRange_16_235.0 as u32)?;
        media_type.SetUINT32(&MF_MT_VIDEO_PRIMARIES, MFVideoPrimaries_BT709.0 as u32)?;
        media_type.SetUINT32(&MF_MT_TRANSFER_FUNCTION, MFVideoTransFunc_709.0 as u32)?;
    }
    Ok(media_type)
}

fn output_type(size: FrameSize, rate: EncoderRate) -> Result<IMFMediaType, CaptureError> {
    let media_type = video_type(&MFVideoFormat_H264, size, rate)?;
    unsafe {
        media_type.SetUINT32(&MF_MT_AVG_BITRATE, rate.bitrate_bps)?;
        media_type.SetUINT32(&MF_MT_MPEG2_PROFILE, eAVEncH264VProfile_Base.0 as u32)?;
    }
    Ok(media_type)
}

fn input_type(size: FrameSize, rate: EncoderRate) -> Result<IMFMediaType, CaptureError> {
    video_type(&MFVideoFormat_NV12, size, rate)
}

fn sequence_header(transform: &IMFTransform) -> Result<Vec<u8>, CaptureError> {
    let current = unsafe { transform.GetOutputCurrentType(0)? };
    let length = unsafe { current.GetBlobSize(&MF_MT_MPEG_SEQUENCE_HEADER)? };
    let mut header = vec![0; length as usize];
    unsafe { current.GetBlob(&MF_MT_MPEG_SEQUENCE_HEADER, &mut header, None)? };
    Ok(header)
}

fn frame_duration(rate: EncoderRate) -> i64 {
    (HUNDRED_NANOSECONDS_PER_SECOND / u64::from(rate.frames_per_second.max(1))) as i64
}

fn to_hundred_nanoseconds(timestamp: Duration) -> i64 {
    i64::try_from(timestamp.as_nanos() / 100).unwrap_or(i64::MAX)
}
