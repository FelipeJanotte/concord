const CONFIGURATION: &str = include_str!("../tauri.conf.json");

#[test]
fn every_plugin_is_configured_under_a_single_plugins_key() {
    assert_eq!(CONFIGURATION.matches("\"plugins\"").count(), 1);
    let configuration: serde_json::Value = serde_json::from_str(CONFIGURATION).unwrap();
    let plugins = &configuration["plugins"];
    assert!(plugins["updater"]["pubkey"].is_string());
    assert!(plugins["updater"]["endpoints"].is_array());
    assert_eq!(plugins["deep-link"]["desktop"]["schemes"][0], "concord");
}

#[test]
fn the_whole_c_runtime_is_linked_statically_like_libwebrtc() {
    let configuration: serde_json::Value = serde_json::from_str(CONFIGURATION).unwrap();
    assert_eq!(configuration["build"]["windows"]["staticVCRuntime"], false);
    let cargo_configuration = include_str!("../../.cargo/config.toml");
    assert!(cargo_configuration.contains("target-feature=+crt-static"));
}

#[test]
fn the_installer_bridge_writes_into_the_data_folder_of_the_app_identifier() {
    let configuration: serde_json::Value = serde_json::from_str(CONFIGURATION).unwrap();
    let identifier = configuration["identifier"].as_str().unwrap();
    let bridge = include_str!("../windows/hooks.nsh");
    assert!(bridge.contains(&format!(
        "!define CONCORD_DATA_FOLDER \"$APPDATA\\{identifier}\""
    )));
    assert!(!bridge.contains("BUNDLEID"));
}
