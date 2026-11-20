use std::cell::RefCell;
use std::ffi::c_void;
use std::mem::{size_of, zeroed};
use std::rc::Rc;
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread::JoinHandle;
use std::time::Duration;

use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Input::{
    GetRawInputData, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE, RAWINPUTHEADER, RID_INPUT,
    RIDEV_INPUTSINK, RIDEV_REMOVE, RIM_TYPEKEYBOARD, RIM_TYPEMOUSE, RegisterRawInputDevices,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW, HWND_MESSAGE,
    MSG, PostMessageW, PostQuitMessage, RegisterClassW, SendMessageW, UnregisterClassW,
    WINDOW_EX_STYLE, WINDOW_STYLE, WM_APP, WM_CLOSE, WM_INPUT, WNDCLASSW,
};
use windows::core::{PCWSTR, w};

use crate::binding::Binding;
use crate::capture::{CaptureOutcome, capture_outcome, claim_capture};
use crate::config::PushToTalkConfig;
use crate::error::PushToTalkError;
use crate::input::InputEvent;
use crate::keymap::key_event;
use crate::mouse::mouse_events;
use crate::press::PressState;

const WM_SYNC: u32 = WM_APP;
const CLASS_NAME: PCWSTR = w!("ConcordPushToTalk");
const USAGE_PAGE_GENERIC_DESKTOP: u16 = 1;
const USAGE_MOUSE: u16 = 2;
const USAGE_KEYBOARD: u16 = 6;

#[derive(Default)]
struct Shared {
    config: PushToTalkConfig,
    capture: Option<Sender<CaptureOutcome>>,
    error: Option<windows::core::Error>,
}

type SharedHandle = Arc<Mutex<Shared>>;

fn lock(shared: &SharedHandle) -> MutexGuard<'_, Shared> {
    shared.lock().unwrap_or_else(PoisonError::into_inner)
}

struct Context {
    shared: SharedHandle,
    press: PressState,
    registered: bool,
    on_change: Rc<dyn Fn(bool)>,
}

impl Context {
    fn sync(&mut self, window: HWND) -> Option<bool> {
        let (active, capturing) = {
            let shared = lock(&self.shared);
            (shared.config.active_binding(), shared.capture.is_some())
        };
        let listening = capturing || active.is_some();
        let released = self.press.configure(active.filter(|_| !capturing));
        if listening != self.registered {
            match set_registration(window, listening) {
                Ok(()) => self.registered = listening,
                Err(error) => lock(&self.shared).error = Some(error),
            }
        }
        released
    }

    fn on_event(&mut self, event: &InputEvent) -> Option<bool> {
        let mut shared = lock(&self.shared);
        if let Some(sender) = &shared.capture {
            if let Some(outcome) = capture_outcome(event) {
                let _ = sender.send(outcome);
                shared.capture = None;
            }
            return None;
        }
        drop(shared);
        self.press.on_event(event)
    }
}

thread_local! {
    static CONTEXT: RefCell<Option<Context>> = const { RefCell::new(None) };
}

fn dispatch(action: impl FnOnce(&mut Context) -> Option<bool>) {
    let outcome = CONTEXT.with(|cell| {
        cell.borrow_mut()
            .as_mut()
            .map(|context| (action(context), Rc::clone(&context.on_change)))
    });
    if let Some((Some(pressed), on_change)) = outcome {
        on_change(pressed);
    }
}

fn set_registration(window: HWND, listen: bool) -> windows::core::Result<()> {
    let (flags, target) = if listen {
        (RIDEV_INPUTSINK, window)
    } else {
        (RIDEV_REMOVE, HWND::default())
    };
    let device = |usage| RAWINPUTDEVICE {
        usUsagePage: USAGE_PAGE_GENERIC_DESKTOP,
        usUsage: usage,
        dwFlags: flags,
        hwndTarget: target,
    };
    let devices = [device(USAGE_KEYBOARD), device(USAGE_MOUSE)];
    unsafe { RegisterRawInputDevices(&devices, size_of::<RAWINPUTDEVICE>() as u32) }
}

fn read_raw_input(handle: HRAWINPUT) -> windows::core::Result<RAWINPUT> {
    let mut raw: RAWINPUT = unsafe { zeroed() };
    let mut size = size_of::<RAWINPUT>() as u32;
    let copied = unsafe {
        GetRawInputData(
            handle,
            RID_INPUT,
            Some((&raw mut raw).cast::<c_void>()),
            &mut size,
            size_of::<RAWINPUTHEADER>() as u32,
        )
    };
    if copied == u32::MAX {
        return Err(windows::core::Error::from_thread());
    }
    Ok(raw)
}

fn events_of(raw: &RAWINPUT) -> Vec<InputEvent> {
    let header_type = raw.header.dwType;
    if header_type == RIM_TYPEKEYBOARD.0 {
        let keyboard = unsafe { raw.data.keyboard };
        key_event(keyboard.MakeCode, keyboard.Flags, keyboard.VKey)
            .into_iter()
            .collect()
    } else if header_type == RIM_TYPEMOUSE.0 {
        let button_flags = unsafe { raw.data.mouse.Anonymous.Anonymous.usButtonFlags };
        mouse_events(button_flags).collect()
    } else {
        Vec::new()
    }
}

fn handle_raw_input(lparam: LPARAM) {
    let shared = CONTEXT.with(|cell| {
        cell.borrow()
            .as_ref()
            .map(|context| Arc::clone(&context.shared))
    });
    let Some(shared) = shared else { return };
    match read_raw_input(HRAWINPUT(lparam.0 as *mut c_void)) {
        Ok(raw) => {
            for event in events_of(&raw) {
                dispatch(|context| context.on_event(&event));
            }
        }
        Err(error) => lock(&shared).error = Some(error),
    }
}

unsafe extern "system" fn window_procedure(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match message {
        WM_INPUT => {
            handle_raw_input(lparam);
            unsafe { DefWindowProcW(window, message, wparam, lparam) }
        }
        WM_SYNC => {
            dispatch(|context| context.sync(window));
            LRESULT(0)
        }
        WM_CLOSE => {
            unsafe { PostQuitMessage(0) };
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcW(window, message, wparam, lparam) },
    }
}

struct MessageWindow {
    handle: HWND,
}

impl MessageWindow {
    fn create() -> windows::core::Result<Self> {
        let instance = unsafe { GetModuleHandleW(None)? }.into();
        let class = WNDCLASSW {
            lpfnWndProc: Some(window_procedure),
            hInstance: instance,
            lpszClassName: CLASS_NAME,
            ..Default::default()
        };
        if unsafe { RegisterClassW(&class) } == 0 {
            return Err(windows::core::Error::from_thread());
        }
        let created = unsafe {
            CreateWindowExW(
                WINDOW_EX_STYLE(0),
                CLASS_NAME,
                w!(""),
                WINDOW_STYLE(0),
                0,
                0,
                0,
                0,
                Some(HWND_MESSAGE),
                None,
                Some(instance),
                None,
            )
        };
        match created {
            Ok(handle) => Ok(Self { handle }),
            Err(error) => {
                unsafe { UnregisterClassW(CLASS_NAME, Some(instance)) }?;
                Err(error)
            }
        }
    }
}

impl Drop for MessageWindow {
    fn drop(&mut self) {
        let _ = unsafe { DestroyWindow(self.handle) };
        let instance = unsafe { GetModuleHandleW(None) }.map(Into::into).ok();
        let _ = unsafe { UnregisterClassW(CLASS_NAME, instance) };
    }
}

fn listen(
    shared: SharedHandle,
    on_change: impl Fn(bool) + Send + 'static,
    ready: Sender<windows::core::Result<isize>>,
) {
    let window = match MessageWindow::create() {
        Ok(window) => window,
        Err(error) => {
            let _ = ready.send(Err(error));
            return;
        }
    };
    CONTEXT.with(|cell| {
        *cell.borrow_mut() = Some(Context {
            shared,
            press: PressState::default(),
            registered: false,
            on_change: Rc::new(on_change),
        });
    });
    if ready.send(Ok(window.handle.0 as isize)).is_err() {
        return;
    }
    let mut message = MSG::default();
    while unsafe { GetMessageW(&mut message, None, 0, 0) }.0 > 0 {
        unsafe { DispatchMessageW(&message) };
    }
    let _ = set_registration(window.handle, false);
    CONTEXT.with(|cell| cell.borrow_mut().take());
}

pub struct PushToTalk {
    shared: SharedHandle,
    window: isize,
    listener: Option<JoinHandle<()>>,
}

impl PushToTalk {
    pub fn new(on_change: impl Fn(bool) + Send + 'static) -> Result<Self, PushToTalkError> {
        let shared = SharedHandle::default();
        let (ready, started) = mpsc::channel();
        let thread_shared = Arc::clone(&shared);
        let listener = std::thread::spawn(move || listen(thread_shared, on_change, ready));
        let window = started
            .recv()
            .map_err(|_| PushToTalkError::ListenerStopped)??;
        Ok(Self {
            shared,
            window,
            listener: Some(listener),
        })
    }

    pub fn configure(&self, config: PushToTalkConfig) -> Result<(), PushToTalkError> {
        lock(&self.shared).config = config;
        self.sync()
    }

    pub fn capture(&self, timeout: Duration) -> Result<Option<Binding>, PushToTalkError> {
        let (sender, receiver) = mpsc::channel();
        claim_capture(&mut lock(&self.shared).capture, sender)?;
        let started = self.sync();
        let outcome = match started {
            Ok(()) => receiver.recv_timeout(timeout),
            Err(_) => Err(RecvTimeoutError::Disconnected),
        };
        lock(&self.shared).capture = None;
        let finished = self.sync();
        started?;
        finished?;
        match outcome {
            Ok(CaptureOutcome::Chosen(binding)) => Ok(Some(binding)),
            Ok(CaptureOutcome::Cancelled)
            | Err(RecvTimeoutError::Timeout | RecvTimeoutError::Disconnected) => Ok(None),
        }
    }

    fn window_handle(&self) -> HWND {
        HWND(self.window as *mut c_void)
    }

    fn sync(&self) -> Result<(), PushToTalkError> {
        unsafe { SendMessageW(self.window_handle(), WM_SYNC, None, None) };
        match lock(&self.shared).error.take() {
            Some(error) => Err(error.into()),
            None => Ok(()),
        }
    }
}

impl Drop for PushToTalk {
    fn drop(&mut self) {
        let _ = unsafe { PostMessageW(Some(self.window_handle()), WM_CLOSE, WPARAM(0), LPARAM(0)) };
        if let Some(listener) = self.listener.take() {
            let _ = listener.join();
        }
    }
}
