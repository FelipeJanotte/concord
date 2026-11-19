use serde_json::Value;

use super::geometry::{self, Rect};
use super::model::{clean_width, OverlayConfig, OverlayPosition, OverlayRoom, OverlayUpdate};
use super::shortcuts::{OverlayShortcutStatus, OverlayShortcuts, ShortcutAction};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Screen {
    pub work_area: Rect,
    pub scale: f64,
}

pub trait OverlayWindow {
    fn set_bounds(&self, bounds: Rect);
    fn show_inactive(&self);
    fn hide(&self);
    fn send_state(&self, update: &OverlayUpdate);
    fn send_theme(&self, theme: &Value);
    fn set_interactive(&self, interactive: bool);
    fn destroy(self);
}

pub trait OverlayEnvironment {
    type Window: OverlayWindow;
    fn create_window(&self) -> Option<Self::Window>;
    fn screen_at(&self, point: Option<OverlayPosition>) -> Screen;
    fn notify_toggled(&self, enabled: bool);
    fn notify_editing(&self, editing: bool);
    fn notify_moved(&self, position: OverlayPosition);
    fn notify_resized(&self, width: f64);
    fn register_shortcut(&self, accelerator: &str, action: ShortcutAction) -> bool;
    fn unregister_shortcut(&self, accelerator: &str);
}

pub struct OverlayController<E: OverlayEnvironment> {
    environment: E,
    config: OverlayConfig,
    room: Option<OverlayRoom>,
    window: Option<E::Window>,
    shown: bool,
    editing: bool,
    main_focused: bool,
    theme: Option<Value>,
    shortcuts: OverlayShortcuts,
    registered: Vec<String>,
    last_bounds: Option<Rect>,
}

impl<E: OverlayEnvironment> OverlayController<E> {
    pub fn new(environment: E) -> Self {
        Self {
            environment,
            config: OverlayConfig::default(),
            room: None,
            window: None,
            shown: false,
            editing: false,
            main_focused: false,
            theme: None,
            shortcuts: OverlayShortcuts::default(),
            registered: Vec::new(),
            last_bounds: None,
        }
    }

    pub fn set_config(&mut self, config: OverlayConfig) {
        self.config = config.sanitized();
        if !self.config.enabled && self.editing {
            return self.set_editing(false);
        }
        self.update();
    }

    pub fn set_room(&mut self, room: Option<OverlayRoom>) {
        self.room = room.map(OverlayRoom::sanitized);
        self.update();
    }

    pub fn set_main_focused(&mut self, focused: bool) {
        if focused == self.main_focused {
            return;
        }
        self.main_focused = focused;
        self.update();
    }

    pub fn set_editing(&mut self, requested: bool) {
        let editing = requested && self.config.enabled;
        if editing == self.editing {
            return;
        }
        self.editing = editing;
        self.environment.notify_editing(editing);
        self.update();
        if let Some(window) = &self.window {
            window.set_interactive(editing);
        }
    }

    pub fn toggle(&mut self) {
        self.config.enabled = !self.config.enabled;
        self.environment.notify_toggled(self.config.enabled);
        if !self.config.enabled && self.editing {
            return self.set_editing(false);
        }
        self.update();
    }

    pub fn toggle_editing(&mut self) {
        if !self.config.enabled {
            self.config.enabled = true;
            self.environment.notify_toggled(true);
        }
        self.set_editing(!self.editing);
    }

    pub fn run(&mut self, action: ShortcutAction) {
        match action {
            ShortcutAction::Toggle => self.toggle(),
            ShortcutAction::Edit => self.toggle_editing(),
        }
    }

    pub fn set_shortcuts(&mut self, shortcuts: OverlayShortcuts) -> OverlayShortcutStatus {
        self.shortcuts = shortcuts.sanitized();
        self.register_shortcuts()
    }

    pub fn pause_shortcuts(&mut self, paused: bool) {
        if paused {
            self.release_shortcuts();
        } else {
            self.register_shortcuts();
        }
    }

    pub fn release_shortcuts(&mut self) {
        for accelerator in self.registered.drain(..) {
            self.environment.unregister_shortcut(&accelerator);
        }
    }

    pub fn resize(&mut self, width: f64, done: bool) {
        let Some(width) = clean_width(width) else {
            return;
        };
        if !self.editing {
            return;
        }
        self.config.width = Some(width);
        self.update();
        if done {
            self.environment.notify_resized(width);
        }
    }

    pub fn set_theme(&mut self, theme: Value) {
        if !theme.is_object() {
            return;
        }
        if let Some(window) = &self.window {
            window.send_theme(&theme);
        }
        self.theme = Some(theme);
    }

    pub fn moved(&mut self, position: OverlayPosition) {
        if !self.editing {
            return;
        }
        let applied = self.last_bounds.map(|bounds| (bounds.x, bounds.y));
        if applied == Some((position.x as i32, position.y as i32)) {
            return;
        }
        let Some(position) = position.sanitized() else {
            return;
        };
        self.config.position = Some(position);
        self.environment.notify_moved(position);
    }

    pub fn page_loaded(&self) {
        let Some(window) = &self.window else {
            return;
        };
        window.send_state(&self.update_payload());
        if let Some(theme) = &self.theme {
            window.send_theme(theme);
        }
    }

    pub fn stop(&mut self) {
        self.release_shortcuts();
        if let Some(window) = self.window.take() {
            window.destroy();
        }
        self.shown = false;
        self.editing = false;
    }

    fn update_payload(&self) -> OverlayUpdate<'_> {
        OverlayUpdate {
            room: self.room.as_ref(),
            config: &self.config,
            editing: self.editing,
        }
    }

    fn has_people(&self) -> bool {
        self.room
            .as_ref()
            .is_some_and(|room| !room.members.is_empty())
    }

    fn update(&mut self) {
        let visible = geometry::is_visible(
            self.config.enabled,
            self.has_people(),
            self.editing,
            self.main_focused,
        );
        if !visible {
            self.hide_window();
            return;
        }
        if self.window.is_none() {
            self.window = self.environment.create_window();
        }
        let rows = self.room.as_ref().map_or(1, OverlayRoom::rows);
        let screen = self.environment.screen_at(self.config.position);
        let bounds = geometry::bounds(
            screen.work_area,
            screen.scale,
            &self.config,
            rows,
            self.editing,
        );
        self.last_bounds = Some(bounds);
        let Some(window) = &self.window else {
            return;
        };
        window.set_bounds(bounds);
        window.send_state(&self.update_payload());
        if !self.shown {
            window.show_inactive();
            self.shown = true;
        }
    }

    fn hide_window(&mut self) {
        if let (true, Some(window)) = (self.shown, &self.window) {
            window.hide();
            self.shown = false;
        }
    }

    fn register_shortcuts(&mut self) -> OverlayShortcutStatus {
        self.release_shortcuts();
        let mut status = OverlayShortcutStatus {
            toggle: false,
            edit: false,
        };
        let entries = self.shortcuts.clone();
        for (action, accelerator) in entries.entries() {
            let registered = self.environment.register_shortcut(accelerator, action);
            if registered {
                self.registered.push(accelerator.to_owned());
            }
            match action {
                ShortcutAction::Toggle => status.toggle = registered,
                ShortcutAction::Edit => status.edit = registered,
            }
        }
        status
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::collections::HashSet;
    use std::rc::Rc;

    use serde_json::json;

    use super::*;
    use crate::native::overlay::geometry::height_for_lines;
    use crate::native::overlay::model::{OverlayCorner, OverlayMember, OverlaySize};

    const WORK_AREA: Rect = Rect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040,
    };

    #[derive(Debug, Clone, PartialEq)]
    enum Event {
        Created,
        Bounds(Rect),
        Shown,
        Hidden,
        State {
            members: Option<usize>,
            editing: bool,
            width: Option<f64>,
        },
        Theme(Value),
        Interactive(bool),
        Destroyed,
        Toggled(bool),
        Editing(bool),
        Moved(OverlayPosition),
        Resized(f64),
    }

    #[derive(Default)]
    struct World {
        events: Vec<Event>,
        registered: Vec<(String, ShortcutAction)>,
        taken: HashSet<String>,
        screen_requests: Vec<Option<OverlayPosition>>,
    }

    type SharedWorld = Rc<RefCell<World>>;

    struct FakeEnvironment(SharedWorld);
    struct FakeWindow(SharedWorld);

    fn record(world: &SharedWorld, event: Event) {
        world.borrow_mut().events.push(event);
    }

    impl OverlayWindow for FakeWindow {
        fn set_bounds(&self, bounds: Rect) {
            record(&self.0, Event::Bounds(bounds));
        }
        fn show_inactive(&self) {
            record(&self.0, Event::Shown);
        }
        fn hide(&self) {
            record(&self.0, Event::Hidden);
        }
        fn send_state(&self, update: &OverlayUpdate) {
            record(
                &self.0,
                Event::State {
                    members: update.room.map(|room| room.members.len()),
                    editing: update.editing,
                    width: update.config.width,
                },
            );
        }
        fn send_theme(&self, theme: &Value) {
            record(&self.0, Event::Theme(theme.clone()));
        }
        fn set_interactive(&self, interactive: bool) {
            record(&self.0, Event::Interactive(interactive));
        }
        fn destroy(self) {
            record(&self.0, Event::Destroyed);
        }
    }

    impl OverlayEnvironment for FakeEnvironment {
        type Window = FakeWindow;
        fn create_window(&self) -> Option<FakeWindow> {
            record(&self.0, Event::Created);
            Some(FakeWindow(Rc::clone(&self.0)))
        }
        fn screen_at(&self, point: Option<OverlayPosition>) -> Screen {
            self.0.borrow_mut().screen_requests.push(point);
            Screen {
                work_area: WORK_AREA,
                scale: 1.0,
            }
        }
        fn notify_toggled(&self, enabled: bool) {
            record(&self.0, Event::Toggled(enabled));
        }
        fn notify_editing(&self, editing: bool) {
            record(&self.0, Event::Editing(editing));
        }
        fn notify_moved(&self, position: OverlayPosition) {
            record(&self.0, Event::Moved(position));
        }
        fn notify_resized(&self, width: f64) {
            record(&self.0, Event::Resized(width));
        }
        fn register_shortcut(&self, accelerator: &str, action: ShortcutAction) -> bool {
            let mut world = self.0.borrow_mut();
            if world.taken.contains(accelerator) {
                return false;
            }
            world.registered.push((accelerator.to_owned(), action));
            true
        }
        fn unregister_shortcut(&self, accelerator: &str) {
            self.0
                .borrow_mut()
                .registered
                .retain(|(registered, _)| registered != accelerator);
        }
    }

    fn setup() -> (OverlayController<FakeEnvironment>, SharedWorld) {
        let world = SharedWorld::default();
        (
            OverlayController::new(FakeEnvironment(Rc::clone(&world))),
            world,
        )
    }

    fn enabled(size: OverlaySize) -> OverlayConfig {
        OverlayConfig {
            enabled: true,
            corner: OverlayCorner::TopLeft,
            size,
            position: None,
            width: None,
        }
    }

    fn room(people: usize, more: u32) -> OverlayRoom {
        OverlayRoom {
            members: (0..people)
                .map(|index| OverlayMember {
                    id: format!("p{index}"),
                    name: format!("p{index}"),
                    avatar_url: None,
                    color: "#fff".into(),
                    speaking: false,
                    muted: false,
                    deafened: false,
                })
                .collect(),
            more,
        }
    }

    fn count(world: &SharedWorld, wanted: &Event) -> usize {
        world
            .borrow()
            .events
            .iter()
            .filter(|event| *event == wanted)
            .count()
    }

    fn last_bounds(world: &SharedWorld) -> Option<Rect> {
        world
            .borrow()
            .events
            .iter()
            .rev()
            .find_map(|event| match event {
                Event::Bounds(bounds) => Some(*bounds),
                _ => None,
            })
    }

    fn is_shown(world: &SharedWorld) -> bool {
        world
            .borrow()
            .events
            .iter()
            .rev()
            .find_map(|event| match event {
                Event::Shown => Some(true),
                Event::Hidden => Some(false),
                _ => None,
            })
            .unwrap_or(false)
    }

    fn last_notified_editing(world: &SharedWorld) -> Option<bool> {
        world
            .borrow()
            .events
            .iter()
            .rev()
            .find_map(|event| match event {
                Event::Editing(editing) => Some(*editing),
                _ => None,
            })
    }

    fn last_notified_toggled(world: &SharedWorld) -> Option<bool> {
        world
            .borrow()
            .events
            .iter()
            .rev()
            .find_map(|event| match event {
                Event::Toggled(enabled) => Some(*enabled),
                _ => None,
            })
    }

    fn registered_accelerators(world: &SharedWorld) -> Vec<String> {
        world
            .borrow()
            .registered
            .iter()
            .map(|(accelerator, _)| accelerator.clone())
            .collect()
    }

    fn press(controller: &mut OverlayController<FakeEnvironment>, world: &SharedWorld, key: &str) {
        let action = world
            .borrow()
            .registered
            .iter()
            .find(|(accelerator, _)| accelerator == key)
            .map(|(_, action)| *action);
        if let Some(action) = action {
            controller.run(action);
        }
    }

    fn shortcuts(toggle: &str, edit: &str) -> OverlayShortcuts {
        OverlayShortcuts {
            toggle: toggle.into(),
            edit: edit.into(),
        }
    }

    #[test]
    fn creates_and_shows_once_only_when_enabled_in_a_room_with_people() {
        let (mut controller, world) = setup();
        controller.set_room(Some(room(2, 0)));
        assert_eq!(count(&world, &Event::Created), 0);
        controller.set_config(enabled(OverlaySize::Medium));
        assert_eq!(count(&world, &Event::Created), 1);
        assert_eq!(
            last_bounds(&world).map(|bounds| (bounds.x, bounds.y, bounds.width)),
            Some((16, 16, 250))
        );
        assert_eq!(count(&world, &Event::Shown), 1);
        controller.set_room(Some(room(3, 0)));
        assert_eq!(count(&world, &Event::Created), 1);
        assert_eq!(count(&world, &Event::Shown), 1);
    }

    #[test]
    fn leaving_the_room_or_disabling_hides() {
        let (mut controller, world) = setup();
        controller.set_config(enabled(OverlaySize::Small));
        controller.set_room(Some(room(1, 0)));
        controller.set_room(None);
        assert_eq!(count(&world, &Event::Hidden), 1);
        controller.set_room(Some(room(1, 0)));
        controller.set_config(OverlayConfig {
            enabled: false,
            ..enabled(OverlaySize::Small)
        });
        assert_eq!(count(&world, &Event::Hidden), 2);
    }

    #[test]
    fn the_more_line_counts_as_one_more_row() {
        let (mut controller, world) = setup();
        controller.set_config(enabled(OverlaySize::Small));
        controller.set_room(Some(room(2, 5)));
        assert_eq!(
            last_bounds(&world).map(|bounds| bounds.height),
            Some(height_for_lines(OverlaySize::Small, 3))
        );
    }

    #[test]
    fn shortcut_toggles_notifies_and_stop_destroys_then_recreates() {
        let (mut controller, world) = setup();
        controller.set_room(Some(room(1, 0)));
        controller.toggle();
        assert_eq!(last_notified_toggled(&world), Some(true));
        assert_eq!(count(&world, &Event::Shown), 1);
        controller.toggle();
        assert_eq!(last_notified_toggled(&world), Some(false));
        assert_eq!(count(&world, &Event::Hidden), 1);
        controller.stop();
        assert_eq!(count(&world, &Event::Destroyed), 1);
        controller.toggle();
        assert_eq!(count(&world, &Event::Created), 2);
    }

    #[test]
    fn hides_when_main_gains_focus_and_returns_when_it_loses_it() {
        let (mut controller, world) = setup();
        controller.set_config(enabled(OverlaySize::Medium));
        controller.set_room(Some(room(1, 0)));
        assert!(is_shown(&world));
        controller.set_main_focused(true);
        assert!(!is_shown(&world));
        controller.set_room(Some(room(2, 0)));
        assert!(!is_shown(&world));
        controller.set_main_focused(false);
        assert!(is_shown(&world));
        assert!(world.borrow().events.contains(&Event::State {
            members: Some(2),
            editing: false,
            width: None
        }));
    }

    #[test]
    fn with_main_focused_the_window_is_not_created_but_move_mode_still_appears() {
        let (mut controller, world) = setup();
        controller.set_main_focused(true);
        controller.set_config(enabled(OverlaySize::Medium));
        controller.set_room(Some(room(1, 0)));
        assert_eq!(count(&world, &Event::Created), 0);
        controller.set_editing(true);
        assert!(is_shown(&world));
        controller.set_editing(false);
        assert!(!is_shown(&world));
    }

    #[test]
    fn dragged_position_picks_the_screen_where_it_is() {
        let (mut controller, world) = setup();
        controller.set_room(Some(room(1, 0)));
        controller.set_config(OverlayConfig {
            position: Some(OverlayPosition {
                x: -900.0,
                y: 100.0,
            }),
            ..enabled(OverlaySize::Medium)
        });
        assert_eq!(
            world.borrow().screen_requests.last().copied().flatten(),
            Some(OverlayPosition {
                x: -900.0,
                y: 100.0
            })
        );
    }

    #[test]
    fn move_mode_makes_the_window_interactive_and_tells_main_and_page() {
        let (mut controller, world) = setup();
        controller.set_config(enabled(OverlaySize::Medium));
        controller.set_room(Some(room(2, 0)));
        controller.set_editing(true);
        let events = world.borrow().events.clone();
        assert_eq!(events.last(), Some(&Event::Interactive(true)));
        assert!(events.contains(&Event::Editing(true)));
        assert!(events.contains(&Event::State {
            members: Some(2),
            editing: true,
            width: None
        }));
        controller.set_editing(false);
        assert_eq!(
            world.borrow().events.last(),
            Some(&Event::Interactive(false))
        );
        assert_eq!(last_notified_editing(&world), Some(false));
    }

    #[test]
    fn move_mode_shows_a_preview_outside_a_room_and_hides_when_done() {
        let (mut controller, world) = setup();
        controller.set_config(enabled(OverlaySize::Medium));
        assert_eq!(count(&world, &Event::Created), 0);
        controller.set_editing(true);
        assert!(is_shown(&world));
        assert!(world.borrow().events.contains(&Event::State {
            members: None,
            editing: true,
            width: None
        }));
        controller.set_editing(false);
        assert!(!is_shown(&world));
    }

    #[test]
    fn move_mode_needs_the_overlay_enabled_and_ends_when_it_is_disabled() {
        let (mut controller, world) = setup();
        controller.set_editing(true);
        assert_eq!(last_notified_editing(&world), None);
        controller.set_config(enabled(OverlaySize::Medium));
        controller.set_editing(true);
        controller.set_config(OverlayConfig {
            enabled: false,
            ..enabled(OverlaySize::Medium)
        });
        assert_eq!(last_notified_editing(&world), Some(false));
        controller.set_config(enabled(OverlaySize::Medium));
        controller.set_editing(true);
        controller.toggle();
        assert_eq!(last_notified_editing(&world), Some(false));
    }

    #[test]
    fn move_shortcut_enables_the_overlay_when_off_and_toggles_the_mode() {
        let (mut controller, world) = setup();
        controller.toggle_editing();
        assert_eq!(last_notified_toggled(&world), Some(true));
        assert_eq!(last_notified_editing(&world), Some(true));
        controller.toggle_editing();
        assert_eq!(last_notified_editing(&world), Some(false));
        assert_eq!(count(&world, &Event::Toggled(true)), 1);
        assert_eq!(count(&world, &Event::Toggled(false)), 0);
    }

    #[test]
    fn dropping_the_window_saves_the_position_only_in_move_mode() {
        let (mut controller, world) = setup();
        controller.set_config(enabled(OverlaySize::Medium));
        controller.set_room(Some(room(1, 0)));
        controller.moved(OverlayPosition { x: 300.0, y: 200.0 });
        assert_eq!(
            count(
                &world,
                &Event::Moved(OverlayPosition { x: 300.0, y: 200.0 })
            ),
            0
        );
        controller.set_editing(true);
        controller.moved(OverlayPosition { x: 300.4, y: 200.0 });
        assert!(world
            .borrow()
            .events
            .contains(&Event::Moved(OverlayPosition { x: 300.0, y: 200.0 })));
    }

    #[test]
    fn the_overlays_own_repositioning_is_not_a_drag() {
        let (mut controller, world) = setup();
        controller.set_config(enabled(OverlaySize::Medium));
        controller.set_room(Some(room(1, 0)));
        controller.set_editing(true);
        controller.moved(OverlayPosition { x: 16.0, y: 16.0 });
        assert!(!world
            .borrow()
            .events
            .iter()
            .any(|event| matches!(event, Event::Moved(_))));
    }

    #[test]
    fn registers_both_shortcuts_and_each_runs_its_action() {
        let (mut controller, world) = setup();
        let status = controller.set_shortcuts(shortcuts("Alt+1", "Alt+2"));
        assert_eq!(
            status,
            OverlayShortcutStatus {
                toggle: true,
                edit: true
            }
        );
        assert_eq!(registered_accelerators(&world), ["Alt+1", "Alt+2"]);
        press(&mut controller, &world, "Alt+1");
        assert_eq!(last_notified_toggled(&world), Some(true));
        press(&mut controller, &world, "Alt+2");
        assert_eq!(last_notified_editing(&world), Some(true));
    }

    #[test]
    fn changing_releases_the_old_ones_and_a_taken_one_reports_false() {
        let (mut controller, world) = setup();
        controller.set_shortcuts(shortcuts("Alt+1", "Alt+2"));
        world.borrow_mut().taken.insert("Ctrl+Shift+O".into());
        let status = controller.set_shortcuts(shortcuts("Ctrl+Shift+O", "Alt+3"));
        assert_eq!(
            status,
            OverlayShortcutStatus {
                toggle: false,
                edit: true
            }
        );
        assert_eq!(registered_accelerators(&world), ["Alt+3"]);
    }

    #[test]
    fn invalid_or_repeated_shortcuts_fall_back_to_the_defaults() {
        let (mut controller, world) = setup();
        controller.set_shortcuts(shortcuts("Alt+1", "Alt+1"));
        assert_eq!(
            registered_accelerators(&world),
            ["Shift+`", "CommandOrControl+Shift+`"]
        );
        controller.set_shortcuts(shortcuts("lixo", "lixo"));
        assert_eq!(
            registered_accelerators(&world),
            ["Shift+`", "CommandOrControl+Shift+`"]
        );
    }

    #[test]
    fn pausing_releases_and_resuming_registers_again() {
        let (mut controller, world) = setup();
        controller.set_shortcuts(shortcuts("Alt+1", "Alt+2"));
        controller.pause_shortcuts(true);
        assert!(registered_accelerators(&world).is_empty());
        controller.pause_shortcuts(false);
        assert_eq!(registered_accelerators(&world), ["Alt+1", "Alt+2"]);
        controller.pause_shortcuts(true);
        let status = controller.set_shortcuts(shortcuts("Alt+4", "Alt+5"));
        assert_eq!(
            status,
            OverlayShortcutStatus {
                toggle: true,
                edit: true
            }
        );
        assert_eq!(registered_accelerators(&world), ["Alt+4", "Alt+5"]);
        controller.release_shortcuts();
        assert!(registered_accelerators(&world).is_empty());
    }

    #[test]
    fn resizing_only_works_in_move_mode_and_notifies_when_done() {
        let (mut controller, world) = setup();
        controller.set_config(enabled(OverlaySize::Medium));
        controller.resize(400.0, true);
        assert_eq!(count(&world, &Event::Resized(400.0)), 0);
        controller.set_editing(true);
        controller.resize(380.4, false);
        assert_eq!(last_bounds(&world).map(|bounds| bounds.width), Some(380));
        assert!(!world
            .borrow()
            .events
            .iter()
            .any(|event| matches!(event, Event::Resized(_))));
        controller.resize(9_999.0, true);
        assert_eq!(last_bounds(&world).map(|bounds| bounds.width), Some(640));
        assert_eq!(count(&world, &Event::Resized(640.0)), 1);
        controller.resize(f64::NAN, true);
        assert_eq!(count(&world, &Event::Resized(640.0)), 1);
        assert_eq!(
            world
                .borrow()
                .events
                .iter()
                .filter(|event| matches!(event, Event::Resized(_)))
                .count(),
            1
        );
    }

    #[test]
    fn valid_theme_goes_to_the_open_window_and_is_kept_for_the_next_page_load() {
        let (mut controller, world) = setup();
        let theme = json!({ "base": "claro", "accent": "#ff0055" });
        controller.set_theme(theme.clone());
        assert_eq!(count(&world, &Event::Theme(theme.clone())), 0);
        controller.set_config(enabled(OverlaySize::Medium));
        controller.set_room(Some(room(1, 0)));
        controller.page_loaded();
        assert_eq!(count(&world, &Event::Theme(theme)), 1);
        let updated = json!({ "base": "claro", "accent": "#00aa55" });
        controller.set_theme(updated.clone());
        assert_eq!(count(&world, &Event::Theme(updated)), 1);
    }

    #[test]
    fn a_theme_that_is_not_an_object_is_ignored() {
        let (mut controller, world) = setup();
        controller.set_config(enabled(OverlaySize::Medium));
        controller.set_room(Some(room(1, 0)));
        controller.set_theme(json!("neon"));
        controller.page_loaded();
        assert!(!world
            .borrow()
            .events
            .iter()
            .any(|event| matches!(event, Event::Theme(_))));
    }
}
