use url::Url;

pub fn external_url(raw: &str) -> Option<Url> {
    let url = Url::parse(raw).ok()?;
    matches!(url.scheme(), "http" | "https").then_some(url)
}

#[derive(Debug, PartialEq, Eq)]
pub enum NavigationDecision {
    Allow,
    OpenExternally(Url),
    Block,
}

pub fn decide_navigation(target: &Url, development_server: Option<&Url>) -> NavigationDecision {
    if is_application_page(target, development_server) {
        return NavigationDecision::Allow;
    }
    match external_url(target.as_str()) {
        Some(url) => NavigationDecision::OpenExternally(url),
        None => NavigationDecision::Block,
    }
}

fn is_application_page(target: &Url, development_server: Option<&Url>) -> bool {
    target.scheme() == "tauri"
        || target.host_str() == Some("tauri.localhost")
        || development_server.is_some_and(|server| server.origin() == target.origin())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(raw: &str) -> Url {
        Url::parse(raw).expect("url de teste válida")
    }

    #[test]
    fn opens_http_and_https() {
        assert_eq!(
            external_url("https://exemplo.com/a?b=1").map(String::from),
            Some("https://exemplo.com/a?b=1".into())
        );
        assert_eq!(
            external_url("http://exemplo.com").map(String::from),
            Some("http://exemplo.com/".into())
        );
    }

    #[test]
    fn refuses_every_other_scheme_and_garbage() {
        for raw in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "ftp://exemplo.com",
            "concord://x",
            "não é url",
            "",
        ] {
            assert_eq!(external_url(raw), None, "{raw}");
        }
    }

    #[test]
    fn application_pages_navigate_inside_the_window() {
        let dev = url("http://localhost:5173");
        for raw in [
            "tauri://localhost/index.html",
            "http://tauri.localhost/",
            "https://tauri.localhost/overlay.html",
            "http://localhost:5173/overlay.html",
        ] {
            assert_eq!(
                decide_navigation(&url(raw), Some(&dev)),
                NavigationDecision::Allow,
                "{raw}"
            );
        }
    }

    #[test]
    fn other_origins_go_to_the_browser() {
        let dev = url("http://localhost:5173");
        let target = url("https://exemplo.com/x");
        assert_eq!(
            decide_navigation(&target, Some(&dev)),
            NavigationDecision::OpenExternally(target)
        );
        assert_eq!(
            decide_navigation(&url("http://localhost:3001/x"), Some(&dev)),
            NavigationDecision::OpenExternally(url("http://localhost:3001/x"))
        );
    }

    #[test]
    fn dangerous_schemes_are_blocked_not_opened() {
        assert_eq!(
            decide_navigation(&url("file:///c:/windows"), None),
            NavigationDecision::Block
        );
        assert_eq!(
            decide_navigation(&url("javascript:alert(1)"), None),
            NavigationDecision::Block
        );
    }
}
