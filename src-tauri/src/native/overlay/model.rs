use serde::{Deserialize, Serialize};

pub const MAX_MEMBERS: usize = 12;
pub const MIN_WIDTH: u32 = 140;
pub const MAX_WIDTH: u32 = 640;
const MAX_POSITION: f64 = 100_000.0;
const MAX_NAME_CHARS: usize = 32;
const MAX_ID_CHARS: usize = 64;
const MAX_COLOR_CHARS: usize = 16;
const MAX_AVATAR_CHARS: usize = 2048;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OverlayCorner {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

impl OverlayCorner {
    pub fn is_right(self) -> bool {
        matches!(self, Self::TopRight | Self::BottomRight)
    }

    pub fn is_bottom(self) -> bool {
        matches!(self, Self::BottomLeft | Self::BottomRight)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OverlaySize {
    Small,
    Medium,
    Large,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct OverlayPosition {
    pub x: f64,
    pub y: f64,
}

impl OverlayPosition {
    pub fn sanitized(self) -> Option<Self> {
        let valid = |value: f64| value.is_finite() && value.abs() <= MAX_POSITION;
        (valid(self.x) && valid(self.y)).then(|| Self {
            x: self.x.round(),
            y: self.y.round(),
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OverlayConfig {
    pub enabled: bool,
    pub corner: OverlayCorner,
    pub size: OverlaySize,
    #[serde(default)]
    pub position: Option<OverlayPosition>,
    #[serde(default)]
    pub width: Option<f64>,
}

impl Default for OverlayConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            corner: OverlayCorner::TopLeft,
            size: OverlaySize::Medium,
            position: None,
            width: None,
        }
    }
}

pub fn clean_width(raw: f64) -> Option<f64> {
    raw.is_finite().then(|| {
        raw.clamp(f64::from(MIN_WIDTH), f64::from(MAX_WIDTH))
            .round()
    })
}

impl OverlayConfig {
    pub fn sanitized(self) -> Self {
        Self {
            position: self.position.and_then(OverlayPosition::sanitized),
            width: self.width.and_then(clean_width),
            ..self
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayMember {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
    pub color: String,
    #[serde(default)]
    pub speaking: bool,
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub deafened: bool,
}

impl OverlayMember {
    fn sanitized(self) -> Self {
        Self {
            id: self.id.chars().take(MAX_ID_CHARS).collect(),
            name: self.name.chars().take(MAX_NAME_CHARS).collect(),
            color: self.color.chars().take(MAX_COLOR_CHARS).collect(),
            avatar_url: self
                .avatar_url
                .filter(|url| is_avatar_url(url))
                .map(|url| url.chars().take(MAX_AVATAR_CHARS).collect()),
            ..self
        }
    }
}

fn is_avatar_url(url: &str) -> bool {
    ["http:", "https:", "data:"]
        .iter()
        .any(|scheme| url.starts_with(scheme))
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OverlayRoom {
    pub members: Vec<OverlayMember>,
    #[serde(default)]
    pub more: u32,
}

impl OverlayRoom {
    pub fn sanitized(self) -> Self {
        Self {
            members: self
                .members
                .into_iter()
                .take(MAX_MEMBERS)
                .map(OverlayMember::sanitized)
                .collect(),
            more: self.more,
        }
    }

    pub fn rows(&self) -> usize {
        self.members.len() + usize::from(self.more > 0)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct OverlayUpdate<'a> {
    pub room: Option<&'a OverlayRoom>,
    pub config: &'a OverlayConfig,
    pub editing: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn member(id: &str) -> OverlayMember {
        OverlayMember {
            id: id.into(),
            name: id.into(),
            avatar_url: None,
            color: "#fff".into(),
            speaking: false,
            muted: false,
            deafened: false,
        }
    }

    #[test]
    fn position_is_rounded_and_must_be_finite_and_reasonable() {
        let rounded = OverlayPosition { x: 10.6, y: -3.2 }.sanitized();
        assert_eq!(rounded, Some(OverlayPosition { x: 11.0, y: -3.0 }));
        assert_eq!(
            OverlayPosition {
                x: f64::NAN,
                y: 2.0
            }
            .sanitized(),
            None
        );
        assert_eq!(OverlayPosition { x: 1e9, y: 2.0 }.sanitized(), None);
    }

    #[test]
    fn width_is_clamped_to_the_limits() {
        assert_eq!(clean_width(5.0), Some(140.0));
        assert_eq!(clean_width(9_999.0), Some(640.0));
        assert_eq!(clean_width(380.4), Some(380.0));
        assert_eq!(clean_width(f64::NAN), None);
    }

    #[test]
    fn config_sanitizing_cleans_position_and_width() {
        let config = OverlayConfig {
            position: Some(OverlayPosition { x: 1e9, y: 0.0 }),
            width: Some(5.0),
            ..OverlayConfig::default()
        }
        .sanitized();
        assert_eq!(config.position, None);
        assert_eq!(config.width, Some(140.0));
    }

    #[test]
    fn config_reads_the_wire_format_with_nulls() {
        let config: Result<OverlayConfig, _> = serde_json::from_str(
            r#"{"enabled":true,"corner":"bottom-right","size":"large","position":null,"width":null}"#,
        );
        assert_eq!(
            config.ok(),
            Some(OverlayConfig {
                enabled: true,
                corner: OverlayCorner::BottomRight,
                size: OverlaySize::Large,
                position: None,
                width: None,
            })
        );
    }

    #[test]
    fn room_keeps_twelve_people_and_cuts_long_text() {
        let mut long = member("a");
        long.name = "n".repeat(50);
        let mut members = vec![long];
        members.extend((0..20).map(|index| member(&format!("m{index}"))));
        let room = OverlayRoom { members, more: 0 }.sanitized();
        assert_eq!(room.members.len(), 12);
        assert_eq!(room.members[0].name, "n".repeat(32));
    }

    #[test]
    fn avatar_must_be_http_https_or_data() {
        let mut dangerous = member("a");
        dangerous.avatar_url = Some("javascript:alert(1)".into());
        let mut safe = member("b");
        safe.avatar_url = Some("http://srv/a.png".into());
        let room = OverlayRoom {
            members: vec![dangerous, safe],
            more: 0,
        }
        .sanitized();
        assert_eq!(room.members[0].avatar_url, None);
        assert_eq!(
            room.members[1].avatar_url.as_deref(),
            Some("http://srv/a.png")
        );
    }

    #[test]
    fn rows_count_the_more_line() {
        let room = OverlayRoom {
            members: vec![member("a"), member("b")],
            more: 5,
        };
        assert_eq!(room.rows(), 3);
    }
}
