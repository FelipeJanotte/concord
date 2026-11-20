use std::collections::BTreeMap;

use serde::Deserialize;

pub const SUPPORTED_VERSION: u32 = 1;
pub const MAX_BYTES: usize = 1024 * 1024;
pub const KEY_PREFIX: &str = "concord:";
pub const MIGRATED_KEY: &str = "concord:migrated";

#[derive(Debug, thiserror::Error)]
pub enum MigrationError {
    #[error("arquivo de migração maior que o limite")]
    TooLarge,
    #[error("arquivo de migração inválido: {0}")]
    Malformed(#[from] serde_json::Error),
    #[error("versão de migração não suportada: {0}")]
    UnsupportedVersion(u32),
    #[error("chave fora do padrão concord: {0}")]
    ForeignKey(String),
}

#[derive(Debug, Deserialize)]
struct MigrationFile {
    version: u32,
    entries: BTreeMap<String, String>,
}

pub fn parse(raw: &str) -> Result<BTreeMap<String, String>, MigrationError> {
    if raw.len() > MAX_BYTES {
        return Err(MigrationError::TooLarge);
    }
    let file: MigrationFile = serde_json::from_str(raw)?;
    if file.version != SUPPORTED_VERSION {
        return Err(MigrationError::UnsupportedVersion(file.version));
    }
    match file
        .entries
        .keys()
        .find(|key| !key.starts_with(KEY_PREFIX) || key.as_str() == MIGRATED_KEY)
    {
        Some(key) => Err(MigrationError::ForeignKey(key.clone())),
        None => Ok(file.entries),
    }
}

pub fn initialization_script(
    entries: &BTreeMap<String, String>,
) -> Result<String, serde_json::Error> {
    let literal = serde_json::to_string(entries)?;
    Ok(format!(
        "(function () {{\n  try {{\n    const entries = {literal};\n    if (localStorage.getItem('{MIGRATED_KEY}') === null) {{\n      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);\n      localStorage.setItem('{MIGRATED_KEY}', '1');\n    }}\n  }} catch (error) {{\n    console.error('Falha ao importar as preferências do app anterior', error);\n  }}\n}})();\n"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(body: &str) -> String {
        format!(r#"{{"version":1,"exportedAt":"2026-01-01T00:00:00Z","entries":{body}}}"#)
    }

    #[test]
    fn accepts_concord_entries_with_string_values() {
        let parsed = parse(&file(
            r#"{"concord:theme":"{\"a\":1}","concord:audio":"x"}"#,
        ));
        let entries = parsed.unwrap_or_default();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries["concord:theme"], r#"{"a":1}"#);
    }

    #[test]
    fn accepts_an_empty_export() {
        assert!(parse(&file("{}")).is_ok_and(|entries| entries.is_empty()));
    }

    #[test]
    fn rejects_keys_without_the_concord_prefix() {
        let error = parse(&file(r#"{"concord:ok":"1","token":"2"}"#)).err();
        assert!(matches!(error, Some(MigrationError::ForeignKey(key)) if key == "token"));
    }

    #[test]
    fn rejects_a_prefix_lookalike() {
        let error = parse(&file(r#"{"concordX:a":"1"}"#)).err();
        assert!(matches!(error, Some(MigrationError::ForeignKey(_))));
    }

    #[test]
    fn rejects_the_migrated_marker_itself() {
        let error = parse(&file(r#"{"concord:migrated":"1"}"#)).err();
        assert!(matches!(error, Some(MigrationError::ForeignKey(_))));
    }

    #[test]
    fn rejects_non_string_values() {
        let error = parse(&file(r#"{"concord:a":1}"#)).err();
        assert!(matches!(error, Some(MigrationError::Malformed(_))));
    }

    #[test]
    fn rejects_other_versions() {
        let error = parse(r#"{"version":2,"entries":{}}"#).err();
        assert!(matches!(error, Some(MigrationError::UnsupportedVersion(2))));
    }

    #[test]
    fn rejects_text_that_is_not_json() {
        assert!(matches!(parse("{"), Err(MigrationError::Malformed(_))));
    }

    #[test]
    fn rejects_files_over_one_megabyte() {
        let value = "x".repeat(MAX_BYTES);
        let error = parse(&file(&format!(r#"{{"concord:big":"{value}"}}"#))).err();
        assert!(matches!(error, Some(MigrationError::TooLarge)));
    }

    fn script_for(pairs: &[(&str, &str)]) -> String {
        let entries = pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect();
        initialization_script(&entries).unwrap_or_default()
    }

    #[test]
    fn script_guards_on_the_migrated_marker_and_sets_it() {
        let script = script_for(&[("concord:a", "1")]);
        assert!(script.contains("localStorage.getItem('concord:migrated') === null"));
        assert!(script.contains("localStorage.setItem('concord:migrated', '1')"));
    }

    #[test]
    fn script_embeds_the_entries_as_a_json_literal() {
        let hostile = "\"; alert(1); //\n</script>\u{2028}";
        let script = script_for(&[("concord:a", hostile)]);
        let literal =
            serde_json::to_string(&BTreeMap::from([("concord:a", hostile)])).unwrap_or_default();
        assert!(script.contains(&literal));
        assert!(!script.contains("\"; alert(1); //\n"));
    }
}
