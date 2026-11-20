use std::fs;
use std::io;
use std::path::Path;

use super::entries::{initialization_script, parse, MigrationError};

pub const FILE_NAME: &str = "migrate.json";

#[derive(Debug, thiserror::Error)]
enum LoadError {
    #[error(transparent)]
    Read(#[from] io::Error),
    #[error(transparent)]
    Invalid(#[from] MigrationError),
    #[error(transparent)]
    Script(#[from] serde_json::Error),
}

pub fn script_from_file(path: &Path) -> Option<String> {
    let raw = match fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return None,
        Err(error) => {
            log::warn!("Não foi possível ler {}: {error}", path.display());
            return None;
        }
    };
    match build_script(&raw) {
        Ok(script) => Some(script),
        Err(error) => {
            log::warn!("Migração ignorada: {error}");
            if let Err(error) = remove(path) {
                log::error!("Não foi possível apagar {}: {error}", path.display());
            }
            None
        }
    }
}

fn build_script(raw: &str) -> Result<String, LoadError> {
    Ok(initialization_script(&parse(raw)?)?)
}

pub fn remove(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use super::*;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> io::Result<Self> {
            let dir = std::env::temp_dir()
                .join(format!("concord-migration-{name}-{}", std::process::id()));
            match fs::remove_dir_all(&dir) {
                Err(error) if error.kind() != io::ErrorKind::NotFound => return Err(error),
                _ => {}
            }
            fs::create_dir_all(&dir)?;
            Ok(Scratch(dir))
        }

        fn file(&self, body: &str) -> io::Result<PathBuf> {
            let path = self.0.join(FILE_NAME);
            fs::write(&path, body)?;
            Ok(path)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            if let Err(error) = fs::remove_dir_all(&self.0) {
                log::warn!("scratch directory not removed: {error}");
            }
        }
    }

    #[test]
    fn a_missing_file_yields_no_script() -> io::Result<()> {
        let scratch = Scratch::new("missing")?;
        assert_eq!(script_from_file(&scratch.0.join(FILE_NAME)), None);
        Ok(())
    }

    #[test]
    fn a_valid_file_yields_a_script_and_is_kept_until_the_page_confirms() -> io::Result<()> {
        let scratch = Scratch::new("valid")?;
        let path = scratch.file(r#"{"version":1,"entries":{"concord:a":"1"}}"#)?;
        let script = script_from_file(&path);
        assert!(script.is_some_and(|text| text.contains("concord:a")));
        assert!(path.exists());
        Ok(())
    }

    #[test]
    fn a_malformed_file_yields_no_script_and_is_deleted() -> io::Result<()> {
        let scratch = Scratch::new("malformed")?;
        let path = scratch.file(r#"{"version":1,"entries":{"token":"x"}}"#)?;
        assert_eq!(script_from_file(&path), None);
        assert!(!path.exists());
        Ok(())
    }

    #[test]
    fn remove_deletes_the_file() -> io::Result<()> {
        let scratch = Scratch::new("remove")?;
        let path = scratch.file("{}")?;
        assert!(remove(&path).is_ok());
        assert!(!path.exists());
        Ok(())
    }

    #[test]
    fn remove_of_a_missing_file_is_fine() -> io::Result<()> {
        let scratch = Scratch::new("remove-missing")?;
        assert!(remove(&scratch.0.join(FILE_NAME)).is_ok());
        Ok(())
    }
}
