//! Saving the window's placement to `window-state.json` in Electron's
//! `electron-window-state` format, so the next launch of either app restores
//! it (`main.rs` reads it back through `initial_window_bounds`).

use std::path::PathBuf;
use std::time::Duration;

use buddy_core::config::{DisplayRect, WindowState};
use gpui_kit::{Bounds, Pixels, WindowBounds};

/// How long the window must stay put before a move or resize is written, so
/// a drag writes once and a killed process still restores its last placement.
pub const SAVE_DELAY: Duration = Duration::from_millis(500);

/// The window's latest placement and the last one written to disk.
pub struct WindowPersistence {
    /// `None` when no configuration directory is known; nothing is saved.
    path: Option<PathBuf>,
    latest: Option<WindowState>,
    saved: Option<WindowState>,
    generation: u64,
}

impl WindowPersistence {
    pub fn new() -> Self {
        let path = WindowState::path()
            .inspect_err(|err| log::warn!("window state will not be saved: {err}"))
            .ok();
        Self::at(path)
    }

    fn at(path: Option<PathBuf>) -> Self {
        Self {
            path,
            latest: None,
            saved: None,
            generation: 0,
        }
    }

    /// Note the window's current placement. Returns the generation to pass
    /// to [`save_if_current`](Self::save_if_current) after [`SAVE_DELAY`],
    /// or `None` when the placement did not change.
    pub fn record(&mut self, state: WindowState) -> Option<u64> {
        if self.latest.as_ref() == Some(&state) {
            return None;
        }
        self.latest = Some(state);
        self.generation += 1;
        Some(self.generation)
    }

    /// Write the placement unless a later change superseded `generation`
    /// (that change schedules its own save).
    pub fn save_if_current(&mut self, generation: u64) {
        if generation == self.generation {
            self.flush();
        }
    }

    /// Write the latest placement unless it is already on disk. A failed
    /// write is logged; the next change or quit tries again.
    pub fn flush(&mut self) {
        let (Some(path), Some(state)) = (&self.path, &self.latest) else {
            return;
        };
        if self.saved.as_ref() == Some(state) {
            return;
        }
        match state.save_to(path) {
            Ok(()) => self.saved = Some(state.clone()),
            Err(err) => log::warn!("could not save the window state: {err}"),
        }
    }
}

/// The state to save for a window placed at `bounds` on a display covering
/// `display`. GPUI reports the restore rectangle for a maximized or full
/// screen window, which is what `electron-window-state` stores too.
pub fn capture(bounds: WindowBounds, display: Option<Bounds<Pixels>>) -> WindowState {
    let (restore, is_maximized, is_full_screen) = match bounds {
        WindowBounds::Windowed(bounds) => (bounds, false, false),
        WindowBounds::Maximized(bounds) => (bounds, true, false),
        WindowBounds::Fullscreen(bounds) => (bounds, false, true),
    };
    let rect = rect(restore);
    WindowState {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        is_maximized,
        is_full_screen,
        display_bounds: display.map(self::rect),
    }
}

fn rect(bounds: Bounds<Pixels>) -> DisplayRect {
    DisplayRect {
        x: f32::from(bounds.origin.x).into(),
        y: f32::from(bounds.origin.y).into(),
        width: f32::from(bounds.size.width).into(),
        height: f32::from(bounds.size.height).into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gpui_kit::{point, px, size};

    fn bounds(x: f32, y: f32, width: f32, height: f32) -> Bounds<Pixels> {
        Bounds {
            origin: point(px(x), px(y)),
            size: size(px(width), px(height)),
        }
    }

    #[test]
    fn capture_keeps_the_restore_rectangle_and_the_mode() {
        let display = bounds(0.0, 0.0, 1920.0, 1080.0);
        let restore = bounds(120.0, 90.0, 1000.0, 700.0);
        let cases = [
            (WindowBounds::Windowed(restore), false, false),
            (WindowBounds::Maximized(restore), true, false),
            (WindowBounds::Fullscreen(restore), false, true),
        ];
        for (window, maximized, full_screen) in cases {
            let state = capture(window, Some(display));
            assert_eq!(
                (state.x, state.y, state.width, state.height),
                (120.0, 90.0, 1000.0, 700.0)
            );
            assert_eq!(
                (state.is_maximized, state.is_full_screen),
                (maximized, full_screen)
            );
            assert_eq!(
                state.display_bounds,
                Some(DisplayRect {
                    x: 0.0,
                    y: 0.0,
                    width: 1920.0,
                    height: 1080.0
                })
            );
        }
    }

    #[test]
    fn only_the_latest_unchanged_placement_is_written() {
        let dir = std::env::temp_dir().join(format!("buddy-persist-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("window-state.json");
        let mut persistence = WindowPersistence::at(Some(path.clone()));
        let first = capture(WindowBounds::Windowed(bounds(0.0, 0.0, 800.0, 600.0)), None);
        let second = capture(
            WindowBounds::Maximized(bounds(10.0, 10.0, 900.0, 700.0)),
            None,
        );

        let stale = persistence.record(first.clone()).unwrap();
        assert_eq!(persistence.record(first), None, "unchanged placement");
        let current = persistence.record(second.clone()).unwrap();
        // The first move's timer fires after the second move: nothing yet.
        persistence.save_if_current(stale);
        let after_stale = WindowState::load_from(&path);
        persistence.save_if_current(current);
        let after_current = WindowState::load_from(&path);
        // Nothing changed since: quitting does not rewrite the file.
        std::fs::remove_file(&path).unwrap();
        persistence.flush();
        let rewritten = path.exists();
        let _ = std::fs::remove_dir_all(&dir);

        assert_eq!(after_stale, None);
        assert_eq!(after_current, Some(second));
        assert!(!rewritten);
    }
}
