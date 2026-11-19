use crate::audio_frames::{CHANNELS, SAMPLE_RATE, SAMPLES_PER_CHANNEL};
use crate::error::CaptureError;
use crate::events::EncoderKind;
use crate::frame_size::FrameSize;
use crate::pipeline::{AudioPublisher, EncodedPublisher, EncodedUnit};
use crate::quality::QualityPreset;
use crate::rate_control::RateRequest;
use livekit::options::{TrackPublishOptions, VideoCodec, VideoEncoderBackend, VideoEncoding};
use livekit::track::{LocalAudioTrack, LocalTrack, LocalVideoTrack, TrackSource};
use livekit::webrtc::audio_frame::AudioFrame;
use livekit::webrtc::audio_source::native::NativeAudioSource;
use livekit::webrtc::audio_source::{AudioSourceOptions, RtcAudioSource};
use livekit::webrtc::video_frame::{EncodedFrameType, EncodedVideoCodec, EncodedVideoFrame};
use livekit::webrtc::video_source::native::NativeVideoSource;
use livekit::webrtc::video_source::{RtcVideoSource, VideoResolution};
use livekit::{Room, RoomEvent, RoomOptions};
use std::borrow::Cow;
use tokio::runtime::Handle;
use tokio::sync::mpsc::UnboundedReceiver;

const AUDIO_QUEUE_MILLISECONDS: u32 = 100;

pub(crate) struct RoomPlan {
    pub url: String,
    pub token: String,
    pub encoder: EncoderKind,
    pub resolution: FrameSize,
    pub preset: QualityPreset,
    pub with_audio: bool,
}

pub(crate) struct PublishedTracks {
    pub video: NativeVideoSource,
    pub audio: Option<NativeAudioSource>,
}

pub(crate) struct ConnectedRoom {
    pub room: Room,
    pub events: UnboundedReceiver<RoomEvent>,
    pub tracks: PublishedTracks,
}

fn publish_error(error: impl std::fmt::Display) -> CaptureError {
    CaptureError::Publish(error.to_string())
}

pub(crate) async fn connect(plan: RoomPlan) -> Result<ConnectedRoom, CaptureError> {
    let mut options = RoomOptions::default();
    options.auto_subscribe = false;
    let (room, events) = Room::connect(&plan.url, &plan.token, options)
        .await
        .map_err(publish_error)?;
    match publish_tracks(&room, &plan).await {
        Ok(tracks) => Ok(ConnectedRoom {
            room,
            events,
            tracks,
        }),
        Err(error) => {
            room.close().await.map_err(publish_error)?;
            Err(error)
        }
    }
}

async fn publish_tracks(room: &Room, plan: &RoomPlan) -> Result<PublishedTracks, CaptureError> {
    let resolution = VideoResolution {
        width: plan.resolution.width,
        height: plan.resolution.height,
    };
    let (video, codec, backend) = match plan.encoder {
        EncoderKind::Hardware => (
            NativeVideoSource::new_encoded(resolution),
            VideoCodec::H264,
            VideoEncoderBackend::PreEncoded,
        ),
        EncoderKind::Software => (
            NativeVideoSource::new(resolution, true),
            VideoCodec::VP8,
            VideoEncoderBackend::Auto,
        ),
    };
    let video_track =
        LocalVideoTrack::create_video_track("screen", RtcVideoSource::Native(video.clone()));
    let video_options = TrackPublishOptions {
        source: TrackSource::Screenshare,
        video_codec: codec,
        video_encoder: backend,
        simulcast: false,
        video_encoding: Some(VideoEncoding {
            max_bitrate: u64::from(plan.preset.max_bitrate_bps),
            max_framerate: f64::from(plan.preset.frames_per_second),
        }),
        ..TrackPublishOptions::default()
    };
    let participant = room.local_participant();
    participant
        .publish_track(LocalTrack::Video(video_track), video_options)
        .await
        .map_err(publish_error)?;
    let audio = if plan.with_audio {
        let source = NativeAudioSource::new(
            AudioSourceOptions::default(),
            SAMPLE_RATE,
            CHANNELS,
            AUDIO_QUEUE_MILLISECONDS,
        );
        let audio_track = LocalAudioTrack::create_audio_track(
            "screen-audio",
            RtcAudioSource::Native(source.clone()),
        );
        let audio_options = TrackPublishOptions {
            source: TrackSource::ScreenshareAudio,
            ..TrackPublishOptions::default()
        };
        participant
            .publish_track(LocalTrack::Audio(audio_track), audio_options)
            .await
            .map_err(publish_error)?;
        Some(source)
    } else {
        None
    };
    Ok(PublishedTracks { video, audio })
}

pub(crate) async fn wait_for_disconnect(mut events: UnboundedReceiver<RoomEvent>) {
    while let Some(event) = events.recv().await {
        if matches!(event, RoomEvent::Disconnected { .. }) {
            return;
        }
    }
}

pub(crate) struct LiveKitEncodedPublisher {
    pub source: NativeVideoSource,
}

impl EncodedPublisher for LiveKitEncodedPublisher {
    fn publish(&self, unit: &EncodedUnit, size: FrameSize) {
        self.source.capture_encoded_frame(&EncodedVideoFrame {
            codec: EncodedVideoCodec::H264,
            payload: &unit.data,
            timestamp_us: i64::try_from(unit.timestamp.as_micros()).unwrap_or(i64::MAX),
            frame_type: if unit.keyframe {
                EncodedFrameType::Key
            } else {
                EncodedFrameType::Delta
            },
            resolution: VideoResolution {
                width: size.width,
                height: size.height,
            },
            frame_metadata: None,
        });
    }

    fn take_keyframe_request(&self) -> bool {
        self.source.take_keyframe_request()
    }

    fn take_rate_request(&self) -> Option<RateRequest> {
        self.source
            .take_rate_control_request()
            .map(|request| RateRequest {
                bitrate_bps: request.target_bitrate_bps,
                frames_per_second: request.framerate_fps,
            })
    }
}

pub(crate) struct LiveKitAudioPublisher {
    pub source: NativeAudioSource,
    pub runtime: Handle,
}

impl AudioPublisher for LiveKitAudioPublisher {
    fn publish(&self, frame: &[i16]) -> Result<(), CaptureError> {
        let audio = AudioFrame {
            data: Cow::Borrowed(frame),
            sample_rate: SAMPLE_RATE,
            num_channels: CHANNELS,
            samples_per_channel: SAMPLES_PER_CHANNEL,
        };
        self.runtime
            .block_on(self.source.capture_frame(&audio))
            .map_err(publish_error)
    }
}
