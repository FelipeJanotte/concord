use std::fmt;

use serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(transparent)]
pub struct LiveKitToken(String);

impl LiveKitToken {
    pub fn new(token: impl Into<String>) -> Self {
        Self(token.into())
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for LiveKitToken {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("LiveKitToken(…)")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_hides_the_token() {
        let token = LiveKitToken::new("secret-jwt-value");
        assert_eq!(format!("{token:?}"), "LiveKitToken(…)");
        assert_eq!(
            format!("{:#?}", Some(&token)),
            "Some(\n    LiveKitToken(…),\n)"
        );
    }

    #[test]
    fn expose_returns_the_original_text() {
        assert_eq!(LiveKitToken::new("jwt").expose(), "jwt");
    }
}
