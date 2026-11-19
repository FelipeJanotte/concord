use crate::binding::Binding;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PushToTalkConfig {
    pub enabled: bool,
    pub binding: Option<Binding>,
}

impl PushToTalkConfig {
    pub fn active_binding(&self) -> Option<Binding> {
        self.binding.clone().filter(|_| self.enabled)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::binding::BindingKind;

    #[test]
    fn disabled_config_has_no_active_binding() {
        let binding = Some(Binding::new(BindingKind::Key, 47));
        let disabled = PushToTalkConfig {
            enabled: false,
            binding: binding.clone(),
        };
        let enabled = PushToTalkConfig {
            enabled: true,
            binding: binding.clone(),
        };
        assert_eq!(disabled.active_binding(), None);
        assert_eq!(enabled.active_binding(), binding);
    }
}
