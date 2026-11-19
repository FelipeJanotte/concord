use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::UI::Shell::{
    ITaskbarList3, TaskbarList, THBF_ENABLED, THBF_HIDDEN, THB_FLAGS, THB_ICON, THB_TOOLTIP,
    THUMBBUTTON, THUMBBUTTONMASK,
};

use crate::action::{ThumbAction, SLOT_COUNT};
use crate::error::TaskbarError;
use crate::plan::{ButtonPlan, PlanKind, SlotPlan};
use crate::win::icon::OwnedIcon;

pub struct Taskbar(ITaskbarList3);

impl Taskbar {
    pub fn create() -> Result<Taskbar, TaskbarError> {
        let list: ITaskbarList3 =
            unsafe { CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER) }?;
        unsafe { list.HrInit() }?;
        Ok(Taskbar(list))
    }

    pub fn apply(
        &self,
        window: HWND,
        plan: &ButtonPlan<'_>,
        icons: &[Option<OwnedIcon>; SLOT_COUNT],
    ) -> Result<(), TaskbarError> {
        let buttons: [THUMBBUTTON; SLOT_COUNT] = std::array::from_fn(|slot| {
            thumb_button(
                ThumbAction::ALL[slot],
                &plan.slots[slot],
                icons[slot].as_ref(),
            )
        });
        match plan.kind {
            PlanKind::Add => unsafe { self.0.ThumbBarAddButtons(window, &buttons) }?,
            PlanKind::Update => unsafe { self.0.ThumbBarUpdateButtons(window, &buttons) }?,
        }
        Ok(())
    }
}

fn thumb_button(action: ThumbAction, slot: &SlotPlan<'_>, icon: Option<&OwnedIcon>) -> THUMBBUTTON {
    let mut button = THUMBBUTTON {
        dwMask: THB_FLAGS,
        iId: action.button_id(),
        dwFlags: THBF_HIDDEN,
        ..Default::default()
    };
    if let (SlotPlan::Visible(visible), Some(icon)) = (slot, icon) {
        button.dwMask = THUMBBUTTONMASK(THB_FLAGS.0 | THB_ICON.0 | THB_TOOLTIP.0);
        button.dwFlags = THBF_ENABLED;
        button.hIcon = icon.handle();
        write_tooltip(&mut button.szTip, &visible.tooltip);
    }
    button
}

fn write_tooltip(target: &mut [u16], tooltip: &str) {
    let capacity = target.len() - 1;
    for (slot, unit) in target.iter_mut().zip(tooltip.encode_utf16().take(capacity)) {
        *slot = unit;
    }
}
