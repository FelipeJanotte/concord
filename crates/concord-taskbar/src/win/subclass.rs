use std::cell::{Cell, RefCell};
use std::ffi::c_void;
use std::rc::Rc;

use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Shell::{
    DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass, THBN_CLICKED,
};
use windows::Win32::UI::WindowsAndMessaging::{
    IsWindowVisible, RegisterWindowMessageW, WM_COMMAND, WM_NCDESTROY,
};

use crate::action::{ThumbAction, SLOT_COUNT};
use crate::button::ThumbButton;
use crate::error::TaskbarError;
use crate::plan::{plan_buttons, SlotPlan};
use crate::win::icon::OwnedIcon;
use crate::win::taskbar::Taskbar;

const SUBCLASS_ID: usize = 1;

struct State {
    window: HWND,
    button_created_message: u32,
    on_click: Box<dyn Fn(ThumbAction) + Send>,
    on_error: Box<dyn Fn(TaskbarError)>,
    buttons: RefCell<Vec<ThumbButton>>,
    taskbar: RefCell<Option<Taskbar>>,
    toolbar_added: Cell<bool>,
    icons: RefCell<[Option<OwnedIcon>; SLOT_COUNT]>,
    subclassed: Cell<bool>,
}

impl State {
    fn apply(&self) -> Result<(), TaskbarError> {
        let taskbar = self.taskbar.borrow();
        let Some(taskbar) = taskbar.as_ref() else {
            return Ok(());
        };
        let buttons = self.buttons.borrow();
        let Some(plan) = plan_buttons(&buttons, self.toolbar_added.get()) else {
            return Ok(());
        };
        let mut icons: [Option<OwnedIcon>; SLOT_COUNT] = [None, None, None];
        for (icon, slot) in icons.iter_mut().zip(&plan.slots) {
            if let SlotPlan::Visible(button) = slot {
                *icon = Some(OwnedIcon::from_png(&button.icon_png)?);
            }
        }
        taskbar.apply(self.window, &plan, &icons)?;
        self.toolbar_added.set(true);
        *self.icons.borrow_mut() = icons;
        Ok(())
    }

    fn rebuild_after_button_created(&self) -> Result<(), TaskbarError> {
        *self.taskbar.borrow_mut() = Some(Taskbar::create()?);
        self.toolbar_added.set(false);
        self.apply()
    }

    fn detach(&self) {
        if !self.subclassed.replace(false) {
            return;
        }
        unsafe {
            let _ = RemoveWindowSubclass(self.window, Some(subclass_proc), SUBCLASS_ID);
            drop(Rc::from_raw(self as *const State));
        }
    }
}

pub struct ThumbBar {
    state: Rc<State>,
}

impl ThumbBar {
    pub fn attach(
        hwnd: isize,
        on_click: impl Fn(ThumbAction) + Send + 'static,
        on_error: impl Fn(TaskbarError) + 'static,
    ) -> Result<ThumbBar, TaskbarError> {
        let window = HWND(hwnd as *mut c_void);
        let button_created_message = unsafe { RegisterWindowMessageW(w!("TaskbarButtonCreated")) };
        if button_created_message == 0 {
            return Err(windows::core::Error::from_thread().into());
        }
        let taskbar = if unsafe { IsWindowVisible(window) }.as_bool() {
            Some(Taskbar::create()?)
        } else {
            None
        };
        let state = Rc::new(State {
            window,
            button_created_message,
            on_click: Box::new(on_click),
            on_error: Box::new(on_error),
            buttons: RefCell::new(Vec::new()),
            taskbar: RefCell::new(taskbar),
            toolbar_added: Cell::new(false),
            icons: RefCell::new([None, None, None]),
            subclassed: Cell::new(false),
        });
        let leaked = Rc::into_raw(Rc::clone(&state));
        let installed =
            unsafe { SetWindowSubclass(window, Some(subclass_proc), SUBCLASS_ID, leaked as usize) };
        if !installed.as_bool() {
            drop(unsafe { Rc::from_raw(leaked) });
            return Err(windows::core::Error::from_thread().into());
        }
        state.subclassed.set(true);
        Ok(ThumbBar { state })
    }

    pub fn set_buttons(&self, buttons: Vec<ThumbButton>) -> Result<(), TaskbarError> {
        *self.state.buttons.borrow_mut() = buttons;
        self.state.apply()
    }
}

impl Drop for ThumbBar {
    fn drop(&mut self) {
        self.state.detach();
    }
}

unsafe extern "system" fn subclass_proc(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _subclass_id: usize,
    state_pointer: usize,
) -> LRESULT {
    let state = {
        let pointer = state_pointer as *const State;
        Rc::increment_strong_count(pointer);
        Rc::from_raw(pointer)
    };
    if message == state.button_created_message {
        if let Err(error) = state.rebuild_after_button_created() {
            (state.on_error)(error);
        }
    } else if message == WM_COMMAND && clicked_action(wparam).is_some() {
        if let Some(action) = clicked_action(wparam) {
            (state.on_click)(action);
        }
        return LRESULT(0);
    } else if message == WM_NCDESTROY {
        state.detach();
    }
    DefSubclassProc(window, message, wparam, lparam)
}

fn clicked_action(wparam: WPARAM) -> Option<ThumbAction> {
    let notification = ((wparam.0 >> 16) & 0xffff) as u32;
    let id = (wparam.0 & 0xffff) as u32;
    if notification == THBN_CLICKED {
        ThumbAction::from_button_id(id)
    } else {
        None
    }
}
