use crate::binding::Binding;
use crate::input::InputEvent;

#[derive(Debug, Default)]
pub struct PressState {
    binding: Option<Binding>,
    pressed: bool,
}

impl PressState {
    pub fn configure(&mut self, binding: Option<Binding>) -> Option<bool> {
        let unchanged = match (&self.binding, &binding) {
            (Some(current), Some(next)) => current.same_input(next.kind, next.code),
            (None, None) => true,
            _ => false,
        };
        self.binding = binding;
        if unchanged || !self.pressed {
            return None;
        }
        self.pressed = false;
        Some(false)
    }

    pub fn on_event(&mut self, event: &InputEvent) -> Option<bool> {
        let binding = self.binding.as_ref()?;
        if !binding.same_input(event.kind, event.code) || self.pressed == event.down {
            return None;
        }
        self.pressed = event.down;
        Some(event.down)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::binding::BindingKind;

    fn key(code: u16, down: bool) -> InputEvent {
        InputEvent {
            kind: BindingKind::Key,
            code,
            down,
        }
    }

    fn bound_to_v() -> PressState {
        let mut state = PressState::default();
        state.configure(Some(Binding::new(BindingKind::Key, 47)));
        state
    }

    #[test]
    fn reports_press_and_release_of_the_bound_key() {
        let mut state = bound_to_v();
        assert_eq!(state.on_event(&key(47, true)), Some(true));
        assert_eq!(state.on_event(&key(47, false)), Some(false));
    }

    #[test]
    fn key_repeat_is_not_a_new_press() {
        let mut state = bound_to_v();
        state.on_event(&key(47, true));
        assert_eq!(state.on_event(&key(47, true)), None);
        assert_eq!(state.on_event(&key(47, true)), None);
    }

    #[test]
    fn release_without_press_is_ignored() {
        let mut state = bound_to_v();
        assert_eq!(state.on_event(&key(47, false)), None);
    }

    #[test]
    fn other_keys_and_other_kinds_are_ignored() {
        let mut state = bound_to_v();
        assert_eq!(state.on_event(&key(48, true)), None);
        let mouse = InputEvent {
            kind: BindingKind::Mouse,
            code: 47,
            down: true,
        };
        assert_eq!(state.on_event(&mouse), None);
    }

    #[test]
    fn nothing_is_reported_without_a_binding() {
        let mut state = PressState::default();
        assert_eq!(state.on_event(&key(47, true)), None);
    }

    #[test]
    fn changing_the_binding_while_pressed_releases() {
        let mut state = bound_to_v();
        state.on_event(&key(47, true));
        let released = state.configure(Some(Binding::new(BindingKind::Key, 48)));
        assert_eq!(released, Some(false));
        assert_eq!(state.on_event(&key(47, false)), None);
    }

    #[test]
    fn removing_the_binding_while_pressed_releases() {
        let mut state = bound_to_v();
        state.on_event(&key(47, true));
        assert_eq!(state.configure(None), Some(false));
    }

    #[test]
    fn configuring_the_same_binding_while_pressed_keeps_it_pressed() {
        let mut state = bound_to_v();
        state.on_event(&key(47, true));
        assert_eq!(
            state.configure(Some(Binding::new(BindingKind::Key, 47))),
            None
        );
        assert_eq!(state.on_event(&key(47, false)), Some(false));
    }

    #[test]
    fn changing_the_binding_while_released_reports_nothing() {
        let mut state = bound_to_v();
        assert_eq!(
            state.configure(Some(Binding::new(BindingKind::Key, 48))),
            None
        );
        assert_eq!(state.on_event(&key(48, true)), Some(true));
    }
}
