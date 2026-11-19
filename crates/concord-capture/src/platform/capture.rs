use super::device::GpuDevice;
use super::target::CaptureTarget;
use crate::error::CaptureError;
use crate::frame_size::FrameSize;
use crate::pipeline::{FrameSource, SizedFrame, SourceEvent};
use parking_lot::Mutex;
use std::sync::Arc;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender, TrySendError};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use windows::System::DispatcherQueueController;
use windows::Win32::Foundation::{LPARAM, WPARAM};
use windows::Win32::Graphics::Direct3D11::{
    D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE, D3D11_TEXTURE2D_DESC,
    D3D11_USAGE_DEFAULT, ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::System::WinRT::{
    CreateDispatcherQueueController, DQTAT_COM_NONE, DQTYPE_THREAD_CURRENT, DispatcherQueueOptions,
    RO_INIT_MULTITHREADED, RoInitialize, RoUninitialize,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetMessageW, MSG, PostQuitMessage, PostThreadMessageW, TranslateMessage,
    WM_QUIT,
};
use windows_capture::capture::{Context, GraphicsCaptureApiHandler};
use windows_capture::frame::Frame;
use windows_capture::graphics_capture_api::{GraphicsCaptureApi, InternalCaptureControl};
use windows_capture::monitor::Monitor;
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
    GraphicsCaptureItemType, MinimumUpdateIntervalSettings, SecondaryWindowSettings,
};
use windows_capture::window::Window;
use windows_future::AsyncActionCompletedHandler;

const TEXTURE_POOL_SIZE: usize = 3;

#[derive(Clone)]
pub(crate) struct CapturedFrame {
    pub texture: ID3D11Texture2D,
    pub size: FrameSize,
}

unsafe impl Send for CapturedFrame {}

impl SizedFrame for CapturedFrame {
    fn size(&self) -> FrameSize {
        self.size
    }
}

pub(crate) enum CaptureMessage {
    Frame(CapturedFrame),
    Closed,
}

pub(crate) struct ChannelFrameSource {
    receiver: Receiver<CaptureMessage>,
}

impl ChannelFrameSource {
    pub fn new(receiver: Receiver<CaptureMessage>) -> Self {
        Self { receiver }
    }
}

impl FrameSource for ChannelFrameSource {
    type Frame = CapturedFrame;

    fn next_event(
        &mut self,
        timeout: Duration,
    ) -> Result<SourceEvent<CapturedFrame>, CaptureError> {
        match self.receiver.recv_timeout(timeout) {
            Ok(CaptureMessage::Frame(frame)) => Ok(SourceEvent::Frame(frame)),
            Ok(CaptureMessage::Closed) => Ok(SourceEvent::Closed),
            Err(RecvTimeoutError::Disconnected) => {
                Err(CaptureError::Capture("capture thread ended".into()))
            }
            Err(RecvTimeoutError::Timeout) => Ok(SourceEvent::Idle),
        }
    }
}

struct TexturePool {
    gpu: GpuDevice,
    size: FrameSize,
    textures: Vec<ID3D11Texture2D>,
    next: usize,
}

impl TexturePool {
    fn next_texture(&mut self, size: FrameSize) -> Result<ID3D11Texture2D, CaptureError> {
        if size != self.size || self.textures.is_empty() {
            self.textures = (0..TEXTURE_POOL_SIZE)
                .map(|_| create_bgra_texture(&self.gpu, size))
                .collect::<Result<_, _>>()?;
            self.size = size;
        }
        self.next = (self.next + 1) % self.textures.len();
        Ok(self.textures[self.next].clone())
    }
}

fn create_bgra_texture(gpu: &GpuDevice, size: FrameSize) -> Result<ID3D11Texture2D, CaptureError> {
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
    let mut texture = None;
    unsafe {
        gpu.device
            .CreateTexture2D(&description, None, Some(&mut texture))?
    };
    texture.ok_or_else(|| CaptureError::Capture("Direct3D returned no texture".into()))
}

pub(crate) struct FrameForwarder {
    pool: TexturePool,
    sender: SyncSender<CaptureMessage>,
}

pub(crate) struct ForwarderSetup {
    gpu: GpuDevice,
    sender: SyncSender<CaptureMessage>,
}

impl GraphicsCaptureApiHandler for FrameForwarder {
    type Flags = ForwarderSetup;
    type Error = CaptureError;

    fn new(context: Context<ForwarderSetup>) -> Result<Self, CaptureError> {
        let setup = context.flags;
        Ok(Self {
            pool: TexturePool {
                gpu: setup.gpu,
                size: FrameSize {
                    width: 0,
                    height: 0,
                },
                textures: Vec::new(),
                next: 0,
            },
            sender: setup.sender,
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        control: InternalCaptureControl,
    ) -> Result<(), CaptureError> {
        let size = FrameSize {
            width: frame.width(),
            height: frame.height(),
        };
        let texture = self.pool.next_texture(size)?;
        unsafe {
            self.pool
                .gpu
                .context
                .CopyResource(&texture, frame.as_raw_texture())
        };
        if let Err(TrySendError::Disconnected(_)) = self
            .sender
            .try_send(CaptureMessage::Frame(CapturedFrame { texture, size }))
        {
            control.stop();
        }
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), CaptureError> {
        self.sender.send(CaptureMessage::Closed).or(Ok(()))
    }
}

pub(crate) struct CaptureThread {
    thread_id: u32,
    handle: JoinHandle<Result<(), CaptureError>>,
}

impl CaptureThread {
    pub fn start(
        target: CaptureTarget,
        gpu: GpuDevice,
        frames_per_second: u32,
        sender: SyncSender<CaptureMessage>,
    ) -> Result<Self, CaptureError> {
        let (started, ready) = mpsc::channel();
        let handle = thread::Builder::new()
            .name("concord-capture".into())
            .spawn(move || run_capture(target, gpu, frames_per_second, sender, started))
            .map_err(|error| CaptureError::Thread(error.to_string()))?;
        match ready.recv() {
            Ok(thread_id) => Ok(Self { thread_id, handle }),
            Err(_) => Err(join_capture(handle).err().unwrap_or_else(|| {
                CaptureError::Thread("capture thread ended before starting".into())
            })),
        }
    }

    pub fn stop(self) -> Result<(), CaptureError> {
        if !self.handle.is_finished() {
            unsafe { PostThreadMessageW(self.thread_id, WM_QUIT, WPARAM(0), LPARAM(0))? };
        }
        join_capture(self.handle)
    }
}

fn join_capture(handle: JoinHandle<Result<(), CaptureError>>) -> Result<(), CaptureError> {
    handle
        .join()
        .map_err(|_| CaptureError::Thread("capture thread panicked".into()))?
}

struct WindowsRuntime;

impl WindowsRuntime {
    fn initialize() -> Result<Self, CaptureError> {
        unsafe { RoInitialize(RO_INIT_MULTITHREADED)? };
        Ok(Self)
    }
}

impl Drop for WindowsRuntime {
    fn drop(&mut self) {
        unsafe { RoUninitialize() };
    }
}

fn run_capture(
    target: CaptureTarget,
    gpu: GpuDevice,
    frames_per_second: u32,
    sender: SyncSender<CaptureMessage>,
    started: mpsc::Sender<u32>,
) -> Result<(), CaptureError> {
    let _runtime = WindowsRuntime::initialize()?;
    let controller = create_dispatcher_queue()?;
    let thread_id = unsafe { GetCurrentThreadId() };
    let item: GraphicsCaptureItemType = match target {
        CaptureTarget::Monitor(monitor) => Monitor::from_raw_hmonitor(monitor.0).try_into()?,
        CaptureTarget::Window(window) => Window::from_raw_hwnd(window.0).try_into()?,
    };
    let handler_error = Arc::new(Mutex::new(None));
    let forwarder = FrameForwarder::new(Context {
        flags: ForwarderSetup {
            gpu: gpu.clone(),
            sender,
        },
        device: gpu.device.clone(),
        device_context: gpu.context.clone(),
    })?;
    let mut capture = GraphicsCaptureApi::new(
        gpu.device.clone(),
        gpu.context.clone(),
        item,
        Arc::new(Mutex::new(forwarder)),
        CursorCaptureSettings::WithCursor,
        DrawBorderSettings::Default,
        SecondaryWindowSettings::Default,
        MinimumUpdateIntervalSettings::Custom(Duration::from_millis(
            1000 / u64::from(frames_per_second.max(1)),
        )),
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        thread_id,
        Arc::clone(&handler_error),
    )
    .map_err(|error| CaptureError::Capture(error.to_string()))?;
    capture
        .start_capture()
        .map_err(|error| CaptureError::Capture(error.to_string()))?;
    started
        .send(thread_id)
        .map_err(|_| CaptureError::Thread("share was dropped while starting".into()))?;
    pump_messages()?;
    let shutdown = controller.ShutdownQueueAsync()?;
    shutdown.SetCompleted(&AsyncActionCompletedHandler::new(|_, _| {
        unsafe { PostQuitMessage(0) };
        Ok(())
    }))?;
    pump_messages()?;
    capture.stop_capture();
    match handler_error.lock().take() {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

fn create_dispatcher_queue() -> Result<DispatcherQueueController, CaptureError> {
    let options = DispatcherQueueOptions {
        dwSize: size_of::<DispatcherQueueOptions>() as u32,
        threadType: DQTYPE_THREAD_CURRENT,
        apartmentType: DQTAT_COM_NONE,
    };
    Ok(unsafe { CreateDispatcherQueueController(options)? })
}

fn pump_messages() -> Result<(), CaptureError> {
    let mut message = MSG::default();
    loop {
        match unsafe { GetMessageW(&mut message, None, 0, 0) }.0 {
            -1 => return Err(CaptureError::Windows(windows::core::Error::from_thread())),
            0 => return Ok(()),
            _ => unsafe {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            },
        }
    }
}
