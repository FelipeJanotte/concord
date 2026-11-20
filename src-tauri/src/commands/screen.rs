use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use concord_capture::{
    list_sources, thumbnail_of, CaptureSource, EndReason, LiveKitToken, ScreenShare, ShareEvent,
    ShareQuality, ShareRequest, SourceKind,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::domain_error;
use crate::events;
use crate::native::screen_share::{
    EndOutcome, RunningShare, ScreenEndReason, ShareSlot, StartFailure,
};
use crate::shutdown::Shutdown;
use crate::windows::main_window::MAIN_WINDOW_LABEL;

domain_error!(ScreenError {
    #[error("{0}")]
    Capture(#[from] concord_capture::CaptureError),
    #[error("A tarefa da tela parou: {0}")]
    Task(#[from] tauri::Error),
    #[error("O compartilhamento de tela parou antes de começar")]
    EndedBeforeStart,
    #[error("O compartilhamento de tela foi cancelado")]
    Cancelled,
    #[error("Nenhuma tela está sendo compartilhada")]
    NotSharing,
});

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ScreenSourceKind {
    Screen,
    Window,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenSource {
    pub id: String,
    pub name: String,
    pub kind: ScreenSourceKind,
    pub thumbnail: String,
    pub app_icon: Option<String>,
}

impl From<CaptureSource> for ScreenSource {
    fn from(source: CaptureSource) -> Self {
        Self {
            id: source.id,
            name: source.title,
            kind: match source.kind {
                SourceKind::Screen => ScreenSourceKind::Screen,
                SourceKind::Window => ScreenSourceKind::Window,
            },
            thumbnail: png_data_url(&source.thumbnail_png),
            app_icon: None,
        }
    }
}

fn png_data_url(png: &[u8]) -> String {
    format!("data:image/png;base64,{}", STANDARD.encode(png))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenShareStart {
    pub source_id: String,
    pub audio: bool,
    pub url: String,
    pub token: LiveKitToken,
}

impl From<ScreenShareStart> for ShareRequest {
    fn from(start: ScreenShareStart) -> Self {
        Self {
            source_id: start.source_id,
            with_audio: start.audio,
            livekit_url: start.url,
            token: start.token,
            quality: ShareQuality::default(),
        }
    }
}

fn end_reason(reason: &EndReason) -> ScreenEndReason {
    match reason {
        EndReason::Stopped => ScreenEndReason::Stopped,
        EndReason::SourceClosed => ScreenEndReason::SourceClosed,
        EndReason::Disconnected => ScreenEndReason::Disconnected,
        EndReason::Failed(_) => ScreenEndReason::Failed,
    }
}

impl RunningShare for ScreenShare {
    fn stop(self) {
        ScreenShare::stop(self);
    }
}

pub type ScreenShareState = ShareSlot<ScreenShare>;

impl From<StartFailure<concord_capture::CaptureError>> for ScreenError {
    fn from(failure: StartFailure<concord_capture::CaptureError>) -> Self {
        match failure {
            StartFailure::Failed(error) => Self::Capture(error),
            StartFailure::EndedBeforeStart(_) => Self::EndedBeforeStart,
            StartFailure::Cancelled => Self::Cancelled,
        }
    }
}

pub fn stop_share_on_shutdown(app: &AppHandle) {
    let handle = app.clone();
    app.state::<Shutdown>()
        .register(move || handle.state::<ScreenShareState>().stop());
}

fn on_share_event(app: &AppHandle, generation: u64, event: ShareEvent) {
    match event {
        ShareEvent::HardwareEncoderUnavailable { reason } => {
            log::warn!(
                "Codificador de vídeo da placa indisponível, usando o do processador: {reason}"
            );
        }
        ShareEvent::Started { encoder } => {
            log::info!("Tela compartilhada com o codificador {encoder:?}");
        }
        ShareEvent::Ended { reason } => announce_end(app, generation, &reason),
    }
}

fn announce_end(app: &AppHandle, generation: u64, reason: &EndReason) {
    if let EndReason::Failed(message) = reason {
        log::error!("O compartilhamento de tela falhou: {message}");
    }
    let EndOutcome::Announce(reason, finished) = app
        .state::<ScreenShareState>()
        .end(generation, end_reason(reason))
    else {
        return;
    };
    tauri::async_runtime::spawn_blocking(move || finished.stop());
    if let Err(error) = app.emit_to(MAIN_WINDOW_LABEL, events::SCREEN_ENDED, reason) {
        log::error!("Não foi possível avisar o fim da tela: {error}");
    }
}

#[tauri::command]
pub async fn screen_sources() -> Result<Vec<ScreenSource>, ScreenError> {
    let sources = tauri::async_runtime::spawn_blocking(list_sources).await??;
    Ok(sources.into_iter().map(ScreenSource::from).collect())
}

#[tauri::command]
pub async fn screen_start(app: AppHandle, request: ScreenShareStart) -> Result<(), ScreenError> {
    tauri::async_runtime::spawn_blocking(move || {
        let source_id = request.source_id.clone();
        let events_app = app.clone();
        app.state::<ScreenShareState>()
            .start(&source_id, move |generation| {
                ScreenShare::start(request.into(), move |event| {
                    on_share_event(&events_app, generation, event)
                })
            })
    })
    .await??;
    Ok(())
}

#[tauri::command]
pub async fn screen_stop(app: AppHandle) -> Result<(), ScreenError> {
    tauri::async_runtime::spawn_blocking(move || app.state::<ScreenShareState>().stop()).await?;
    Ok(())
}

#[tauri::command]
pub async fn screen_preview(app: AppHandle) -> Result<String, ScreenError> {
    let source_id = app
        .state::<ScreenShareState>()
        .current_source()
        .ok_or(ScreenError::NotSharing)?;
    let png = tauri::async_runtime::spawn_blocking(move || thumbnail_of(&source_id)).await??;
    Ok(png_data_url(&png))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_becomes_a_png_data_url_without_app_icon() {
        let source = CaptureSource {
            id: "window:42".into(),
            kind: SourceKind::Window,
            title: "Bloco de notas".into(),
            thumbnail_png: vec![0x89, b'P', b'N', b'G'],
        };
        assert_eq!(
            ScreenSource::from(source),
            ScreenSource {
                id: "window:42".into(),
                name: "Bloco de notas".into(),
                kind: ScreenSourceKind::Window,
                thumbnail: "data:image/png;base64,iVBORw==".into(),
                app_icon: None,
            }
        );
    }

    #[test]
    fn source_serializes_in_the_shape_the_picker_reads() -> Result<(), serde_json::Error> {
        let source = ScreenSource::from(CaptureSource {
            id: "screen:1".into(),
            kind: SourceKind::Screen,
            title: "Tela 1".into(),
            thumbnail_png: Vec::new(),
        });
        assert_eq!(
            serde_json::to_value(source)?,
            serde_json::json!({
                "id": "screen:1",
                "name": "Tela 1",
                "kind": "screen",
                "thumbnail": "data:image/png;base64,",
                "appIcon": null
            })
        );
        Ok(())
    }

    #[test]
    fn start_request_reads_camel_case_and_keeps_the_livekit_credentials(
    ) -> Result<(), serde_json::Error> {
        let start: ScreenShareStart = serde_json::from_value(serde_json::json!({
            "sourceId": "screen:65537",
            "audio": true,
            "url": "wss://voz.exemplo",
            "token": "jwt"
        }))?;
        let request = ShareRequest::from(start);
        assert_eq!(request.source_id, "screen:65537");
        assert!(request.with_audio);
        assert_eq!(request.livekit_url, "wss://voz.exemplo");
        assert_eq!(request.token.expose(), "jwt");
        assert_eq!(request.quality, ShareQuality::Smooth);
        Ok(())
    }

    #[test]
    fn the_debug_output_of_a_start_request_never_contains_the_token(
    ) -> Result<(), serde_json::Error> {
        let start: ScreenShareStart = serde_json::from_value(serde_json::json!({
            "sourceId": "screen:1",
            "audio": false,
            "url": "wss://voz.exemplo",
            "token": "secret-jwt-value"
        }))?;
        assert!(!format!("{start:?}").contains("secret-jwt-value"));
        assert!(!format!("{:?}", ShareRequest::from(start)).contains("secret-jwt-value"));
        Ok(())
    }

    #[test]
    fn end_reasons_reach_the_app_in_kebab_case() -> Result<(), serde_json::Error> {
        let cases = [
            (EndReason::Stopped, "stopped"),
            (EndReason::SourceClosed, "source-closed"),
            (EndReason::Disconnected, "disconnected"),
            (EndReason::Failed("encoder".into()), "failed"),
        ];
        for (reason, expected) in cases {
            assert_eq!(
                serde_json::to_value(end_reason(&reason))?,
                serde_json::json!(expected)
            );
        }
        Ok(())
    }

    #[test]
    fn a_share_that_ended_before_starting_reaches_the_app_as_an_error(
    ) -> Result<(), serde_json::Error> {
        let error = ScreenError::from(StartFailure::EndedBeforeStart(ScreenEndReason::Failed));
        assert_eq!(
            serde_json::to_string(&error)?,
            "\"O compartilhamento de tela parou antes de começar\""
        );
        Ok(())
    }

    #[test]
    fn capture_errors_reach_the_app_as_their_message() -> Result<(), serde_json::Error> {
        let error = ScreenError::from(concord_capture::CaptureError::SourceNotFound(
            "window:9".into(),
        ));
        assert_eq!(
            serde_json::to_string(&error)?,
            "\"source not found: window:9\""
        );
        Ok(())
    }
}
