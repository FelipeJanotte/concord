use serde::Serialize;

use crate::domain_error;

domain_error!(GoogleError {});

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleSignInResult {
    pub code: String,
    pub code_verifier: String,
    pub redirect_uri: String,
}

#[tauri::command]
pub fn google_sign_in(_client_id: String) -> Result<GoogleSignInResult, GoogleError> {
    Err(GoogleError::NotImplemented)
}
