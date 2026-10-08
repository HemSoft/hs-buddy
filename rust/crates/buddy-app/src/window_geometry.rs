//! Placing a saved window on today's displays (`src/utils/windowGeometry.ts`).

use gpui_kit::{Bounds, Pixels, point, px, size};

/// A display's full bounds and the part not covered by taskbars or docks.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DisplayArea {
    pub bounds: Bounds<Pixels>,
    pub work_area: Bounds<Pixels>,
}

/// Fit a saved windowed rectangle onto the current displays.
///
/// The display sharing the most area with the rectangle wins (Electron's
/// `getDisplayMatching`), and the rectangle is clamped to that display's
/// work area so no edge hides under a taskbar or dock. A rectangle that
/// touches no display keeps its size and is centred on `primary`; `None`
/// means there is no display to place it on.
pub fn resolve_window_bounds(
    saved: Bounds<Pixels>,
    displays: &[DisplayArea],
    primary: Option<&DisplayArea>,
) -> Option<Bounds<Pixels>> {
    let saved = Rect::from(saved);
    let matching = displays
        .iter()
        .map(|display| (display, saved.overlap(&Rect::from(display.bounds))))
        .filter(|(_, overlap)| *overlap > 0.0)
        .max_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(display, _)| display);
    let placed = match matching {
        Some(display) => saved.clamp_to(&Rect::from(display.work_area)),
        None => saved.center_on(&Rect::from(primary?.work_area)),
    };
    Some(placed.into())
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct Rect {
    x: f32,
    y: f32,
    width: f32,
    height: f32,
}

impl Rect {
    fn overlap(&self, other: &Rect) -> f32 {
        let left = self.x.max(other.x);
        let top = self.y.max(other.y);
        let right = (self.x + self.width).min(other.x + other.width);
        let bottom = (self.y + self.height).min(other.y + other.height);
        if right <= left || bottom <= top {
            0.0
        } else {
            (right - left) * (bottom - top)
        }
    }

    /// `clampToWorkArea`: shrink to fit, then slide fully inside.
    fn clamp_to(&self, area: &Rect) -> Rect {
        let width = self.width.min(area.width);
        let height = self.height.min(area.height);
        Rect {
            x: self.x.min(area.x + area.width - width).max(area.x),
            y: self.y.min(area.y + area.height - height).max(area.y),
            width,
            height,
        }
    }

    /// `centerOnDisplay`: shrink to fit, then centre.
    fn center_on(&self, area: &Rect) -> Rect {
        let width = self.width.min(area.width);
        let height = self.height.min(area.height);
        Rect {
            x: area.x + ((area.width - width) / 2.0).round(),
            y: area.y + ((area.height - height) / 2.0).round(),
            width,
            height,
        }
    }
}

impl From<Bounds<Pixels>> for Rect {
    fn from(bounds: Bounds<Pixels>) -> Self {
        Rect {
            x: f32::from(bounds.origin.x),
            y: f32::from(bounds.origin.y),
            width: f32::from(bounds.size.width),
            height: f32::from(bounds.size.height),
        }
    }
}

impl From<Rect> for Bounds<Pixels> {
    fn from(rect: Rect) -> Self {
        Bounds {
            origin: point(px(rect.x), px(rect.y)),
            size: size(px(rect.width), px(rect.height)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bounds(x: f32, y: f32, width: f32, height: f32) -> Bounds<Pixels> {
        Bounds {
            origin: point(px(x), px(y)),
            size: size(px(width), px(height)),
        }
    }

    fn display(x: f32, y: f32, width: f32, height: f32, taskbar: f32) -> DisplayArea {
        DisplayArea {
            bounds: bounds(x, y, width, height),
            work_area: bounds(x, y, width, height - taskbar),
        }
    }

    #[test]
    fn window_hanging_off_the_edge_is_slid_into_the_work_area() {
        let primary = display(0.0, 0.0, 1920.0, 1080.0, 40.0);
        let placed = resolve_window_bounds(
            bounds(1500.0, 900.0, 800.0, 600.0),
            &[primary],
            Some(&primary),
        )
        .unwrap();
        assert_eq!(placed, bounds(1120.0, 440.0, 800.0, 600.0));
    }

    #[test]
    fn oversized_window_shrinks_to_the_work_area() {
        let primary = display(0.0, 0.0, 1280.0, 800.0, 48.0);
        let placed = resolve_window_bounds(
            bounds(-10.0, -10.0, 2000.0, 1200.0),
            &[primary],
            Some(&primary),
        )
        .unwrap();
        assert_eq!(placed, bounds(0.0, 0.0, 1280.0, 752.0));
    }

    #[test]
    fn display_with_the_largest_overlap_wins() {
        let left = display(0.0, 0.0, 1920.0, 1080.0, 40.0);
        let right = display(1920.0, 0.0, 1920.0, 1080.0, 40.0);
        // Straddles the seam, mostly on the right display: stays there.
        let placed = resolve_window_bounds(
            bounds(1600.0, 100.0, 800.0, 600.0),
            &[left, right],
            Some(&left),
        )
        .unwrap();
        assert_eq!(placed, bounds(1920.0, 100.0, 800.0, 600.0));
    }

    #[test]
    fn window_on_a_disconnected_display_is_centred_on_the_primary() {
        let primary = display(0.0, 0.0, 1920.0, 1080.0, 40.0);
        let placed = resolve_window_bounds(
            bounds(4000.0, 200.0, 800.0, 600.0),
            &[primary],
            Some(&primary),
        )
        .unwrap();
        assert_eq!(placed, bounds(560.0, 220.0, 800.0, 600.0));
    }

    #[test]
    fn no_displays_at_all_yields_none() {
        assert!(resolve_window_bounds(bounds(0.0, 0.0, 800.0, 600.0), &[], None).is_none());
    }
}
