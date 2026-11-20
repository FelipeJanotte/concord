use base64::engine::general_purpose::STANDARD;
use base64::Engine;

const PNG_PREFIX: &str = "data:image/png;base64,";

#[derive(Debug, thiserror::Error)]
pub enum DataUrlError {
    #[error("a imagem não é um PNG em data URL")]
    NotPng,
    #[error("base64 inválido: {0}")]
    InvalidBase64(#[from] base64::DecodeError),
}

pub fn png_bytes(data_url: &str) -> Result<Vec<u8>, DataUrlError> {
    let encoded = data_url
        .strip_prefix(PNG_PREFIX)
        .ok_or(DataUrlError::NotPng)?;
    Ok(STANDARD.decode(encoded)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_the_bytes_after_the_png_prefix() -> Result<(), DataUrlError> {
        let bytes = png_bytes("data:image/png;base64,iVBORw0K")?;
        assert_eq!(bytes, vec![0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
        Ok(())
    }

    #[test]
    fn refuses_other_media_types() {
        assert!(matches!(
            png_bytes("data:image/jpeg;base64,AAAA"),
            Err(DataUrlError::NotPng)
        ));
        assert!(matches!(png_bytes("AAAA"), Err(DataUrlError::NotPng)));
    }

    #[test]
    fn refuses_broken_base64() {
        assert!(matches!(
            png_bytes("data:image/png;base64,***"),
            Err(DataUrlError::InvalidBase64(_))
        ));
    }
}
