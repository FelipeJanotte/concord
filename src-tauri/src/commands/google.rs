use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::domain_error;
use crate::native::google_auth::{sign_in, SignInFailure, SIGN_IN_TIMEOUT};

domain_error!(GoogleError {
    #[error("Login com Google não configurado")]
    NotConfigured,
    #[error("{0}")]
    Failed(String),
});

impl From<SignInFailure> for GoogleError {
    fn from(failure: SignInFailure) -> Self {
        Self::Failed(failure.to_string())
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleSignInResult {
    pub code: String,
    pub code_verifier: String,
    pub redirect_uri: String,
}

#[tauri::command]
pub async fn google_sign_in(
    app: AppHandle,
    client_id: String,
) -> Result<GoogleSignInResult, GoogleError> {
    if client_id.is_empty() {
        return Err(GoogleError::NotConfigured);
    }
    let google = sign_in(
        &client_id,
        |url| {
            app.opener()
                .open_url(url, None::<&str>)
                .map_err(|error| error.to_string())
        },
        SIGN_IN_TIMEOUT,
    )
    .await?;
    Ok(GoogleSignInResult {
        code: google.code,
        code_verifier: google.code_verifier,
        redirect_uri: google.redirect_uri,
    })
}
