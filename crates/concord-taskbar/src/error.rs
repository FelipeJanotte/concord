#[derive(Debug, thiserror::Error)]
pub enum TaskbarError {
    #[error("PNG inválido: {0}")]
    InvalidPng(#[from] png::DecodingError),
    #[error("ícone com tamanho inválido: {width}x{height}")]
    InvalidIconSize { width: u32, height: u32 },
    #[cfg(windows)]
    #[error("erro do Windows: {0}")]
    Windows(#[from] windows::core::Error),
}
