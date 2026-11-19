use std::sync::Mutex;

type Stopper = Box<dyn FnOnce() + Send>;

#[derive(Default)]
pub struct Shutdown {
    stoppers: Mutex<Vec<Stopper>>,
}

impl Shutdown {
    pub fn register(&self, stopper: impl FnOnce() + Send + 'static) {
        if let Ok(mut stoppers) = self.stoppers.lock() {
            stoppers.push(Box::new(stopper));
        }
    }

    pub fn run_all(&self) {
        let stoppers = match self.stoppers.lock() {
            Ok(mut stoppers) => std::mem::take(&mut *stoppers),
            Err(poisoned) => std::mem::take(&mut *poisoned.into_inner()),
        };
        for stopper in stoppers.into_iter().rev() {
            stopper();
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::Shutdown;

    #[test]
    fn stops_in_reverse_registration_order() {
        let shutdown = Shutdown::default();
        let order = Arc::new(Mutex::new(Vec::new()));
        for label in ["first", "second", "third"] {
            let order = Arc::clone(&order);
            shutdown.register(move || {
                if let Ok(mut order) = order.lock() {
                    order.push(label);
                }
            });
        }
        shutdown.run_all();
        let order = order.lock().map(|order| order.clone()).unwrap_or_default();
        assert_eq!(order, vec!["third", "second", "first"]);
    }

    #[test]
    fn runs_each_stopper_only_once() {
        let shutdown = Shutdown::default();
        let count = Arc::new(Mutex::new(0));
        let counter = Arc::clone(&count);
        shutdown.register(move || {
            if let Ok(mut count) = counter.lock() {
                *count += 1;
            }
        });
        shutdown.run_all();
        shutdown.run_all();
        assert_eq!(count.lock().map(|count| *count).unwrap_or_default(), 1);
    }
}
