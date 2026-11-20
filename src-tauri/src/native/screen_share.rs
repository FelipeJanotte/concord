use std::sync::{Mutex, MutexGuard, PoisonError};

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ScreenEndReason {
    Stopped,
    SourceClosed,
    Disconnected,
    Failed,
}

pub trait RunningShare: Send + 'static {
    fn stop(self);
}

#[derive(Debug, PartialEq, Eq)]
pub enum StartFailure<E> {
    Failed(E),
    EndedBeforeStart(ScreenEndReason),
    Cancelled,
}

pub enum EndOutcome<S> {
    Announce(ScreenEndReason, S),
    Ignore,
}

struct ActiveShare<S> {
    generation: u64,
    source_id: String,
    share: S,
}

struct Starting {
    generation: u64,
    ended: Option<ScreenEndReason>,
    cancelled: bool,
}

struct SlotState<S> {
    generation: u64,
    active: Option<ActiveShare<S>>,
    starting: Option<Starting>,
}

pub struct ShareSlot<S> {
    state: Mutex<SlotState<S>>,
}

impl<S> Default for ShareSlot<S> {
    fn default() -> Self {
        Self {
            state: Mutex::new(SlotState {
                generation: 0,
                active: None,
                starting: None,
            }),
        }
    }
}

impl<S: RunningShare> ShareSlot<S> {
    fn lock(&self) -> MutexGuard<'_, SlotState<S>> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn start<E>(
        &self,
        source_id: &str,
        start: impl FnOnce(u64) -> Result<S, E>,
    ) -> Result<(), StartFailure<E>> {
        let (generation, previous) = {
            let mut state = self.lock();
            state.generation += 1;
            let generation = state.generation;
            state.starting = Some(Starting {
                generation,
                ended: None,
                cancelled: false,
            });
            (generation, state.active.take())
        };
        if let Some(previous) = previous {
            previous.share.stop();
        }
        let started = start(generation);
        let mut state = self.lock();
        let starting = match state.starting.take() {
            Some(starting) if starting.generation == generation => Some(starting),
            other => {
                state.starting = other;
                None
            }
        };
        let share = started.map_err(StartFailure::Failed)?;
        let failure = match starting {
            None => Some(StartFailure::Cancelled),
            Some(Starting {
                cancelled: true, ..
            }) => Some(StartFailure::Cancelled),
            Some(Starting {
                ended: Some(reason),
                ..
            }) => Some(StartFailure::EndedBeforeStart(reason)),
            Some(_) => None,
        };
        if let Some(failure) = failure {
            drop(state);
            share.stop();
            return Err(failure);
        }
        state.active = Some(ActiveShare {
            generation,
            source_id: source_id.to_owned(),
            share,
        });
        Ok(())
    }

    pub fn end(&self, generation: u64, reason: ScreenEndReason) -> EndOutcome<S> {
        let mut state = self.lock();
        if let Some(starting) = state
            .starting
            .as_mut()
            .filter(|starting| starting.generation == generation)
        {
            starting.ended.get_or_insert(reason);
            return EndOutcome::Ignore;
        }
        match state.active.take() {
            Some(active) if active.generation == generation => {
                EndOutcome::Announce(reason, active.share)
            }
            other => {
                state.active = other;
                EndOutcome::Ignore
            }
        }
    }

    pub fn stop(&self) {
        let active = {
            let mut state = self.lock();
            if let Some(starting) = state.starting.as_mut() {
                starting.cancelled = true;
            }
            state.active.take()
        };
        if let Some(active) = active {
            active.share.stop();
        }
    }

    pub fn current_source(&self) -> Option<String> {
        self.lock()
            .active
            .as_ref()
            .map(|active| active.source_id.clone())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use super::*;

    type OnStop = Box<dyn FnOnce() + Send>;

    struct FakeShare {
        stops: Arc<AtomicUsize>,
        on_stop: Option<OnStop>,
    }

    impl RunningShare for FakeShare {
        fn stop(mut self) {
            self.stops.fetch_add(1, Ordering::SeqCst);
            if let Some(on_stop) = self.on_stop.take() {
                on_stop();
            }
        }
    }

    fn fake(stops: &Arc<AtomicUsize>) -> FakeShare {
        FakeShare {
            stops: Arc::clone(stops),
            on_stop: None,
        }
    }

    fn started(slot: &ShareSlot<FakeShare>, source_id: &str, stops: &Arc<AtomicUsize>) -> u64 {
        let mut started_generation = 0;
        let result = slot.start(source_id, |generation| {
            started_generation = generation;
            Ok::<_, ()>(fake(stops))
        });
        assert_eq!(result, Ok(()));
        started_generation
    }

    #[test]
    fn a_started_share_is_stored_with_its_source() {
        let slot = ShareSlot::default();
        let stops = Arc::new(AtomicUsize::new(0));
        started(&slot, "window:7", &stops);
        assert_eq!(slot.current_source().as_deref(), Some("window:7"));
        assert_eq!(stops.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn a_share_that_ends_before_start_returns_is_never_stored_and_start_fails() {
        let slot = Arc::new(ShareSlot::default());
        let stops = Arc::new(AtomicUsize::new(0));
        let ending_slot = Arc::clone(&slot);
        let result = slot.start("window:7", |generation| {
            assert!(matches!(
                ending_slot.end(generation, ScreenEndReason::SourceClosed),
                EndOutcome::Ignore
            ));
            Ok::<_, ()>(fake(&stops))
        });
        assert_eq!(
            result,
            Err(StartFailure::EndedBeforeStart(
                ScreenEndReason::SourceClosed
            ))
        );
        assert_eq!(slot.current_source(), None);
        assert_eq!(stops.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn the_end_of_the_active_share_is_announced_once_and_clears_the_slot() {
        let slot = ShareSlot::default();
        let stops = Arc::new(AtomicUsize::new(0));
        let generation = started(&slot, "screen:1", &stops);
        assert!(matches!(
            slot.end(generation, ScreenEndReason::Disconnected),
            EndOutcome::Announce(ScreenEndReason::Disconnected, _)
        ));
        assert_eq!(slot.current_source(), None);
        assert!(matches!(
            slot.end(generation, ScreenEndReason::Stopped),
            EndOutcome::Ignore
        ));
    }

    #[test]
    fn starting_again_stops_the_previous_share_and_ignores_its_end() {
        let slot = Arc::new(ShareSlot::default());
        let stops = Arc::new(AtomicUsize::new(0));
        let first_generation = Arc::new(AtomicUsize::new(0));
        let ignored = Arc::new(AtomicUsize::new(0));
        let ending_slot = Arc::clone(&slot);
        let first = Arc::clone(&first_generation);
        let ignored_ends = Arc::clone(&ignored);
        let mut previous = fake(&stops);
        previous.on_stop = Some(Box::new(move || {
            let generation = first.load(Ordering::SeqCst) as u64;
            if matches!(
                ending_slot.end(generation, ScreenEndReason::Stopped),
                EndOutcome::Ignore
            ) {
                ignored_ends.fetch_add(1, Ordering::SeqCst);
            }
        }));
        let result = slot.start("screen:1", |generation| {
            first_generation.store(generation as usize, Ordering::SeqCst);
            Ok::<_, ()>(previous)
        });
        assert_eq!(result, Ok(()));
        started(&slot, "screen:2", &stops);
        assert_eq!(ignored.load(Ordering::SeqCst), 1);
        assert_eq!(slot.current_source().as_deref(), Some("screen:2"));
    }

    #[test]
    fn stop_stops_the_active_share_without_announcing() {
        let slot = ShareSlot::default();
        let stops = Arc::new(AtomicUsize::new(0));
        let generation = started(&slot, "screen:1", &stops);
        slot.stop();
        assert_eq!(stops.load(Ordering::SeqCst), 1);
        assert_eq!(slot.current_source(), None);
        assert!(matches!(
            slot.end(generation, ScreenEndReason::Stopped),
            EndOutcome::Ignore
        ));
    }

    #[test]
    fn stop_while_starting_cancels_the_start() {
        let slot = Arc::new(ShareSlot::default());
        let stops = Arc::new(AtomicUsize::new(0));
        let stopping_slot = Arc::clone(&slot);
        let result = slot.start("screen:1", |_| {
            stopping_slot.stop();
            Ok::<_, ()>(fake(&stops))
        });
        assert_eq!(result, Err(StartFailure::Cancelled));
        assert_eq!(slot.current_source(), None);
        assert_eq!(stops.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_failed_start_keeps_the_slot_empty() {
        let slot: ShareSlot<FakeShare> = ShareSlot::default();
        assert_eq!(
            slot.start("screen:1", |_| Err("encoder")),
            Err(StartFailure::Failed("encoder"))
        );
        assert_eq!(slot.current_source(), None);
    }
}
