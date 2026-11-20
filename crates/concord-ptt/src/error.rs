#[derive(Debug, thiserror::Error)]
pub enum PushToTalkError {
    #[cfg(windows)]
    #[error("falha do Windows ao ouvir o teclado: {0}")]
    Windows(#[from] windows::core::Error),
    #[error("a thread de escuta terminou")]
    ListenerStopped,
    #[error("a thread de escuta não respondeu a tempo")]
    SyncTimedOut,
    #[error("já existe uma captura de tecla em andamento")]
    CaptureInProgress,
}
