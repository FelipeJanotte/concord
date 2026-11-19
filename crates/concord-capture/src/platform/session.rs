use super::audio::SystemAudioLoopback;
use super::capture::{CaptureMessage, CaptureThread, ChannelFrameSource};
use super::com::ComApartment;
use super::device::GpuDevice;
use super::hardware_encoder::{HardwareEncoderFactory, probe_hardware_encoder};
use super::room::{
    self, LiveKitAudioPublisher, LiveKitEncodedPublisher, PublishedTracks, RoomPlan,
};
use super::software_sink::SoftwareVideoSink;
use super::target::CaptureTarget;
use crate::encoder_selection::select_encoder;
use crate::error::CaptureError;
use crate::events::{EncoderKind, EndReason, EventCallback, EventEmitter, ShareEvent};
use crate::frame_size::target_size;
use crate::pacing::FramePacer;
use crate::pipeline::{
    EncodedVideoSink, MonotonicClock, StopSignal, VideoEnd, run_audio, run_video,
};
use crate::quality::QualityPreset;
use crate::share::ShareRequest;
use crate::source::SourceId;
use std::sync::Arc;
use std::sync::mpsc::{self, Receiver};
use std::thread::{self, JoinHandle};
use tokio::runtime::{Builder, Handle};

const ROOM_RUNTIME_THREADS: usize = 2;

type Worker = JoinHandle<()>;

pub(crate) struct Session {
    media_stop: StopSignal,
    room_release: StopSignal,
    events: Arc<EventEmitter>,
    capture: Option<CaptureThread>,
    media_workers: Vec<Worker>,
    room_worker: Option<Worker>,
}

impl Session {
    pub fn start(request: ShareRequest, callback: EventCallback) -> Result<Self, CaptureError> {
        let target = CaptureTarget::resolve(SourceId::parse(&request.source_id)?)?;
        let preset = request.quality.preset();
        let gpu = GpuDevice::for_monitor(target.monitor())?;
        let source_size = target.size()?;
        let probe_gpu = gpu.clone();
        let choice = select_encoder(|| {
            in_com_thread(move || probe_hardware_encoder(&probe_gpu, source_size, &preset))
        });
        let mut session = Self {
            media_stop: StopSignal::default(),
            room_release: StopSignal::default(),
            events: Arc::new(EventEmitter::new(callback)),
            capture: None,
            media_workers: Vec::new(),
            room_worker: None,
        };
        if let Some(failure) = &choice.hardware_failure {
            session.events.emit(ShareEvent::HardwareEncoderUnavailable {
                reason: failure.to_string(),
            });
        }
        let plan = RoomPlan {
            url: request.livekit_url,
            token: request.token,
            encoder: choice.kind,
            resolution: target_size(source_size, &preset),
            preset,
            with_audio: request.with_audio,
        };
        let (tracks, runtime) = session.start_room(plan)?;
        let (sender, receiver) = mpsc::sync_channel(1);
        session.capture = Some(CaptureThread::start(
            target,
            gpu.clone(),
            preset.frames_per_second,
            sender,
        )?);
        let video = VideoPlan {
            receiver,
            gpu,
            preset,
            encoder: choice.kind,
            tracks_video: tracks.video,
        };
        let stop = session.media_stop.clone();
        session.spawn_media("concord-video", move || video.run(&stop))?;
        if let Some(audio_source) = tracks.audio {
            let stop = session.media_stop.clone();
            session.spawn_media("concord-audio", move || {
                let mut loopback = SystemAudioLoopback::start()?;
                let publisher = LiveKitAudioPublisher {
                    source: audio_source,
                    runtime,
                };
                run_audio(&mut loopback, &publisher, &stop)?;
                Ok(None)
            })?;
        }
        session.events.emit(ShareEvent::Started {
            encoder: choice.kind,
        });
        Ok(session)
    }

    pub fn stop(self) {
        drop(self);
    }

    fn start_room(&mut self, plan: RoomPlan) -> Result<(PublishedTracks, Handle), CaptureError> {
        let (ready_sender, ready) = mpsc::channel();
        let release = self.room_release.clone();
        let media_stop = self.media_stop.clone();
        let events = Arc::clone(&self.events);
        let worker = thread::Builder::new()
            .name("concord-room".into())
            .spawn(move || {
                let outcome = run_room(plan, ready_sender, &release, &media_stop, &events);
                if let Err(error) = outcome {
                    events.emit(ShareEvent::Ended {
                        reason: EndReason::Failed(error.to_string()),
                    });
                    media_stop.stop();
                }
            })
            .map_err(|error| CaptureError::Thread(error.to_string()))?;
        self.room_worker = Some(worker);
        ready
            .recv()
            .map_err(|_| CaptureError::Thread("room thread ended before connecting".into()))?
    }

    fn spawn_media(
        &mut self,
        name: &str,
        body: impl FnOnce() -> Result<Option<EndReason>, CaptureError> + Send + 'static,
    ) -> Result<(), CaptureError> {
        let events = Arc::clone(&self.events);
        let stop = self.media_stop.clone();
        let worker = thread::Builder::new()
            .name(name.into())
            .spawn(move || {
                let reason = match body() {
                    Ok(reason) => reason,
                    Err(error) => Some(EndReason::Failed(error.to_string())),
                };
                if let Some(reason) = reason {
                    events.emit(ShareEvent::Ended { reason });
                }
                stop.stop();
            })
            .map_err(|error| CaptureError::Thread(error.to_string()))?;
        self.media_workers.push(worker);
        Ok(())
    }

    fn report(&self, outcome: Result<(), CaptureError>) {
        if let Err(error) = outcome {
            self.events.emit(ShareEvent::Ended {
                reason: EndReason::Failed(error.to_string()),
            });
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.media_stop.stop();
        if let Some(capture) = self.capture.take() {
            self.report(capture.stop());
        }
        for worker in std::mem::take(&mut self.media_workers) {
            self.report(join(worker));
        }
        self.room_release.stop();
        if let Some(worker) = self.room_worker.take() {
            self.report(join(worker));
        }
        self.events.emit(ShareEvent::Ended {
            reason: EndReason::Stopped,
        });
    }
}

fn join(worker: Worker) -> Result<(), CaptureError> {
    let name = worker.thread().name().unwrap_or("share").to_owned();
    worker
        .join()
        .map_err(|_| CaptureError::Thread(format!("{name} thread panicked")))
}

struct VideoPlan {
    receiver: Receiver<CaptureMessage>,
    gpu: GpuDevice,
    preset: QualityPreset,
    encoder: EncoderKind,
    tracks_video: livekit::webrtc::video_source::native::NativeVideoSource,
}

impl VideoPlan {
    fn run(self, stop: &StopSignal) -> Result<Option<EndReason>, CaptureError> {
        let _apartment = ComApartment::enter()?;
        let mut source = ChannelFrameSource::new(self.receiver);
        let mut pacer = FramePacer::new(self.preset.frames_per_second);
        let clock = MonotonicClock::start();
        let end = match self.encoder {
            EncoderKind::Hardware => {
                let factory = HardwareEncoderFactory {
                    gpu: self.gpu,
                    frames_per_second: self.preset.frames_per_second,
                };
                let publisher = LiveKitEncodedPublisher {
                    source: self.tracks_video,
                };
                let mut sink = EncodedVideoSink::new(factory, publisher, self.preset);
                run_video(&mut source, &mut sink, &mut pacer, &clock, stop)?
            }
            EncoderKind::Software => {
                let mut sink = SoftwareVideoSink::new(self.gpu, self.tracks_video, self.preset);
                run_video(&mut source, &mut sink, &mut pacer, &clock, stop)?
            }
        };
        Ok(match end {
            VideoEnd::SourceClosed => Some(EndReason::SourceClosed),
            VideoEnd::Stopped => None,
        })
    }
}

fn run_room(
    plan: RoomPlan,
    ready: mpsc::Sender<Result<(PublishedTracks, Handle), CaptureError>>,
    release: &StopSignal,
    media_stop: &StopSignal,
    events: &Arc<EventEmitter>,
) -> Result<(), CaptureError> {
    let runtime = match Builder::new_multi_thread()
        .worker_threads(ROOM_RUNTIME_THREADS)
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => return report_start_failure(&ready, CaptureError::Thread(error.to_string())),
    };
    let connected = match runtime.block_on(room::connect(plan)) {
        Ok(connected) => connected,
        Err(error) => return report_start_failure(&ready, error),
    };
    if ready
        .send(Ok((connected.tracks, runtime.handle().clone())))
        .is_err()
    {
        return runtime
            .block_on(connected.room.close())
            .map_err(|error| CaptureError::Publish(error.to_string()));
    }
    let disconnect_events = Arc::clone(events);
    let disconnect_stop = media_stop.clone();
    runtime.spawn(async move {
        room::wait_for_disconnect(connected.events).await;
        disconnect_events.emit(ShareEvent::Ended {
            reason: EndReason::Disconnected,
        });
        disconnect_stop.stop();
    });
    release.wait();
    runtime
        .block_on(connected.room.close())
        .map_err(|error| CaptureError::Publish(error.to_string()))
}

fn report_start_failure(
    ready: &mpsc::Sender<Result<(PublishedTracks, Handle), CaptureError>>,
    error: CaptureError,
) -> Result<(), CaptureError> {
    ready
        .send(Err(error))
        .map_err(|_| CaptureError::Thread("share was dropped while starting".into()))
}

fn in_com_thread<T: Send + 'static>(
    body: impl FnOnce() -> Result<T, CaptureError> + Send + 'static,
) -> Result<T, CaptureError> {
    thread::Builder::new()
        .name("concord-encoder-probe".into())
        .spawn(move || {
            let _apartment = ComApartment::enter()?;
            body()
        })
        .map_err(|error| CaptureError::Thread(error.to_string()))?
        .join()
        .map_err(|_| CaptureError::Thread("encoder probe panicked".into()))?
}
