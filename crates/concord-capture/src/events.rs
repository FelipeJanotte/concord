use std::sync::{Mutex, PoisonError};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EncoderKind {
    Hardware,
    Software,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EndReason {
    Stopped,
    SourceClosed,
    Disconnected,
    Failed(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShareEvent {
    HardwareEncoderUnavailable { reason: String },
    Started { encoder: EncoderKind },
    Ended { reason: EndReason },
}

pub(crate) type EventCallback = Box<dyn Fn(ShareEvent) + Send + Sync>;

pub(crate) struct EventEmitter {
    callback: EventCallback,
    ended: Mutex<bool>,
}

impl EventEmitter {
    pub fn new(callback: EventCallback) -> Self {
        Self {
            callback,
            ended: Mutex::new(false),
        }
    }

    pub fn emit(&self, event: ShareEvent) {
        let mut ended = self.ended.lock().unwrap_or_else(PoisonError::into_inner);
        if *ended {
            return;
        }
        *ended = matches!(event, ShareEvent::Ended { .. });
        (self.callback)(event);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn recording_emitter() -> (EventEmitter, Arc<Mutex<Vec<ShareEvent>>>) {
        let received = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&received);
        let emitter = EventEmitter::new(Box::new(move |event| {
            if let Ok(mut events) = sink.lock() {
                events.push(event);
            }
        }));
        (emitter, received)
    }

    fn recorded(received: &Arc<Mutex<Vec<ShareEvent>>>) -> Vec<ShareEvent> {
        received
            .lock()
            .map(|events| events.clone())
            .unwrap_or_default()
    }

    #[test]
    fn forwards_events_in_order() {
        let (emitter, received) = recording_emitter();
        emitter.emit(ShareEvent::Started {
            encoder: EncoderKind::Hardware,
        });
        emitter.emit(ShareEvent::Ended {
            reason: EndReason::SourceClosed,
        });
        assert_eq!(
            recorded(&received),
            vec![
                ShareEvent::Started {
                    encoder: EncoderKind::Hardware
                },
                ShareEvent::Ended {
                    reason: EndReason::SourceClosed
                },
            ]
        );
    }

    #[test]
    fn only_the_first_end_is_reported() {
        let (emitter, received) = recording_emitter();
        emitter.emit(ShareEvent::Ended {
            reason: EndReason::SourceClosed,
        });
        emitter.emit(ShareEvent::Ended {
            reason: EndReason::Stopped,
        });
        emitter.emit(ShareEvent::Started {
            encoder: EncoderKind::Software,
        });
        assert_eq!(
            recorded(&received),
            vec![ShareEvent::Ended {
                reason: EndReason::SourceClosed
            }]
        );
    }
}
