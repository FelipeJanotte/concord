#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThumbAction {
    Mute,
    Deafen,
    Leave,
}

pub const SLOT_COUNT: usize = 3;

impl ThumbAction {
    pub const ALL: [ThumbAction; SLOT_COUNT] =
        [ThumbAction::Mute, ThumbAction::Deafen, ThumbAction::Leave];

    pub fn button_id(self) -> u32 {
        match self {
            ThumbAction::Mute => 0,
            ThumbAction::Deafen => 1,
            ThumbAction::Leave => 2,
        }
    }

    pub fn from_button_id(id: u32) -> Option<ThumbAction> {
        ThumbAction::ALL
            .into_iter()
            .find(|action| action.button_id() == id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_action_round_trips_through_its_button_id() {
        for action in ThumbAction::ALL {
            assert_eq!(
                ThumbAction::from_button_id(action.button_id()),
                Some(action)
            );
        }
    }

    #[test]
    fn unknown_button_id_maps_to_nothing() {
        assert_eq!(ThumbAction::from_button_id(SLOT_COUNT as u32), None);
    }

    #[test]
    fn button_ids_are_distinct() {
        let mut ids: Vec<u32> = ThumbAction::ALL.iter().map(|a| a.button_id()).collect();
        ids.dedup();
        assert_eq!(ids.len(), SLOT_COUNT);
    }
}
