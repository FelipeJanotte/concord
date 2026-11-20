use super::com::ComApartment;
use crate::audio_frames::{CHANNELS, SAMPLE_RATE};
use crate::error::CaptureError;
use crate::loopback_scope::LoopbackScope;
use crate::pipeline::AudioSource;
use std::collections::VecDeque;
use std::time::Duration;
use wasapi::{
    AudioCaptureClient, AudioClient, Direction, Handle, SampleType, StreamMode, WasapiError,
    WaveFormat,
};

const BUFFER_DURATION_HUNDRED_NANOSECONDS: i64 = 200_000;
const LOOPBACK_SCOPE: LoopbackScope = LoopbackScope::ExcludeConcordProcessTree;

fn audio_error(error: WasapiError) -> CaptureError {
    CaptureError::Audio(error.to_string())
}

pub(crate) struct SystemAudioLoopback {
    capture: AudioCaptureClient,
    ready: Handle,
    pending: VecDeque<u8>,
    _client: AudioClient,
    _apartment: ComApartment,
}

impl SystemAudioLoopback {
    pub fn start() -> Result<Self, CaptureError> {
        let apartment = ComApartment::enter()?;
        let mut client = AudioClient::new_application_loopback_client(
            std::process::id(),
            LOOPBACK_SCOPE.includes_process_tree(),
        )
        .map_err(audio_error)?;
        let format = WaveFormat::new(
            16,
            16,
            SampleType::Int,
            SAMPLE_RATE as usize,
            CHANNELS as usize,
            None,
        );
        let mode = StreamMode::EventsShared {
            autoconvert: true,
            buffer_duration_hns: BUFFER_DURATION_HUNDRED_NANOSECONDS,
        };
        client
            .initialize_client(&format, Direction::Capture, mode, None)
            .map_err(audio_error)?;
        let ready = client.set_get_eventhandle().map_err(audio_error)?;
        let capture = client.get_audiocaptureclient().map_err(audio_error)?;
        client.start_stream().map_err(audio_error)?;
        Ok(Self {
            capture,
            ready,
            pending: VecDeque::new(),
            _client: client,
            _apartment: apartment,
        })
    }
}

impl AudioSource for SystemAudioLoopback {
    fn read(&mut self, timeout: Duration, into: &mut Vec<u8>) -> Result<(), CaptureError> {
        let milliseconds = u32::try_from(timeout.as_millis()).unwrap_or(u32::MAX);
        match self.ready.wait_for_event(milliseconds) {
            Ok(()) => {}
            Err(WasapiError::EventTimeout) => return Ok(()),
            Err(error) => return Err(audio_error(error)),
        }
        while self
            .capture
            .get_next_packet_size()
            .map_err(audio_error)?
            .unwrap_or(0)
            > 0
        {
            self.capture
                .read_from_device_to_deque(&mut self.pending)
                .map_err(audio_error)?;
        }
        into.extend(self.pending.drain(..));
        Ok(())
    }
}
