use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use concord_ptt::{Binding, BindingKind, PushToTalkConfig, PushToTalkError};
use serde::{Deserialize, Serialize};

pub const RELEASE_DELAY: Duration = Duration::from_millis(200);
pub const CAPTURE_TIMEOUT: Duration = Duration::from_millis(10_000);
const MOUSE_BUTTONS: [u32; 3] = [3, 4, 5];
const MAXIMUM_CODE: u32 = 0xffff;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PttBindingKind {
    Key,
    Mouse,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PttBinding {
    pub kind: PttBindingKind,
    pub code: u32,
    pub label: String,
}

#[derive(Debug, Deserialize)]
pub struct PttConfig {
    pub enabled: bool,
    pub binding: Option<PttBinding>,
}

impl From<PttBindingKind> for BindingKind {
    fn from(kind: PttBindingKind) -> Self {
        match kind {
            PttBindingKind::Key => BindingKind::Key,
            PttBindingKind::Mouse => BindingKind::Mouse,
        }
    }
}

impl From<BindingKind> for PttBindingKind {
    fn from(kind: BindingKind) -> Self {
        match kind {
            BindingKind::Key => PttBindingKind::Key,
            BindingKind::Mouse => PttBindingKind::Mouse,
        }
    }
}

impl From<Binding> for PttBinding {
    fn from(binding: Binding) -> Self {
        Self {
            kind: binding.kind.into(),
            code: u32::from(binding.code),
            label: binding.label,
        }
    }
}

pub fn valid_binding(binding: &PttBinding) -> Option<Binding> {
    let code = u16::try_from(binding.code).ok()?;
    if binding.code == 0 || binding.code > MAXIMUM_CODE {
        return None;
    }
    if binding.kind == PttBindingKind::Mouse && !MOUSE_BUTTONS.contains(&binding.code) {
        return None;
    }
    Some(Binding::new(binding.kind.into(), code))
}

pub fn hook_config(config: &PttConfig) -> PushToTalkConfig {
    let binding = config.binding.as_ref().and_then(|binding| {
        let valid = valid_binding(binding);
        if valid.is_none() {
            log::warn!("tecla do pressione para falar inválida: {binding:?}");
        }
        valid
    });
    PushToTalkConfig {
        enabled: config.enabled,
        binding,
    }
}

#[derive(Debug, Default)]
struct ReleaseState {
    pressed: bool,
    pending: Option<u64>,
    last_token: u64,
}

impl ReleaseState {
    fn press(&mut self) -> Option<bool> {
        self.pending = None;
        if self.pressed {
            return None;
        }
        self.pressed = true;
        Some(true)
    }

    fn release(&mut self) -> Option<u64> {
        if !self.pressed || self.pending.is_some() {
            return None;
        }
        self.last_token += 1;
        self.pending = Some(self.last_token);
        self.pending
    }

    fn expire(&mut self, token: u64) -> Option<bool> {
        if self.pending != Some(token) {
            return None;
        }
        self.pending = None;
        self.pressed = false;
        Some(false)
    }

    fn flush(&mut self) -> Option<bool> {
        self.pending = None;
        if !self.pressed {
            return None;
        }
        self.pressed = false;
        Some(false)
    }
}

type Announce = Arc<dyn Fn(bool) + Send + Sync>;

pub struct ReleaseDelay {
    state: Mutex<ReleaseState>,
    delay: Duration,
    announce: Announce,
}

impl ReleaseDelay {
    pub fn new(delay: Duration, announce: Announce) -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(ReleaseState::default()),
            delay,
            announce,
        })
    }

    fn with_state<T>(&self, change: impl FnOnce(&mut ReleaseState) -> T) -> T {
        change(&mut self.state.lock().unwrap_or_else(PoisonError::into_inner))
    }

    pub fn on_change(self: &Arc<Self>, pressed: bool) {
        if pressed {
            if let Some(announced) = self.with_state(ReleaseState::press) {
                (self.announce)(announced);
            }
            return;
        }
        if let Some(token) = self.with_state(ReleaseState::release) {
            let delayed = Arc::clone(self);
            std::thread::spawn(move || {
                std::thread::sleep(delayed.delay);
                if let Some(announced) = delayed.with_state(|state| state.expire(token)) {
                    (delayed.announce)(announced);
                }
            });
        }
    }

    pub fn flush(&self) {
        if let Some(announced) = self.with_state(ReleaseState::flush) {
            (self.announce)(announced);
        }
    }
}

pub trait InputHook: Send + Sync + 'static {
    fn configure(&self, config: PushToTalkConfig) -> Result<(), PushToTalkError>;
    fn capture(&self, timeout: Duration) -> Result<Option<Binding>, PushToTalkError>;
}

#[derive(Debug, thiserror::Error)]
pub enum HookCreationFailure {
    #[error(transparent)]
    Hook(#[from] PushToTalkError),
    #[error("este sistema não oferece escuta global do teclado")]
    UnsupportedPlatform,
}

pub type HookFactory<Hook> =
    Box<dyn Fn(Box<dyn Fn(bool) + Send>) -> Result<Hook, HookCreationFailure> + Send + Sync>;

enum HookState<Hook> {
    NotCreated,
    Ready(Arc<Hook>),
    Unavailable,
}

pub struct PttController<Hook> {
    factory: HookFactory<Hook>,
    on_unavailable: Box<dyn Fn() + Send + Sync>,
    release_delay: Arc<ReleaseDelay>,
    state: Mutex<HookState<Hook>>,
    active_binding: Mutex<Option<Binding>>,
}

impl<Hook: InputHook> PttController<Hook> {
    pub fn new(
        factory: HookFactory<Hook>,
        announce: Announce,
        on_unavailable: impl Fn() + Send + Sync + 'static,
    ) -> Self {
        Self {
            factory,
            on_unavailable: Box::new(on_unavailable),
            release_delay: ReleaseDelay::new(RELEASE_DELAY, announce),
            state: Mutex::new(HookState::NotCreated),
            active_binding: Mutex::new(None),
        }
    }

    fn hook(&self, create_if_missing: bool) -> Option<Arc<Hook>> {
        let mut state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        if matches!(*state, HookState::NotCreated) && create_if_missing {
            let delay = Arc::clone(&self.release_delay);
            match (self.factory)(Box::new(move |pressed| delay.on_change(pressed))) {
                Ok(hook) => *state = HookState::Ready(Arc::new(hook)),
                Err(error) => {
                    log::warn!("pressione para falar indisponível: {error}");
                    *state = HookState::Unavailable;
                    (self.on_unavailable)();
                }
            }
        }
        match &*state {
            HookState::Ready(hook) => Some(Arc::clone(hook)),
            HookState::NotCreated | HookState::Unavailable => None,
        }
    }

    pub fn configure(&self, config: PushToTalkConfig) -> Result<(), PushToTalkError> {
        let needs_hook = config.active_binding().is_some();
        let Some(hook) = self.hook(needs_hook) else {
            return Ok(());
        };
        let next = config.active_binding();
        let (changed, result) = {
            let mut active = self
                .active_binding
                .lock()
                .unwrap_or_else(PoisonError::into_inner);
            let changed = *active != next;
            *active = next;
            (changed, hook.configure(config))
        };
        if changed {
            self.release_delay.flush();
        }
        result
    }

    pub fn capture(&self, timeout: Duration) -> Result<Option<Binding>, PushToTalkError> {
        self.release_delay.flush();
        match self.hook(true) {
            Some(hook) => hook.capture(timeout),
            None => Ok(None),
        }
    }

    pub fn shutdown(&self) {
        let mut state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        *state = HookState::Unavailable;
        drop(state);
        self.release_delay.flush();
    }
}

#[cfg(windows)]
pub type SystemHook = concord_ptt::PushToTalk;

#[cfg(windows)]
impl InputHook for concord_ptt::PushToTalk {
    fn configure(&self, config: PushToTalkConfig) -> Result<(), PushToTalkError> {
        concord_ptt::PushToTalk::configure(self, config)
    }

    fn capture(&self, timeout: Duration) -> Result<Option<Binding>, PushToTalkError> {
        concord_ptt::PushToTalk::capture(self, timeout)
    }
}

#[cfg(windows)]
pub fn system_factory() -> HookFactory<SystemHook> {
    Box::new(|on_change| Ok(concord_ptt::PushToTalk::new(on_change)?))
}

#[cfg(not(windows))]
pub enum SystemHook {}

#[cfg(not(windows))]
impl InputHook for SystemHook {
    fn configure(&self, _config: PushToTalkConfig) -> Result<(), PushToTalkError> {
        match *self {}
    }

    fn capture(&self, _timeout: Duration) -> Result<Option<Binding>, PushToTalkError> {
        match *self {}
    }
}

#[cfg(not(windows))]
pub fn system_factory() -> HookFactory<SystemHook> {
    Box::new(|_on_change| Err(HookCreationFailure::UnsupportedPlatform))
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::mpsc::{self, Receiver};

    use super::*;

    fn binding(kind: PttBindingKind, code: u32) -> PttBinding {
        PttBinding {
            kind,
            code,
            label: "x".into(),
        }
    }

    #[test]
    fn keys_and_the_three_mouse_buttons_are_valid() {
        let v = valid_binding(&binding(PttBindingKind::Key, 47));
        assert_eq!(v, Some(Binding::new(BindingKind::Key, 47)));
        for button in [3, 4, 5] {
            assert!(valid_binding(&binding(PttBindingKind::Mouse, button)).is_some());
        }
    }

    #[test]
    fn invalid_codes_and_buttons_are_refused() {
        assert_eq!(valid_binding(&binding(PttBindingKind::Key, 0)), None);
        assert_eq!(valid_binding(&binding(PttBindingKind::Key, 0x1_0000)), None);
        assert_eq!(valid_binding(&binding(PttBindingKind::Mouse, 1)), None);
        assert_eq!(valid_binding(&binding(PttBindingKind::Mouse, 2)), None);
    }

    #[test]
    fn hook_config_drops_an_invalid_binding_but_keeps_enabled() {
        let config = hook_config(&PttConfig {
            enabled: true,
            binding: Some(binding(PttBindingKind::Mouse, 1)),
        });
        assert_eq!(
            config,
            PushToTalkConfig {
                enabled: true,
                binding: None
            }
        );
    }

    #[test]
    fn captured_bindings_go_back_with_the_label_and_the_code() {
        let sent: PttBinding = Binding::new(BindingKind::Key, 47).into();
        assert_eq!(
            sent,
            PttBinding {
                kind: PttBindingKind::Key,
                code: 47,
                label: "V".into()
            }
        );
    }

    #[test]
    fn release_state_press_announces_once_while_held() {
        let mut state = ReleaseState::default();
        assert_eq!(state.press(), Some(true));
        assert_eq!(state.press(), None);
    }

    #[test]
    fn release_state_waits_for_the_delay_and_a_new_press_cancels_it() {
        let mut state = ReleaseState::default();
        assert_eq!(state.release(), None);
        state.press();
        let token = state.release();
        assert!(token.is_some());
        assert_eq!(state.release(), None);
        assert_eq!(state.press(), None);
        assert_eq!(state.expire(token.unwrap_or_default()), None);
        let second = state.release();
        assert_eq!(state.expire(second.unwrap_or_default()), Some(false));
        assert_eq!(state.press(), Some(true));
    }

    #[test]
    fn release_state_flush_releases_immediately_and_voids_the_timer() {
        let mut state = ReleaseState::default();
        assert_eq!(state.flush(), None);
        state.press();
        let token = state.release();
        assert_eq!(state.flush(), Some(false));
        assert_eq!(state.expire(token.unwrap_or_default()), None);
    }

    fn delay_with_channel(delay: Duration) -> (Arc<ReleaseDelay>, Receiver<bool>) {
        let (sender, receiver) = mpsc::channel();
        let announce: Announce = Arc::new(move |pressed| {
            let _ = sender.send(pressed);
        });
        (ReleaseDelay::new(delay, announce), receiver)
    }

    #[test]
    fn the_release_is_announced_only_after_the_delay() {
        let (delay, receiver) = delay_with_channel(Duration::from_millis(60));
        delay.on_change(true);
        delay.on_change(false);
        assert_eq!(receiver.recv_timeout(Duration::from_secs(2)), Ok(true));
        assert!(receiver.recv_timeout(Duration::from_millis(20)).is_err());
        assert_eq!(receiver.recv_timeout(Duration::from_secs(2)), Ok(false));
    }

    #[test]
    fn pressing_again_inside_the_delay_keeps_the_microphone_open() {
        let (delay, receiver) = delay_with_channel(Duration::from_millis(60));
        delay.on_change(true);
        delay.on_change(false);
        delay.on_change(true);
        assert_eq!(receiver.recv_timeout(Duration::from_secs(2)), Ok(true));
        assert!(receiver.recv_timeout(Duration::from_millis(200)).is_err());
    }

    struct FakeHook {
        configs: Mutex<Vec<PushToTalkConfig>>,
        captured: Option<Binding>,
    }

    impl InputHook for FakeHook {
        fn configure(&self, config: PushToTalkConfig) -> Result<(), PushToTalkError> {
            self.configs.lock().expect("lock").push(config);
            Ok(())
        }

        fn capture(&self, _timeout: Duration) -> Result<Option<Binding>, PushToTalkError> {
            Ok(self.captured.clone())
        }
    }

    struct Rig {
        controller: PttController<FakeHook>,
        created: Arc<AtomicUsize>,
        unavailable: Arc<AtomicUsize>,
        announced: Receiver<bool>,
    }

    fn rig(factory_works: bool) -> Rig {
        let created = Arc::new(AtomicUsize::new(0));
        let unavailable = Arc::new(AtomicUsize::new(0));
        let (sender, announced) = mpsc::channel();
        let counter = Arc::clone(&created);
        let factory: HookFactory<FakeHook> = Box::new(move |_on_change| {
            counter.fetch_add(1, Ordering::SeqCst);
            if factory_works {
                Ok(FakeHook {
                    configs: Mutex::new(Vec::new()),
                    captured: Some(Binding::new(BindingKind::Key, 47)),
                })
            } else {
                Err(HookCreationFailure::UnsupportedPlatform)
            }
        });
        let missing = Arc::clone(&unavailable);
        let controller = PttController::new(
            factory,
            Arc::new(move |pressed| {
                let _ = sender.send(pressed);
            }),
            move || {
                missing.fetch_add(1, Ordering::SeqCst);
            },
        );
        Rig {
            controller,
            created,
            unavailable,
            announced,
        }
    }

    fn enabled_v() -> PushToTalkConfig {
        PushToTalkConfig {
            enabled: true,
            binding: Some(Binding::new(BindingKind::Key, 47)),
        }
    }

    #[test]
    fn nothing_listens_until_a_binding_is_enabled() {
        let rig = rig(true);
        assert!(rig
            .controller
            .configure(PushToTalkConfig::default())
            .is_ok());
        assert!(rig
            .controller
            .configure(PushToTalkConfig {
                enabled: false,
                binding: Some(Binding::new(BindingKind::Key, 47)),
            })
            .is_ok());
        assert_eq!(rig.created.load(Ordering::SeqCst), 0);
        assert!(rig.controller.configure(enabled_v()).is_ok());
        assert!(rig.controller.configure(enabled_v()).is_ok());
        assert_eq!(rig.created.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_hook_that_cannot_be_created_warns_once_and_is_not_retried() {
        let rig = rig(false);
        assert!(rig.controller.configure(enabled_v()).is_ok());
        assert!(rig.controller.configure(enabled_v()).is_ok());
        assert_eq!(rig.controller.capture(CAPTURE_TIMEOUT).ok(), Some(None));
        assert_eq!(rig.created.load(Ordering::SeqCst), 1);
        assert_eq!(rig.unavailable.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn capture_returns_what_the_hook_heard() {
        let rig = rig(true);
        assert_eq!(
            rig.controller.capture(CAPTURE_TIMEOUT).ok(),
            Some(Some(Binding::new(BindingKind::Key, 47)))
        );
    }

    #[test]
    fn changing_the_binding_while_held_releases_without_the_delay() {
        let rig = rig(true);
        assert!(rig.controller.configure(enabled_v()).is_ok());
        rig.controller.release_delay.on_change(true);
        assert_eq!(rig.announced.recv_timeout(Duration::from_secs(2)), Ok(true));
        let other = PushToTalkConfig {
            enabled: true,
            binding: Some(Binding::new(BindingKind::Key, 48)),
        };
        assert!(rig.controller.configure(other).is_ok());
        assert_eq!(
            rig.announced.recv_timeout(Duration::from_millis(100)),
            Ok(false)
        );
    }

    #[test]
    fn resending_the_same_binding_while_held_does_not_release() {
        let rig = rig(true);
        assert!(rig.controller.configure(enabled_v()).is_ok());
        rig.controller.release_delay.on_change(true);
        assert_eq!(rig.announced.recv_timeout(Duration::from_secs(2)), Ok(true));
        assert!(rig.controller.configure(enabled_v()).is_ok());
        assert!(rig
            .announced
            .recv_timeout(Duration::from_millis(50))
            .is_err());
    }

    struct OverlapProbeHook {
        entered: mpsc::Sender<()>,
        calls: AtomicUsize,
        overlapped: Mutex<bool>,
        inside: AtomicUsize,
    }

    impl InputHook for OverlapProbeHook {
        fn configure(&self, _config: PushToTalkConfig) -> Result<(), PushToTalkError> {
            let inside = self.inside.fetch_add(1, Ordering::SeqCst) + 1;
            let first_call = self.calls.fetch_add(1, Ordering::SeqCst) == 0;
            let _ = self.entered.send(());
            if first_call {
                std::thread::sleep(Duration::from_millis(300));
            }
            if inside > 1 || self.inside.load(Ordering::SeqCst) > 1 {
                *self
                    .overlapped
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner) = true;
            }
            self.inside.fetch_sub(1, Ordering::SeqCst);
            Ok(())
        }

        fn capture(&self, _timeout: Duration) -> Result<Option<Binding>, PushToTalkError> {
            Ok(None)
        }
    }

    #[test]
    fn two_concurrent_configures_never_run_inside_the_hook_at_the_same_time() {
        let (entered_sender, entered) = mpsc::channel();
        let hook = Arc::new(OverlapProbeHook {
            entered: entered_sender,
            calls: AtomicUsize::new(0),
            overlapped: Mutex::new(false),
            inside: AtomicUsize::new(0),
        });
        let shared_hook = Arc::clone(&hook);
        let factory: HookFactory<ProbeHandle> =
            Box::new(move |_on_change| Ok(ProbeHandle(Arc::clone(&shared_hook))));
        let controller = Arc::new(PttController::new(factory, Arc::new(|_| {}), || {}));
        let first = Arc::clone(&controller);
        let first_thread = std::thread::spawn(move || first.configure(enabled_v()));
        assert!(entered.recv_timeout(Duration::from_secs(2)).is_ok());
        let other = PushToTalkConfig {
            enabled: true,
            binding: Some(Binding::new(BindingKind::Key, 48)),
        };
        let second = Arc::clone(&controller);
        let second_thread = std::thread::spawn(move || second.configure(other));
        assert!(first_thread.join().is_ok());
        assert!(second_thread.join().is_ok());
        assert!(!*hook
            .overlapped
            .lock()
            .unwrap_or_else(PoisonError::into_inner));
    }

    struct ProbeHandle(Arc<OverlapProbeHook>);

    impl InputHook for ProbeHandle {
        fn configure(&self, config: PushToTalkConfig) -> Result<(), PushToTalkError> {
            self.0.configure(config)
        }

        fn capture(&self, timeout: Duration) -> Result<Option<Binding>, PushToTalkError> {
            self.0.capture(timeout)
        }
    }
}
