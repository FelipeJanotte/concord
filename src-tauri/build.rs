use std::error::Error;
use std::fs;

use tauri_build::{AppManifest, Attributes};

const CHANNELS_PATH: &str = "../src/shared/desktop-channels.json";

fn main() -> Result<(), Box<dyn Error>> {
    println!("cargo:rerun-if-changed={CHANNELS_PATH}");
    let channels: serde_json::Value = serde_json::from_str(&fs::read_to_string(CHANNELS_PATH)?)?;
    let command_names: &'static [&'static str] = Vec::leak(
        channels["commands"]
            .as_array()
            .ok_or("desktop-channels.json sem a lista commands")?
            .iter()
            .map(|name| {
                let snake_case = name
                    .as_str()
                    .ok_or("nome de comando que não é texto")?
                    .replace('-', "_");
                Ok(&*Box::leak(snake_case.into_boxed_str()))
            })
            .collect::<Result<Vec<&'static str>, Box<dyn Error>>>()?,
    );
    let manifest = AppManifest::new().commands(command_names);
    tauri_build::try_build(Attributes::new().app_manifest(manifest))?;
    Ok(())
}
