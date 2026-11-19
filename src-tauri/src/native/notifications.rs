use serde::{Deserialize, Serialize};
use url::Url;

pub const TITLE_MAX_CHARACTERS: usize = 64;
pub const BODY_MAX_CHARACTERS: usize = 200;
pub const CHANNEL_ID_MAX_CHARACTERS: usize = 64;
pub const BADGE_MAX: u32 = 999;
pub const ACTIVATION_SCHEME: &str = "concord";
const ACTIVATION_HOST: &str = "notification";
const TARGET_PARAMETER: &str = "target";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum NotificationTarget {
    Dm { channel_id: String },
    Channel { channel_id: String },
    Friends,
}

impl NotificationTarget {
    fn has_valid_channel_id(&self) -> bool {
        match self {
            Self::Dm { channel_id } | Self::Channel { channel_id } => {
                channel_id.chars().count() <= CHANNEL_ID_MAX_CHARACTERS
            }
            Self::Friends => true,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct NativeNotification {
    pub title: String,
    pub body: String,
    pub target: Option<NotificationTarget>,
    pub silent: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CleanNotification {
    pub title: String,
    pub body: String,
    pub target: Option<NotificationTarget>,
    pub silent: bool,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum NotificationRejection {
    #[error("notificação sem título")]
    BlankTitle,
    #[error("alvo da notificação inválido")]
    InvalidTarget,
}

pub fn clean_notification(
    raw: NativeNotification,
) -> Result<CleanNotification, NotificationRejection> {
    if raw.title.trim().is_empty() {
        return Err(NotificationRejection::BlankTitle);
    }
    if raw
        .target
        .as_ref()
        .is_some_and(|target| !target.has_valid_channel_id())
    {
        return Err(NotificationRejection::InvalidTarget);
    }
    Ok(CleanNotification {
        title: raw.title.chars().take(TITLE_MAX_CHARACTERS).collect(),
        body: raw.body.chars().take(BODY_MAX_CHARACTERS).collect(),
        target: raw.target,
        silent: raw.silent == Some(true),
    })
}

pub fn clean_badge_count(count: u32) -> u32 {
    count.min(BADGE_MAX)
}

pub fn should_flash(count: u32, previous_count: u32, window_focused: bool) -> bool {
    count > previous_count && !window_focused
}

#[derive(Debug, thiserror::Error)]
pub enum ActivationError {
    #[error("endereço de ativação inválido: {0}")]
    Malformed(#[from] url::ParseError),
    #[error("endereço de ativação de outro destino: {0}")]
    ForeignUrl(String),
    #[error("alvo da notificação ilegível: {0}")]
    UnreadableTarget(#[from] serde_json::Error),
    #[error("alvo da notificação fora dos limites")]
    TargetOutOfBounds,
}

pub fn activation_url(target: Option<&NotificationTarget>) -> Result<String, serde_json::Error> {
    let mut url = Url::parse(&format!("{ACTIVATION_SCHEME}://{ACTIVATION_HOST}"))
        .map_err(|error| serde::ser::Error::custom(error.to_string()))?;
    if let Some(target) = target {
        url.query_pairs_mut()
            .append_pair(TARGET_PARAMETER, &serde_json::to_string(target)?);
    }
    Ok(url.into())
}

pub fn parse_activation(raw: &str) -> Result<Option<NotificationTarget>, ActivationError> {
    let url = Url::parse(raw)?;
    if url.scheme() != ACTIVATION_SCHEME || url.host_str() != Some(ACTIVATION_HOST) {
        return Err(ActivationError::ForeignUrl(raw.to_owned()));
    }
    let Some((_, json)) = url.query_pairs().find(|(name, _)| name == TARGET_PARAMETER) else {
        return Ok(None);
    };
    let target: NotificationTarget = serde_json::from_str(&json)?;
    if !target.has_valid_channel_id() {
        return Err(ActivationError::TargetOutOfBounds);
    }
    Ok(Some(target))
}

pub type NotificationClick = Option<NotificationTarget>;

#[derive(Debug, Default)]
pub struct ClickQueue {
    page_ready: bool,
    waiting: Vec<NotificationClick>,
}

impl ClickQueue {
    pub fn submit(&mut self, click: NotificationClick) -> Vec<NotificationClick> {
        if self.page_ready {
            return vec![click];
        }
        self.waiting.push(click);
        Vec::new()
    }

    pub fn mark_page_ready(&mut self) -> Vec<NotificationClick> {
        self.page_ready = true;
        std::mem::take(&mut self.waiting)
    }
}

fn escape_xml(text: &str) -> String {
    text.chars()
        .map(|character| match character {
            '&' => "&amp;".to_owned(),
            '<' => "&lt;".to_owned(),
            '>' => "&gt;".to_owned(),
            '"' => "&quot;".to_owned(),
            '\'' => "&apos;".to_owned(),
            other => other.to_string(),
        })
        .collect()
}

pub fn toast_xml(notification: &CleanNotification, launch_url: &str) -> String {
    let audio = if notification.silent {
        "<audio silent=\"true\"/>"
    } else {
        ""
    };
    format!(
        "<toast launch=\"{}\" activationType=\"protocol\"><visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual>{audio}</toast>",
        escape_xml(launch_url),
        escape_xml(&notification.title),
        escape_xml(&notification.body),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(title: &str, body: &str) -> NativeNotification {
        NativeNotification {
            title: title.into(),
            body: body.into(),
            target: None,
            silent: None,
        }
    }

    fn targets() -> Vec<Option<NotificationTarget>> {
        vec![
            None,
            Some(NotificationTarget::Friends),
            Some(NotificationTarget::Dm {
                channel_id: "d1&x=\"y\" é".into(),
            }),
            Some(NotificationTarget::Channel {
                channel_id: "c-2".into(),
            }),
        ]
    }

    #[test]
    fn blank_titles_are_rejected() {
        assert_eq!(
            clean_notification(raw("   ", "oi")),
            Err(NotificationRejection::BlankTitle)
        );
    }

    #[test]
    fn title_and_body_are_cut_to_their_limits() {
        let cleaned = clean_notification(raw(&"t".repeat(100), &"b".repeat(500)));
        let cleaned = cleaned.unwrap_or_else(|_| CleanNotification {
            title: String::new(),
            body: String::new(),
            target: None,
            silent: true,
        });
        assert_eq!(cleaned.title.chars().count(), 64);
        assert_eq!(cleaned.body.chars().count(), 200);
        assert!(!cleaned.silent);
    }

    #[test]
    fn silent_only_when_explicitly_true() {
        let mut request = raw("a", "b");
        request.silent = Some(true);
        assert_eq!(clean_notification(request).map(|n| n.silent), Ok(true));
    }

    #[test]
    fn channel_ids_over_64_characters_are_rejected() {
        let mut request = raw("a", "b");
        request.target = Some(NotificationTarget::Dm {
            channel_id: "x".repeat(65),
        });
        assert_eq!(
            clean_notification(request),
            Err(NotificationRejection::InvalidTarget)
        );
    }

    #[test]
    fn badge_count_is_capped_at_999() {
        assert_eq!(clean_badge_count(0), 0);
        assert_eq!(clean_badge_count(998), 998);
        assert_eq!(clean_badge_count(5000), 999);
    }

    #[test]
    fn flashes_only_when_the_count_rises_in_the_background() {
        assert!(should_flash(2, 1, false));
        assert!(!should_flash(2, 1, true));
        assert!(!should_flash(1, 1, false));
        assert!(!should_flash(0, 3, false));
    }

    #[test]
    fn activation_url_round_trips_every_target() {
        for target in targets() {
            let url = activation_url(target.as_ref()).unwrap_or_default();
            assert!(url.starts_with("concord://notification"), "{url}");
            assert_eq!(parse_activation(&url).ok(), Some(target), "{url}");
        }
    }

    #[test]
    fn activation_without_target_is_a_plain_focus_request() {
        assert_eq!(
            activation_url(None).ok().as_deref(),
            Some("concord://notification")
        );
        assert_eq!(parse_activation("concord://notification/").ok(), Some(None));
    }

    #[test]
    fn foreign_and_garbled_urls_are_refused() {
        for raw in [
            "https://notification/?target=%7B%7D",
            "concord://other?target=%7B%22kind%22%3A%22friends%22%7D",
            "não é url",
        ] {
            assert!(parse_activation(raw).is_err(), "{raw}");
        }
    }

    #[test]
    fn unreadable_or_oversized_targets_are_refused() {
        let oversized = format!(
            "concord://notification?target=%7B%22kind%22%3A%22dm%22%2C%22channelId%22%3A%22{}%22%7D",
            "x".repeat(65)
        );
        for raw in [
            "concord://notification?target=nao-json",
            "concord://notification?target=%7B%22kind%22%3A%22nuke%22%7D",
            "concord://notification?target=%7B%22kind%22%3A%22dm%22%7D",
            oversized.as_str(),
        ] {
            assert!(parse_activation(raw).is_err(), "{raw}");
        }
    }

    #[test]
    fn toast_launches_the_url_by_protocol_and_escapes_text() {
        let notification = CleanNotification {
            title: "Ana <b>".into(),
            body: "a & \"b\"".into(),
            target: None,
            silent: false,
        };
        let xml = toast_xml(&notification, "concord://notification?target=a&b");
        assert_eq!(
            xml,
            "<toast launch=\"concord://notification?target=a&amp;b\" activationType=\"protocol\"><visual><binding template=\"ToastGeneric\"><text>Ana &lt;b&gt;</text><text>a &amp; &quot;b&quot;</text></binding></visual></toast>"
        );
    }

    #[test]
    fn silent_toast_mutes_the_system_sound() {
        let notification = CleanNotification {
            title: "a".into(),
            body: "b".into(),
            target: None,
            silent: true,
        };
        assert!(toast_xml(&notification, "concord://notification")
            .ends_with("<audio silent=\"true\"/></toast>"));
    }

    #[test]
    fn clicks_wait_for_the_page_and_are_delivered_in_order() {
        let mut queue = ClickQueue::default();
        let friends = Some(NotificationTarget::Friends);
        assert!(queue.submit(friends.clone()).is_empty());
        assert!(queue.submit(None).is_empty());
        assert_eq!(queue.mark_page_ready(), vec![friends, None]);
        assert!(queue.mark_page_ready().is_empty());
    }

    #[test]
    fn clicks_after_the_page_loaded_go_straight_through() {
        let mut queue = ClickQueue::default();
        queue.mark_page_ready();
        assert_eq!(queue.submit(None), vec![None]);
    }
}
