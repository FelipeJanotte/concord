use super::model::{OverlayConfig, OverlaySize, MAX_MEMBERS};

const MARGIN: f64 = 16.0;
const GAP: i32 = 4;
const PADDING: i32 = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

pub struct Metrics {
    pub width: i32,
    pub line: i32,
}

pub fn metrics(size: OverlaySize) -> Metrics {
    match size {
        OverlaySize::Small => Metrics {
            width: 200,
            line: 26,
        },
        OverlaySize::Medium => Metrics {
            width: 250,
            line: 34,
        },
        OverlaySize::Large => Metrics {
            width: 320,
            line: 44,
        },
    }
}

pub fn height_for_lines(size: OverlaySize, lines: usize) -> i32 {
    let count = i32::try_from(lines.max(1)).unwrap_or(i32::MAX);
    PADDING * 2 + count * metrics(size).line + (count - 1) * GAP
}

pub fn width_of(config: &OverlayConfig) -> i32 {
    config
        .width
        .map_or_else(|| metrics(config.size).width, |width| width as i32)
}

pub fn is_visible(enabled: bool, has_people: bool, editing: bool, main_focused: bool) -> bool {
    enabled && (editing || (has_people && !main_focused))
}

fn scaled(value: i32, scale: f64) -> i32 {
    (f64::from(value) * scale).round() as i32
}

pub fn bounds(
    work_area: Rect,
    scale: f64,
    config: &OverlayConfig,
    rows: usize,
    editing: bool,
) -> Rect {
    let lines = rows.clamp(1, MAX_MEMBERS + 1) + usize::from(editing);
    let width = scaled(width_of(config), scale);
    let height = scaled(height_for_lines(config.size, lines), scale);
    if let Some(position) = config.position {
        let clamp = |value: f64, min: i32, max: i32| (value as i32).clamp(min, max.max(min));
        return Rect {
            x: clamp(
                position.x,
                work_area.x,
                work_area.x + work_area.width - width,
            ),
            y: clamp(
                position.y,
                work_area.y,
                work_area.y + work_area.height - height,
            ),
            width,
            height,
        };
    }
    let margin = scaled(MARGIN as i32, scale);
    Rect {
        x: if config.corner.is_right() {
            work_area.x + work_area.width - width - margin
        } else {
            work_area.x + margin
        },
        y: if config.corner.is_bottom() {
            work_area.y + work_area.height - height - margin
        } else {
            work_area.y + margin
        },
        width,
        height,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native::overlay::model::{OverlayCorner, OverlayPosition};

    const WORK_AREA: Rect = Rect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040,
    };

    fn config(corner: OverlayCorner, size: OverlaySize) -> OverlayConfig {
        OverlayConfig {
            enabled: true,
            corner,
            size,
            position: None,
            width: None,
        }
    }

    fn at(x: f64, y: f64) -> OverlayConfig {
        OverlayConfig {
            position: Some(OverlayPosition { x, y }),
            ..config(OverlayCorner::BottomRight, OverlaySize::Medium)
        }
    }

    #[test]
    fn each_corner_sits_sixteen_pixels_from_the_edge() {
        let top_left = bounds(
            WORK_AREA,
            1.0,
            &config(OverlayCorner::TopLeft, OverlaySize::Medium),
            2,
            false,
        );
        assert_eq!(
            top_left,
            Rect {
                x: 16,
                y: 16,
                width: 250,
                height: 8 * 2 + 34 * 2 + 4
            }
        );
        let bottom_right = bounds(
            WORK_AREA,
            1.0,
            &config(OverlayCorner::BottomRight, OverlaySize::Medium),
            2,
            false,
        );
        assert_eq!(
            (
                bottom_right.x + bottom_right.width,
                bottom_right.y + bottom_right.height
            ),
            (1920 - 16, 1040 - 16)
        );
        let shifted = Rect {
            x: 100,
            y: 50,
            width: 800,
            height: 600,
        };
        let top_right = bounds(
            shifted,
            1.0,
            &config(OverlayCorner::TopRight, OverlaySize::Medium),
            1,
            false,
        );
        assert_eq!(top_right.x, 100 + 800 - 250 - 16);
    }

    #[test]
    fn sizes_differ_and_height_is_capped_at_twelve_people_plus_more() {
        let width_of_size = |size| {
            bounds(
                WORK_AREA,
                1.0,
                &config(OverlayCorner::TopLeft, size),
                1,
                false,
            )
            .width
        };
        assert_eq!(
            [
                width_of_size(OverlaySize::Small),
                width_of_size(OverlaySize::Large)
            ],
            [200, 320]
        );
        let many = bounds(
            WORK_AREA,
            1.0,
            &config(OverlayCorner::TopLeft, OverlaySize::Small),
            500,
            false,
        );
        assert_eq!(many.height, 8 * 2 + 26 * 13 + 4 * 12);
    }

    #[test]
    fn editing_adds_one_line_for_the_finish_bar() {
        let cfg = config(OverlayCorner::TopLeft, OverlaySize::Medium);
        let plain = bounds(WORK_AREA, 1.0, &cfg, 2, false);
        let editing = bounds(WORK_AREA, 1.0, &cfg, 2, true);
        assert_eq!(editing.height - plain.height, 34 + 4);
        assert_eq!(editing.height, height_for_lines(OverlaySize::Medium, 3));
    }

    #[test]
    fn dragged_position_replaces_the_corner_and_stays_inside_the_work_area() {
        let placed = bounds(WORK_AREA, 1.0, &at(500.0, 300.0), 2, false);
        assert_eq!((placed.x, placed.y, placed.width), (500, 300, 250));
        let outside = bounds(WORK_AREA, 1.0, &at(5000.0, -40.0), 2, false);
        assert_eq!((outside.x + outside.width, outside.y), (1920, 0));
        let left_screen = Rect {
            x: -1280,
            y: 0,
            width: 1280,
            height: 1000,
        };
        let other = bounds(left_screen, 1.0, &at(-900.0, 100.0), 1, false);
        assert_eq!((other.x, other.y), (-900, 100));
    }

    #[test]
    fn dragged_width_replaces_the_size_width() {
        let mut cfg = config(OverlayCorner::TopRight, OverlaySize::Medium);
        cfg.width = Some(420.0);
        let rect = bounds(WORK_AREA, 1.0, &cfg, 1, false);
        assert_eq!((rect.width, rect.x), (420, 1920 - 420 - 16));
    }

    #[test]
    fn physical_size_follows_the_monitor_scale() {
        let cfg = config(OverlayCorner::TopLeft, OverlaySize::Medium);
        let rect = bounds(WORK_AREA, 1.5, &cfg, 1, false);
        assert_eq!((rect.x, rect.y, rect.width, rect.height), (24, 24, 375, 75));
    }

    #[test]
    fn hidden_while_main_is_focused_unless_editing() {
        assert!(is_visible(true, true, false, false));
        assert!(!is_visible(true, true, false, true));
        assert!(!is_visible(true, false, false, false));
        assert!(!is_visible(false, true, false, false));
        assert!(is_visible(true, true, true, true));
        assert!(is_visible(true, false, true, false));
        assert!(!is_visible(false, true, true, false));
    }
}
