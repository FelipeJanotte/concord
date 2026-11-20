use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::Value;

use super::controller::{OverlayController, OverlayEnvironment};
use super::model::{OverlayConfig, OverlayPosition, OverlayRoom};
use super::settle::Settling;
use super::shortcuts::{OverlayShortcutStatus, OverlayShortcuts, ShortcutAction};

const MOVE_SETTLE_DELAY: Duration = Duration::from_millis(250);
const SHORTCUTS_ANSWER_LIMIT: Duration = Duration::from_secs(2);

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum ShortcutsError {
    #[error("O overlay não respondeu a tempo ao registrar os atalhos")]
    TimedOut,
    #[error("O overlay foi encerrado antes de registrar os atalhos")]
    WorkerStopped,
}

enum Message {
    Config(OverlayConfig),
    Room(Option<OverlayRoom>),
    MainFocused(bool),
    Editing(bool),
    Resize {
        width: f64,
        done: bool,
    },
    Theme(Value),
    Moved(OverlayPosition),
    PageLoaded,
    Shortcuts {
        shortcuts: OverlayShortcuts,
        reply: Sender<OverlayShortcutStatus>,
    },
    PauseShortcuts(bool),
    Run(ShortcutAction),
    Stop,
}

#[derive(Clone)]
pub struct OverlayHandle {
    sender: Sender<Message>,
}

impl OverlayHandle {
    fn send(&self, message: Message) {
        if self.sender.send(message).is_err() {
            log::warn!("overlay parado: mensagem descartada");
        }
    }

    pub fn set_config(&self, config: OverlayConfig) {
        self.send(Message::Config(config));
    }

    pub fn set_room(&self, room: Option<OverlayRoom>) {
        self.send(Message::Room(room));
    }

    pub fn set_main_focused(&self, focused: bool) {
        self.send(Message::MainFocused(focused));
    }

    pub fn set_editing(&self, editing: bool) {
        self.send(Message::Editing(editing));
    }

    pub fn resize(&self, width: f64, done: bool) {
        self.send(Message::Resize { width, done });
    }

    pub fn set_theme(&self, theme: Value) {
        self.send(Message::Theme(theme));
    }

    pub fn moved(&self, position: OverlayPosition) {
        self.send(Message::Moved(position));
    }

    pub fn page_loaded(&self) {
        self.send(Message::PageLoaded);
    }

    pub fn pause_shortcuts(&self, paused: bool) {
        self.send(Message::PauseShortcuts(paused));
    }

    pub fn run(&self, action: ShortcutAction) {
        self.send(Message::Run(action));
    }

    pub fn stop(&self) {
        self.send(Message::Stop);
    }

    pub fn set_shortcuts(
        &self,
        shortcuts: OverlayShortcuts,
    ) -> Result<OverlayShortcutStatus, ShortcutsError> {
        self.set_shortcuts_within(shortcuts, SHORTCUTS_ANSWER_LIMIT)
    }

    fn set_shortcuts_within(
        &self,
        shortcuts: OverlayShortcuts,
        limit: Duration,
    ) -> Result<OverlayShortcutStatus, ShortcutsError> {
        let (reply, answer) = mpsc::channel();
        self.send(Message::Shortcuts { shortcuts, reply });
        answer.recv_timeout(limit).map_err(|error| match error {
            RecvTimeoutError::Timeout => ShortcutsError::TimedOut,
            RecvTimeoutError::Disconnected => ShortcutsError::WorkerStopped,
        })
    }
}

pub fn spawn<E, B>(build_environment: B) -> OverlayHandle
where
    E: OverlayEnvironment,
    B: FnOnce(OverlayHandle) -> E + Send + 'static,
{
    let (sender, receiver) = mpsc::channel();
    let handle = OverlayHandle { sender };
    let worker_handle = handle.clone();
    thread::spawn(move || {
        let controller = OverlayController::new(build_environment(worker_handle));
        serve(controller, &receiver);
    });
    handle
}

fn serve<E: OverlayEnvironment>(
    mut controller: OverlayController<E>,
    receiver: &Receiver<Message>,
) {
    let mut settling = Settling::new(MOVE_SETTLE_DELAY);
    loop {
        let received = match settling.deadline() {
            Some(deadline) => {
                receiver.recv_timeout(deadline.saturating_duration_since(Instant::now()))
            }
            None => receiver.recv().map_err(|_| RecvTimeoutError::Disconnected),
        };
        match received {
            Ok(Message::Stop) | Err(RecvTimeoutError::Disconnected) => {
                controller.stop();
                return;
            }
            Ok(message) => apply(&mut controller, &mut settling, message),
            Err(RecvTimeoutError::Timeout) => {}
        }
        if let Some(position) = settling.take_settled(Instant::now()) {
            controller.moved(position);
        }
    }
}

fn apply<E: OverlayEnvironment>(
    controller: &mut OverlayController<E>,
    settling: &mut Settling<OverlayPosition>,
    message: Message,
) {
    match message {
        Message::Config(config) => controller.set_config(config),
        Message::Room(room) => controller.set_room(room),
        Message::MainFocused(focused) => controller.set_main_focused(focused),
        Message::Editing(editing) => controller.set_editing(editing),
        Message::Resize { width, done } => controller.resize(width, done),
        Message::Theme(theme) => controller.set_theme(theme),
        Message::Moved(position) => settling.push(position, Instant::now()),
        Message::PageLoaded => controller.page_loaded(),
        Message::Shortcuts { shortcuts, reply } => {
            if reply.send(controller.set_shortcuts(shortcuts)).is_err() {
                log::warn!("quem pediu os atalhos do overlay não espera mais a resposta");
            }
        }
        Message::PauseShortcuts(paused) => controller.pause_shortcuts(paused),
        Message::Run(action) => controller.run(action),
        Message::Stop => {}
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;
    use crate::native::overlay::controller::{OverlayWindow, Screen};
    use crate::native::overlay::geometry::Rect;
    use crate::native::overlay::model::{OverlayCorner, OverlaySize, OverlayUpdate};

    struct SilentWindow;

    impl OverlayWindow for SilentWindow {
        fn set_bounds(&self, _bounds: Rect) {}
        fn show_inactive(&self) {}
        fn hide(&self) {}
        fn send_state(&self, _update: &OverlayUpdate) {}
        fn send_theme(&self, _theme: &Value) {}
        fn set_interactive(&self, _interactive: bool) {}
        fn destroy(self) {}
    }

    struct CountingEnvironment {
        moves: Arc<Mutex<Vec<OverlayPosition>>>,
    }

    impl OverlayEnvironment for CountingEnvironment {
        type Window = SilentWindow;
        fn create_window(&self) -> Option<SilentWindow> {
            Some(SilentWindow)
        }
        fn screen_at(&self, _point: Option<OverlayPosition>) -> Screen {
            Screen {
                work_area: Rect {
                    x: 0,
                    y: 0,
                    width: 1920,
                    height: 1040,
                },
                scale: 1.0,
            }
        }
        fn notify_toggled(&self, _enabled: bool) {}
        fn notify_editing(&self, _editing: bool) {}
        fn notify_moved(&self, position: OverlayPosition) {
            if let Ok(mut moves) = self.moves.lock() {
                moves.push(position);
            }
        }
        fn notify_resized(&self, _width: f64) {}
        fn register_shortcut(&self, _accelerator: &str, _action: ShortcutAction) -> bool {
            true
        }
        fn remember_foreground(&self) {}
        fn return_foreground(&self) {}
        fn unregister_shortcut(&self, _accelerator: &str) {}
    }

    fn recorded_moves(moves: &Arc<Mutex<Vec<OverlayPosition>>>) -> Vec<OverlayPosition> {
        moves.lock().map(|moves| moves.clone()).unwrap_or_default()
    }

    #[test]
    fn a_burst_of_moves_is_saved_once_with_the_last_position() {
        let moves = Arc::new(Mutex::new(Vec::new()));
        let environment_moves = Arc::clone(&moves);
        let handle = spawn(move |_| CountingEnvironment {
            moves: environment_moves,
        });
        handle.set_config(OverlayConfig {
            enabled: true,
            corner: OverlayCorner::TopLeft,
            size: OverlaySize::Medium,
            position: None,
            width: None,
        });
        handle.set_editing(true);
        for step in 1..=5 {
            handle.moved(OverlayPosition {
                x: 100.0 * f64::from(step),
                y: 50.0,
            });
            thread::sleep(Duration::from_millis(30));
        }
        assert!(recorded_moves(&moves).is_empty());
        thread::sleep(Duration::from_millis(400));
        assert_eq!(
            recorded_moves(&moves),
            vec![OverlayPosition { x: 500.0, y: 50.0 }]
        );
        handle.stop();
    }

    struct BlockedEnvironment {
        release: Mutex<Receiver<()>>,
    }

    impl OverlayEnvironment for BlockedEnvironment {
        type Window = SilentWindow;
        fn create_window(&self) -> Option<SilentWindow> {
            None
        }
        fn screen_at(&self, _point: Option<OverlayPosition>) -> Screen {
            Screen {
                work_area: Rect {
                    x: 0,
                    y: 0,
                    width: 1920,
                    height: 1040,
                },
                scale: 1.0,
            }
        }
        fn notify_toggled(&self, _enabled: bool) {}
        fn notify_editing(&self, _editing: bool) {}
        fn notify_moved(&self, _position: OverlayPosition) {}
        fn notify_resized(&self, _width: f64) {}
        fn register_shortcut(&self, _accelerator: &str, _action: ShortcutAction) -> bool {
            if let Ok(release) = self.release.lock() {
                release.recv().ok();
            }
            true
        }
        fn remember_foreground(&self) {}
        fn return_foreground(&self) {}
        fn unregister_shortcut(&self, _accelerator: &str) {}
    }

    #[test]
    fn a_worker_that_never_answers_makes_the_shortcut_request_time_out() {
        let (release, blocked) = mpsc::channel();
        let handle = spawn(move |_| BlockedEnvironment {
            release: Mutex::new(blocked),
        });
        let outcome =
            handle.set_shortcuts_within(OverlayShortcuts::default(), Duration::from_millis(50));
        assert_eq!(outcome, Err(ShortcutsError::TimedOut));
        drop(release);
        handle.stop();
    }

    #[test]
    fn a_stopped_worker_is_reported_as_stopped() {
        let handle = spawn(|_| CountingEnvironment {
            moves: Arc::default(),
        });
        handle.stop();
        thread::sleep(Duration::from_millis(100));
        let outcome =
            handle.set_shortcuts_within(OverlayShortcuts::default(), Duration::from_secs(1));
        assert_eq!(outcome, Err(ShortcutsError::WorkerStopped));
    }

    #[test]
    fn shortcut_status_comes_back_to_the_caller() {
        let handle = spawn(|_| CountingEnvironment {
            moves: Arc::default(),
        });
        let status = handle.set_shortcuts(OverlayShortcuts::default());
        assert_eq!(
            status,
            Ok(OverlayShortcutStatus {
                toggle: true,
                edit: true
            })
        );
        handle.stop();
    }
}
