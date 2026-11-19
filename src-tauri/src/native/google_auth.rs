use std::time::Duration;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use url::Url;

pub const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(180);
const CONNECTION_READ_TIMEOUT: Duration = Duration::from_secs(5);
const REQUEST_HEAD_LIMIT: usize = 8192;
const AUTHORIZATION_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const ACCESS_DENIED: &str = "access_denied";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoogleCode {
    pub code: String,
    pub code_verifier: String,
    pub redirect_uri: String,
}

#[derive(Debug, thiserror::Error)]
pub enum SignInFailure {
    #[error("Não foi possível ouvir o retorno do Google: {0}")]
    Listener(#[from] std::io::Error),
    #[error("Não foi possível abrir o navegador: {0}")]
    Browser(String),
    #[error("Tempo esgotado para o login com Google")]
    Timeout,
    #[error("Resposta inválida do Google")]
    Rejected,
    #[error("Login com Google cancelado")]
    Denied,
    #[error("Google: {0}")]
    Provider(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CallbackOutcome {
    NotFound,
    Rejected,
    Declined(String),
    Granted(String),
}

pub fn random_token(byte_count: usize) -> String {
    let mut bytes = vec![0u8; byte_count];
    rand::fill(&mut bytes[..]);
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn code_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

pub fn authorization_url(
    client_id: &str,
    redirect_uri: &str,
    challenge: &str,
    state: &str,
) -> Result<Url, url::ParseError> {
    Url::parse_with_params(
        AUTHORIZATION_ENDPOINT,
        &[
            ("client_id", client_id),
            ("redirect_uri", redirect_uri),
            ("response_type", "code"),
            ("scope", "openid email profile"),
            ("code_challenge", challenge),
            ("code_challenge_method", "S256"),
            ("state", state),
            ("prompt", "select_account"),
        ],
    )
}

pub fn classify_callback(request_head: &str, expected_state: &str) -> CallbackOutcome {
    let target = request_head
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/");
    let Ok(url) = Url::parse("http://127.0.0.1").and_then(|base| base.join(target)) else {
        return CallbackOutcome::NotFound;
    };
    if url.path() != "/" {
        return CallbackOutcome::NotFound;
    }
    let parameter = |name: &str| {
        url.query_pairs()
            .find(|(key, value)| key == name && !value.is_empty())
            .map(|(_, value)| value.into_owned())
    };
    let (code, error) = (parameter("code"), parameter("error"));
    if parameter("state").as_deref() != Some(expected_state) || (code.is_none() && error.is_none())
    {
        return CallbackOutcome::Rejected;
    }
    match (error, code) {
        (Some(error), _) => CallbackOutcome::Declined(error),
        (None, Some(code)) => CallbackOutcome::Granted(code),
        (None, None) => CallbackOutcome::Rejected,
    }
}

fn page(title: &str, text: &str) -> String {
    format!(
        "<!doctype html><meta charset=\"utf-8\"><title>Concord</title>\n<body style=\"font-family:system-ui;background:#1e1f22;color:#dbdee1;display:grid;place-items:center;height:100vh;margin:0\">\n<div style=\"text-align:center\"><h1 style=\"color:#fff\">{title}</h1><p>{text}</p></div></body>"
    )
}

pub fn response_for(outcome: &CallbackOutcome) -> String {
    let (status, body) = match outcome {
        CallbackOutcome::NotFound => ("404 Not Found", String::new()),
        CallbackOutcome::Rejected => (
            "200 OK",
            page("Algo deu errado", "Volte ao Concord e tente de novo."),
        ),
        CallbackOutcome::Declined(_) => (
            "200 OK",
            page("Login cancelado", "Você pode fechar esta aba."),
        ),
        CallbackOutcome::Granted(_) => (
            "200 OK",
            page(
                "Pronto!",
                "Login feito. Pode fechar esta aba e voltar ao Concord.",
            ),
        ),
    };
    format!(
        "HTTP/1.1 {status}\r\ncontent-type: text/html; charset=utf-8\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
        body.len()
    )
}

async fn read_request_head(stream: &mut TcpStream) -> std::io::Result<String> {
    let mut received = Vec::new();
    let mut chunk = [0u8; 1024];
    while received.len() < REQUEST_HEAD_LIMIT && !received.windows(4).any(|w| w == b"\r\n\r\n") {
        let count = stream.read(&mut chunk).await?;
        if count == 0 {
            break;
        }
        received.extend_from_slice(&chunk[..count]);
    }
    Ok(String::from_utf8_lossy(&received).into_owned())
}

async fn answer(stream: &mut TcpStream, state: &str) -> std::io::Result<CallbackOutcome> {
    let head = read_request_head(stream).await?;
    let outcome = classify_callback(&head, state);
    stream.write_all(response_for(&outcome).as_bytes()).await?;
    stream.shutdown().await?;
    Ok(outcome)
}

async fn wait_for_code(listener: TcpListener, state: &str) -> Result<String, SignInFailure> {
    loop {
        let (mut stream, _) = listener.accept().await?;
        let outcome =
            match tokio::time::timeout(CONNECTION_READ_TIMEOUT, answer(&mut stream, state)).await {
                Ok(Ok(outcome)) => outcome,
                Ok(Err(error)) => {
                    log::warn!("conexão de retorno do Google falhou: {error}");
                    continue;
                }
                Err(_) => {
                    log::warn!("conexão de retorno do Google ficou parada");
                    continue;
                }
            };
        match outcome {
            CallbackOutcome::NotFound => continue,
            CallbackOutcome::Rejected => return Err(SignInFailure::Rejected),
            CallbackOutcome::Declined(reason) if reason == ACCESS_DENIED => {
                return Err(SignInFailure::Denied)
            }
            CallbackOutcome::Declined(reason) => return Err(SignInFailure::Provider(reason)),
            CallbackOutcome::Granted(code) => return Ok(code),
        }
    }
}

pub async fn sign_in(
    client_id: &str,
    open_browser: impl FnOnce(&str) -> Result<(), String>,
    timeout: Duration,
) -> Result<GoogleCode, SignInFailure> {
    let code_verifier = random_token(32);
    let state = random_token(16);
    let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
    let redirect_uri = format!("http://127.0.0.1:{}", listener.local_addr()?.port());
    let url = authorization_url(
        client_id,
        &redirect_uri,
        &code_challenge(&code_verifier),
        &state,
    )
    .map_err(|error| SignInFailure::Browser(error.to_string()))?;
    open_browser(url.as_str()).map_err(SignInFailure::Browser)?;
    let code = tokio::time::timeout(timeout, wait_for_code(listener, &state))
        .await
        .map_err(|_| SignInFailure::Timeout)??;
    Ok(GoogleCode {
        code,
        code_verifier,
        redirect_uri,
    })
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use tokio::sync::oneshot;

    use super::*;

    #[test]
    fn challenge_matches_the_rfc_7636_vector() {
        assert_eq!(
            code_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn tokens_are_url_safe_unpadded_and_unique() {
        let (first, second) = (random_token(32), random_token(32));
        assert_eq!(first.len(), 43);
        assert!(first
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
        assert_ne!(first, second);
        assert_eq!(random_token(16).len(), 22);
    }

    #[test]
    fn authorization_url_carries_every_oauth_parameter() {
        let url = authorization_url("id.apps", "http://127.0.0.1:9", "chal", "st")
            .map(|url| url.to_string())
            .unwrap_or_default();
        let parsed =
            Url::parse(&url).map(|u| u.query_pairs().into_owned().collect::<HashMap<_, _>>());
        let expected: HashMap<String, String> = [
            ("client_id", "id.apps"),
            ("redirect_uri", "http://127.0.0.1:9"),
            ("response_type", "code"),
            ("scope", "openid email profile"),
            ("code_challenge", "chal"),
            ("code_challenge_method", "S256"),
            ("state", "st"),
            ("prompt", "select_account"),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_owned(), v.to_owned()))
        .collect();
        assert!(url.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"));
        assert_eq!(parsed.ok(), Some(expected));
    }

    fn get(target: &str) -> String {
        format!("GET {target} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
    }

    #[test]
    fn other_paths_are_not_found() {
        assert_eq!(
            classify_callback(&get("/favicon.ico"), "s"),
            CallbackOutcome::NotFound
        );
    }

    #[test]
    fn a_wrong_state_or_an_empty_callback_is_rejected() {
        assert_eq!(
            classify_callback(&get("/?code=c&state=x"), "s"),
            CallbackOutcome::Rejected
        );
        assert_eq!(
            classify_callback(&get("/?state=s"), "s"),
            CallbackOutcome::Rejected
        );
        assert_eq!(
            classify_callback(&get("/?code=&state=s"), "s"),
            CallbackOutcome::Rejected
        );
        assert_eq!(classify_callback(&get("/"), "s"), CallbackOutcome::Rejected);
    }

    #[test]
    fn provider_errors_are_declines_and_codes_are_grants() {
        assert_eq!(
            classify_callback(&get("/?error=access_denied&state=s"), "s"),
            CallbackOutcome::Declined("access_denied".into())
        );
        assert_eq!(
            classify_callback(&get("/?code=4%2Fabc&state=s"), "s"),
            CallbackOutcome::Granted("4/abc".into())
        );
    }

    #[test]
    fn responses_carry_the_electron_pages() {
        let granted = response_for(&CallbackOutcome::Granted("c".into()));
        assert!(granted.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(granted.contains("<h1 style=\"color:#fff\">Pronto!</h1><p>Login feito. Pode fechar esta aba e voltar ao Concord.</p>"));
        assert!(
            response_for(&CallbackOutcome::Declined("x".into())).contains(
                "<h1 style=\"color:#fff\">Login cancelado</h1><p>Você pode fechar esta aba.</p>"
            )
        );
        assert!(response_for(&CallbackOutcome::Rejected).contains(
            "<h1 style=\"color:#fff\">Algo deu errado</h1><p>Volte ao Concord e tente de novo.</p>"
        ));
        assert!(response_for(&CallbackOutcome::NotFound).starts_with("HTTP/1.1 404 Not Found\r\n"));
    }

    fn browser_visiting(
        callback_query: &'static str,
        use_real_state: bool,
    ) -> (
        impl FnOnce(&str) -> Result<(), String>,
        oneshot::Receiver<Vec<String>>,
    ) {
        let (reply, visit) = oneshot::channel();
        let open = move |authorization: &str| {
            let parameters: HashMap<String, String> = Url::parse(authorization)
                .map_err(|e| e.to_string())?
                .query_pairs()
                .into_owned()
                .collect();
            let redirect = parameters["redirect_uri"].clone();
            let state = if use_real_state {
                parameters["state"].clone()
            } else {
                "forged".into()
            };
            let port: u16 = redirect
                .rsplit(':')
                .next()
                .and_then(|p| p.parse().ok())
                .unwrap_or(0);
            tokio::spawn(async move {
                let mut responses = Vec::new();
                for target in [
                    "/favicon.ico".to_owned(),
                    format!("/?{callback_query}&state={state}"),
                ] {
                    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)).await else {
                        break;
                    };
                    if stream.write_all(get(&target).as_bytes()).await.is_err() {
                        break;
                    }
                    let mut response = String::new();
                    if stream.read_to_string(&mut response).await.is_err() {
                        break;
                    }
                    responses.push(response);
                }
                let _ = reply.send(responses);
            });
            Ok(())
        };
        (open, visit)
    }

    #[tokio::test]
    async fn completes_with_the_code_the_verifier_and_the_loopback_uri() {
        let (open, visit) = browser_visiting("code=the-code", true);
        let result = sign_in("client", open, Duration::from_secs(5)).await;
        let responses = visit.await.unwrap_or_default();
        let google = result.map_err(|e| e.to_string());
        assert_eq!(google.as_ref().map(|g| g.code.as_str()), Ok("the-code"));
        assert_eq!(google.as_ref().map(|g| g.code_verifier.len()), Ok(43));
        assert!(google
            .as_ref()
            .is_ok_and(|g| g.redirect_uri.starts_with("http://127.0.0.1:")));
        assert!(responses[0].starts_with("HTTP/1.1 404"));
        assert!(responses[1].contains("Pronto!"));
    }

    #[tokio::test]
    async fn a_forged_state_fails_the_sign_in() {
        let (open, visit) = browser_visiting("code=stolen", false);
        let result = sign_in("client", open, Duration::from_secs(5)).await;
        let responses = visit.await.unwrap_or_default();
        assert!(matches!(result, Err(SignInFailure::Rejected)));
        assert!(responses[1].contains("Algo deu errado"));
    }

    #[tokio::test]
    async fn access_denied_reads_as_cancelled() {
        let (open, _visit) = browser_visiting("error=access_denied", true);
        let result = sign_in("client", open, Duration::from_secs(5)).await;
        assert_eq!(
            result.err().map(|e| e.to_string()),
            Some("Login com Google cancelado".into())
        );
    }

    #[tokio::test]
    async fn another_provider_error_is_reported_with_its_name() {
        let (open, _visit) = browser_visiting("error=server_error", true);
        let result = sign_in("client", open, Duration::from_secs(5)).await;
        assert_eq!(
            result.err().map(|e| e.to_string()),
            Some("Google: server_error".into())
        );
    }

    #[tokio::test]
    async fn gives_up_when_nobody_answers() {
        let result = sign_in("client", |_| Ok(()), Duration::from_millis(50)).await;
        assert!(matches!(result, Err(SignInFailure::Timeout)));
    }

    #[tokio::test]
    async fn a_browser_that_cannot_open_fails_at_once() {
        let result = sign_in(
            "client",
            |_| Err("sem navegador".into()),
            Duration::from_secs(5),
        )
        .await;
        assert_eq!(
            result.err().map(|e| e.to_string()),
            Some("Não foi possível abrir o navegador: sem navegador".into())
        );
    }
}
