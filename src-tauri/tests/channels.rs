use std::collections::BTreeSet;

use concord_lib::{commands, events};
use serde::Deserialize;

const CHANNELS: &str = include_str!("../../src/shared/desktop-channels.json");
const MAIN_CAPABILITY: &str = include_str!("../capabilities/main.json");
const OVERLAY_CAPABILITY: &str = include_str!("../capabilities/overlay.json");

type TestResult = Result<(), serde_json::Error>;

#[derive(Deserialize)]
struct Channels {
    commands: BTreeSet<String>,
    events: BTreeSet<String>,
}

#[derive(Deserialize)]
struct Capability {
    permissions: BTreeSet<String>,
}

fn kebab(snake: &str) -> String {
    snake.replace('_', "-")
}

#[test]
fn registered_commands_are_exactly_the_shared_commands() -> TestResult {
    let registered: BTreeSet<String> = commands::NAMES.iter().map(|name| kebab(name)).collect();
    assert_eq!(
        registered,
        serde_json::from_str::<Channels>(CHANNELS)?.commands
    );
    Ok(())
}

#[test]
fn emitted_events_are_exactly_the_shared_events() -> TestResult {
    let emitted: BTreeSet<String> = events::ALL.iter().map(|name| name.to_string()).collect();
    assert_eq!(emitted, serde_json::from_str::<Channels>(CHANNELS)?.events);
    Ok(())
}

#[test]
fn main_window_may_call_each_command_and_nothing_else() -> TestResult {
    let expected: BTreeSet<String> = serde_json::from_str::<Channels>(CHANNELS)?
        .commands
        .into_iter()
        .map(|name| format!("allow-{name}"))
        .chain(["core:event:default".to_string()])
        .collect();
    assert_eq!(
        serde_json::from_str::<Capability>(MAIN_CAPABILITY)?.permissions,
        expected
    );
    Ok(())
}

#[test]
fn overlay_window_only_gets_events() -> TestResult {
    let expected = BTreeSet::from(["core:event:default".to_string()]);
    assert_eq!(
        serde_json::from_str::<Capability>(OVERLAY_CAPABILITY)?.permissions,
        expected
    );
    Ok(())
}

#[test]
fn commands_follow_the_snake_case_of_their_channel() {
    for name in commands::NAMES {
        assert!(
            name.chars().all(|c| c.is_ascii_lowercase() || c == '_'),
            "{name}"
        );
    }
}
