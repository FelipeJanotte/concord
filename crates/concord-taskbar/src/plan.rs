use crate::action::{ThumbAction, SLOT_COUNT};
use crate::button::ThumbButton;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlanKind {
    Add,
    Update,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SlotPlan<'a> {
    Hidden,
    Visible(&'a ThumbButton),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ButtonPlan<'a> {
    pub kind: PlanKind,
    pub slots: [SlotPlan<'a>; SLOT_COUNT],
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolbarState {
    NotAdded,
    Added,
}

pub fn plan_buttons(buttons: &[ThumbButton], toolbar: ToolbarState) -> Option<ButtonPlan<'_>> {
    if buttons.is_empty() && toolbar == ToolbarState::NotAdded {
        return None;
    }
    let slots = ThumbAction::ALL.map(|action| {
        buttons
            .iter()
            .find(|button| button.action == action)
            .map_or(SlotPlan::Hidden, SlotPlan::Visible)
    });
    let kind = match toolbar {
        ToolbarState::Added => PlanKind::Update,
        ToolbarState::NotAdded => PlanKind::Add,
    };
    Some(ButtonPlan { kind, slots })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn button(action: ThumbAction) -> ThumbButton {
        ThumbButton {
            action,
            tooltip: String::from("x"),
            icon_png: Vec::new(),
        }
    }

    #[test]
    fn nothing_to_show_and_nothing_added_plans_nothing() {
        assert_eq!(plan_buttons(&[], ToolbarState::NotAdded), None);
    }

    #[test]
    fn first_buttons_are_added() {
        let buttons = [button(ThumbAction::Mute)];
        assert_eq!(
            plan_buttons(&buttons, ToolbarState::NotAdded).map(|p| p.kind),
            Some(PlanKind::Add)
        );
    }

    #[test]
    fn later_buttons_are_updated() {
        let buttons = [button(ThumbAction::Mute)];
        assert_eq!(
            plan_buttons(&buttons, ToolbarState::Added).map(|p| p.kind),
            Some(PlanKind::Update)
        );
    }

    #[test]
    fn empty_after_added_hides_every_slot() {
        let plan = plan_buttons(&[], ToolbarState::Added);
        assert_eq!(
            plan,
            Some(ButtonPlan {
                kind: PlanKind::Update,
                slots: [SlotPlan::Hidden, SlotPlan::Hidden, SlotPlan::Hidden],
            })
        );
    }

    #[test]
    fn buttons_land_in_their_action_slot_regardless_of_order() {
        let buttons = [button(ThumbAction::Leave), button(ThumbAction::Mute)];
        let plan = plan_buttons(&buttons, ToolbarState::Added).expect("plan");
        assert_eq!(plan.slots[0], SlotPlan::Visible(&buttons[1]));
        assert_eq!(plan.slots[1], SlotPlan::Hidden);
        assert_eq!(plan.slots[2], SlotPlan::Visible(&buttons[0]));
    }
}
