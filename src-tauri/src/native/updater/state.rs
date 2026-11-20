use std::time::Duration;

use serde::Serialize;

pub const CHECK_INTERVAL: Duration = Duration::from_millis(30 * 60 * 1000);
pub const UNSUPPORTED_MESSAGE: &str = "A atualização só funciona no app instalado.";
pub const CHECK_FAILED_MESSAGE: &str = "Não foi possível procurar atualizações agora.";

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "lowercase")]
pub enum UpdateStatus {
    #[default]
    Idle,
    Checking,
    Downloading {
        version: String,
        percent: u8,
    },
    Ready {
        version: String,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub enum UpdateEvent {
    Checking,
    Available { version: String },
    NotAvailable,
    Progress { downloaded: u64, total: Option<u64> },
    Downloaded { version: String },
    Failed,
    Unsupported,
}

#[derive(Debug, Default)]
pub struct UpdateMachine {
    status: UpdateStatus,
    pending_version: String,
}

impl UpdateMachine {
    pub fn status(&self) -> &UpdateStatus {
        &self.status
    }

    pub fn apply(&mut self, event: UpdateEvent) -> Option<UpdateStatus> {
        if self.ignores(&event) {
            return None;
        }
        let next = match event {
            UpdateEvent::Checking => UpdateStatus::Checking,
            UpdateEvent::Available { version } => {
                self.pending_version = version.clone();
                UpdateStatus::Downloading {
                    version,
                    percent: 0,
                }
            }
            UpdateEvent::NotAvailable => UpdateStatus::Idle,
            UpdateEvent::Progress { downloaded, total } => UpdateStatus::Downloading {
                version: self.pending_version.clone(),
                percent: percent_of(downloaded, total),
            },
            UpdateEvent::Downloaded { version } => UpdateStatus::Ready { version },
            UpdateEvent::Failed => UpdateStatus::Error {
                message: CHECK_FAILED_MESSAGE.into(),
            },
            UpdateEvent::Unsupported => UpdateStatus::Error {
                message: UNSUPPORTED_MESSAGE.into(),
            },
        };
        if next == self.status {
            return None;
        }
        self.status = next.clone();
        Some(next)
    }

    fn ignores(&self, event: &UpdateEvent) -> bool {
        match (&self.status, event) {
            (UpdateStatus::Ready { .. }, UpdateEvent::Downloaded { .. }) => false,
            (UpdateStatus::Ready { .. }, _) => true,
            (UpdateStatus::Checking | UpdateStatus::Downloading { .. }, UpdateEvent::Checking) => {
                true
            }
            _ => false,
        }
    }
}

fn percent_of(downloaded: u64, total: Option<u64>) -> u8 {
    match total {
        Some(total) if total > 0 => ((downloaded as f64 / total as f64) * 100.0)
            .round()
            .clamp(0.0, 100.0) as u8,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn available(version: &str) -> UpdateEvent {
        UpdateEvent::Available {
            version: version.into(),
        }
    }

    fn progress(downloaded: u64, total: Option<u64>) -> UpdateEvent {
        UpdateEvent::Progress { downloaded, total }
    }

    #[test]
    fn starts_idle() {
        assert_eq!(UpdateMachine::default().status(), &UpdateStatus::Idle);
    }

    #[test]
    fn checking_is_reported() {
        let mut machine = UpdateMachine::default();
        assert_eq!(
            machine.apply(UpdateEvent::Checking),
            Some(UpdateStatus::Checking)
        );
    }

    #[test]
    fn an_available_version_starts_downloading_at_zero() {
        let mut machine = UpdateMachine::default();
        assert_eq!(
            machine.apply(available("0.2.0")),
            Some(UpdateStatus::Downloading {
                version: "0.2.0".into(),
                percent: 0
            })
        );
    }

    #[test]
    fn progress_keeps_the_available_version_and_rounds_the_percent() {
        let mut machine = UpdateMachine::default();
        machine.apply(available("0.2.0"));
        assert_eq!(
            machine.apply(progress(1, Some(3))),
            Some(UpdateStatus::Downloading {
                version: "0.2.0".into(),
                percent: 33
            })
        );
    }

    #[test]
    fn progress_without_a_total_stays_at_zero() {
        let mut machine = UpdateMachine::default();
        machine.apply(available("0.2.0"));
        assert_eq!(machine.apply(progress(500, None)), None);
        assert_eq!(
            machine.status(),
            &UpdateStatus::Downloading {
                version: "0.2.0".into(),
                percent: 0
            }
        );
    }

    #[test]
    fn progress_past_the_total_is_capped_at_one_hundred() {
        let mut machine = UpdateMachine::default();
        machine.apply(available("0.2.0"));
        assert_eq!(
            machine.apply(progress(300, Some(200))),
            Some(UpdateStatus::Downloading {
                version: "0.2.0".into(),
                percent: 100
            })
        );
    }

    #[test]
    fn a_finished_download_is_ready() {
        let mut machine = UpdateMachine::default();
        machine.apply(available("0.2.0"));
        assert_eq!(
            machine.apply(UpdateEvent::Downloaded {
                version: "0.2.0".into()
            }),
            Some(UpdateStatus::Ready {
                version: "0.2.0".into()
            })
        );
    }

    #[test]
    fn no_update_goes_back_to_idle() {
        let mut machine = UpdateMachine::default();
        machine.apply(UpdateEvent::Checking);
        assert_eq!(
            machine.apply(UpdateEvent::NotAvailable),
            Some(UpdateStatus::Idle)
        );
    }

    #[test]
    fn a_failure_reports_the_friendly_message() {
        let mut machine = UpdateMachine::default();
        assert_eq!(
            machine.apply(UpdateEvent::Failed),
            Some(UpdateStatus::Error {
                message: CHECK_FAILED_MESSAGE.into()
            })
        );
    }

    #[test]
    fn unsupported_reports_that_only_the_installed_app_updates() {
        let mut machine = UpdateMachine::default();
        assert_eq!(
            machine.apply(UpdateEvent::Unsupported),
            Some(UpdateStatus::Error {
                message: UNSUPPORTED_MESSAGE.into()
            })
        );
    }

    #[test]
    fn once_ready_only_a_restart_changes_it() {
        let mut machine = UpdateMachine::default();
        machine.apply(UpdateEvent::Downloaded {
            version: "0.2.0".into(),
        });
        for event in [
            UpdateEvent::Checking,
            UpdateEvent::NotAvailable,
            UpdateEvent::Failed,
            available("0.3.0"),
            progress(1, Some(2)),
        ] {
            assert_eq!(machine.apply(event), None);
        }
        assert_eq!(
            machine.status(),
            &UpdateStatus::Ready {
                version: "0.2.0".into()
            }
        );
    }

    #[test]
    fn a_check_while_one_is_running_is_ignored() {
        let mut machine = UpdateMachine::default();
        machine.apply(UpdateEvent::Checking);
        assert_eq!(machine.apply(UpdateEvent::Checking), None);
        machine.apply(available("0.2.0"));
        assert_eq!(machine.apply(UpdateEvent::Checking), None);
    }

    #[test]
    fn a_check_after_a_failure_runs_again() {
        let mut machine = UpdateMachine::default();
        machine.apply(UpdateEvent::Failed);
        assert_eq!(
            machine.apply(UpdateEvent::Checking),
            Some(UpdateStatus::Checking)
        );
    }

    #[test]
    fn repeating_the_same_status_is_not_reported_twice() {
        let mut machine = UpdateMachine::default();
        machine.apply(available("0.2.0"));
        machine.apply(progress(1, Some(100)));
        assert_eq!(machine.apply(progress(1, Some(100))), None);
    }

    #[test]
    fn statuses_serialize_exactly_like_the_shared_typescript_shapes() {
        let shapes = [
            (UpdateStatus::Idle, json!({"state": "idle"})),
            (UpdateStatus::Checking, json!({"state": "checking"})),
            (
                UpdateStatus::Downloading {
                    version: "0.2.0".into(),
                    percent: 40,
                },
                json!({"state": "downloading", "version": "0.2.0", "percent": 40}),
            ),
            (
                UpdateStatus::Ready {
                    version: "0.2.0".into(),
                },
                json!({"state": "ready", "version": "0.2.0"}),
            ),
            (
                UpdateStatus::Error {
                    message: "x".into(),
                },
                json!({"state": "error", "message": "x"}),
            ),
        ];
        for (status, expected) in shapes {
            assert_eq!(serde_json::to_value(&status).ok(), Some(expected));
        }
    }

    #[test]
    fn the_check_interval_matches_the_shared_constant() {
        let shared = include_str!("../../../../src/shared/updater.ts");
        assert!(shared.contains("UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000"));
        assert_eq!(CHECK_INTERVAL.as_millis(), 30 * 60 * 1000);
    }
}
