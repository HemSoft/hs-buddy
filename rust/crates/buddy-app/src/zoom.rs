//! App-wide zoom (View → Zoom In / Zoom Out / Reset Zoom, Ctrl or Cmd with
//! `=`, `-`, `0`, or the mouse wheel).
//!
//! Zoom is the window's rem size: gpui-component's root sets it from the
//! theme's `font_size` every frame, so scaling that one value scales every
//! component. Buddy's own sizes are written with [`zpx`], a length in pixels
//! at 100% expressed in rems, so they follow too. Use [`scaled`] where an API
//! needs absolute `Pixels` (shadows, viewport breakpoints, icon sizes).

use std::path::PathBuf;

use buddy_core::zoom::{Zoom, ZoomStep, zoom_path};
use gpui_kit::component::Theme;
use gpui_kit::{
    AnyElement, App, Bounds, DispatchPhase, Element, ElementId, Global, GlobalElementId,
    InspectorElementId, IntoElement, KeyBinding, LayoutId, Pixels, Rems, ScrollDelta,
    ScrollWheelEvent, Styled, Window, canvas, px, rems,
};

use crate::app::{ResetZoom, ZoomIn, ZoomOut};

/// The rem size at 100%: gpui-component's default theme font size, which
/// Buddy's themes do not override.
pub const BASE_REM: f32 = 16.0;

/// A wheel's pixel deltas (trackpads) count one line per this many pixels.
const PIXELS_PER_LINE: f32 = 20.0;

/// `value` pixels at 100% zoom, as a length that follows the zoom.
pub fn zpx(value: f32) -> Rems {
    rems(value / BASE_REM)
}

/// `value` pixels at 100% zoom, resolved to absolute pixels at the current
/// zoom.
pub fn scaled(cx: &App, value: f32) -> Pixels {
    px(value * factor(cx))
}

fn factor(cx: &App) -> f32 {
    cx.try_global::<ZoomState>()
        .map_or(1.0, |state| state.zoom.factor())
}

struct ZoomState {
    zoom: Zoom,
    /// `zoom-level.json`, resolved once so the level is read from and saved
    /// to the same file; `None` when no config directory is known.
    path: Option<PathBuf>,
    /// The theme's mono font size at 100%, captured after each theme install.
    base_mono_font_size: Pixels,
    /// Wheel travel not yet turned into a step, in lines.
    pending_wheel_lines: f32,
}

impl Global for ZoomState {}

/// Restore the saved zoom and register the zoom actions and shortcuts. Call
/// once, after `theme::install`.
pub fn init(cx: &mut App) {
    let path = zoom_path()
        .inspect_err(|err| log::warn!("zoom level will not be saved: {err}"))
        .ok();
    init_at(path, cx);
}

fn init_at(path: Option<PathBuf>, cx: &mut App) {
    let zoom = path
        .as_deref()
        .map(Zoom::load_from)
        .transpose()
        .unwrap_or_else(|err| {
            log::warn!("using 100% zoom: {err}");
            None
        })
        .unwrap_or_default();
    cx.set_global(ZoomState {
        zoom,
        path,
        base_mono_font_size: Theme::global(cx).mono_font_size,
        pending_wheel_lines: 0.0,
    });
    cx.bind_keys([
        // The menus show the last binding added for an action.
        KeyBinding::new("secondary-+", ZoomIn, None),
        KeyBinding::new("secondary-shift-=", ZoomIn, None),
        KeyBinding::new("secondary-=", ZoomIn, None),
        KeyBinding::new("secondary--", ZoomOut, None),
        KeyBinding::new("secondary-0", ResetZoom, None),
    ]);
    cx.on_action(|_: &ZoomIn, cx| step(ZoomStep::In, cx));
    cx.on_action(|_: &ZoomOut, cx| step(ZoomStep::Out, cx));
    cx.on_action(|_: &ResetZoom, cx| step(ZoomStep::Reset, cx));
    apply(cx);
}

/// `theme::install` resets the theme's font sizes to 100%; scale them again.
pub fn theme_installed(cx: &mut App) {
    if !cx.has_global::<ZoomState>() {
        return;
    }
    let mono = Theme::global(cx).mono_font_size;
    cx.global_mut::<ZoomState>().base_mono_font_size = mono;
    apply(cx);
}

/// Apply one zoom step and save the result for the next launch.
pub fn step(step: ZoomStep, cx: &mut App) {
    let Some(state) = cx.try_global::<ZoomState>() else {
        return;
    };
    let next = state.zoom.step(step);
    if next == state.zoom {
        return;
    }
    let path = state.path.clone();
    cx.global_mut::<ZoomState>().zoom = next;
    apply(cx);
    if let Some(path) = path
        && let Err(err) = next.save_to(&path)
    {
        log::warn!("could not save the zoom level: {err}");
    }
}

fn apply(cx: &mut App) {
    let state = cx.global::<ZoomState>();
    let factor = state.zoom.factor();
    let mono = state.base_mono_font_size * factor;
    Theme::update(cx, |theme| {
        theme.font_size = px(BASE_REM * factor);
        theme.mono_font_size = mono;
    });
    cx.refresh_windows();
}

/// Lays out and paints `child` with a fixed rem size, for a subtree that must
/// not follow the zoom (or must follow it inside one that does not).
pub struct WithRemSize {
    rem_size: Pixels,
    child: AnyElement,
}

/// `child` at 100%, whatever the zoom.
pub fn unzoomed(child: impl IntoElement) -> WithRemSize {
    WithRemSize {
        rem_size: px(BASE_REM),
        child: child.into_any_element(),
    }
}

/// `child` at the current zoom, inside an [`unzoomed`] subtree.
pub fn zoomed(cx: &App, child: impl IntoElement) -> WithRemSize {
    WithRemSize {
        rem_size: scaled(cx, BASE_REM),
        child: child.into_any_element(),
    }
}

impl IntoElement for WithRemSize {
    type Element = Self;

    fn into_element(self) -> Self {
        self
    }
}

impl Element for WithRemSize {
    type RequestLayoutState = ();
    type PrepaintState = ();

    fn id(&self) -> Option<ElementId> {
        None
    }

    fn source_location(&self) -> Option<&'static std::panic::Location<'static>> {
        None
    }

    fn request_layout(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, ()) {
        let layout_id = window.with_rem_size(Some(self.rem_size), |window| {
            self.child.request_layout(window, cx)
        });
        (layout_id, ())
    }

    fn prepaint(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&InspectorElementId>,
        _bounds: Bounds<Pixels>,
        _request_layout: &mut (),
        window: &mut Window,
        cx: &mut App,
    ) {
        window.with_rem_size(Some(self.rem_size), |window| {
            self.child.prepaint(window, cx);
        });
    }

    fn paint(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&InspectorElementId>,
        _bounds: Bounds<Pixels>,
        _request_layout: &mut (),
        _prepaint: &mut (),
        window: &mut Window,
        cx: &mut App,
    ) {
        window.with_rem_size(Some(self.rem_size), |window| {
            self.child.paint(window, cx);
        });
    }
}

/// Turn wheel travel into at most one step: a full line in one direction
/// steps once, and reversing direction discards the leftover travel.
fn accumulate_wheel(pending: &mut f32, lines: f32) -> Option<ZoomStep> {
    if lines == 0.0 {
        return None;
    }
    if pending.signum() != lines.signum() {
        *pending = 0.0;
    }
    *pending += lines;
    let step = if *pending >= 1.0 {
        ZoomStep::In
    } else if *pending <= -1.0 {
        ZoomStep::Out
    } else {
        return None;
    };
    *pending = 0.0;
    Some(step)
}

fn wheel_lines(delta: ScrollDelta) -> f32 {
    match delta {
        ScrollDelta::Lines(lines) => lines.y,
        ScrollDelta::Pixels(pixels) => pixels.y / px(PIXELS_PER_LINE),
    }
}

/// Ctrl (Cmd on macOS) + wheel zooms: wheel up zooms in. The listener runs
/// in the capture phase and stops propagation, so the scrollable view under
/// the pointer does not scroll as well.
pub fn wheel_listener() -> impl IntoElement {
    canvas(
        |_, _, _| {},
        |_, _, window, _| {
            window.on_mouse_event(|event: &ScrollWheelEvent, phase, _, cx| {
                if phase != DispatchPhase::Capture || !event.modifiers.secondary() {
                    return;
                }
                cx.stop_propagation();
                let lines = wheel_lines(event.delta);
                let Some(state) = cx.try_global::<ZoomState>() else {
                    return;
                };
                let mut pending = state.pending_wheel_lines;
                let step_taken = accumulate_wheel(&mut pending, lines);
                cx.global_mut::<ZoomState>().pending_wheel_lines = pending;
                if let Some(zoom_step) = step_taken {
                    step(zoom_step, cx);
                }
            });
        },
    )
    .absolute()
    .size_0()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_wheel_notch_steps_once() {
        let mut pending = 0.0;
        // Windows reports a notch as `wheel_scroll_lines` (3 by default).
        assert_eq!(accumulate_wheel(&mut pending, 3.0), Some(ZoomStep::In));
        assert_eq!(accumulate_wheel(&mut pending, -3.0), Some(ZoomStep::Out));
        assert_eq!(pending, 0.0);
    }

    #[test]
    fn small_trackpad_deltas_add_up_to_a_step() {
        let mut pending = 0.0;
        assert_eq!(accumulate_wheel(&mut pending, 0.4), None);
        assert_eq!(accumulate_wheel(&mut pending, 0.4), None);
        assert_eq!(accumulate_wheel(&mut pending, 0.4), Some(ZoomStep::In));
        // Reversing discards travel in the old direction.
        assert_eq!(accumulate_wheel(&mut pending, 0.6), None);
        assert_eq!(accumulate_wheel(&mut pending, -0.6), None);
        assert_eq!(accumulate_wheel(&mut pending, -0.6), Some(ZoomStep::Out));
        assert_eq!(accumulate_wheel(&mut pending, 0.0), None);
    }

    #[test]
    fn pixel_deltas_convert_to_lines() {
        let delta = ScrollDelta::Pixels(gpui_kit::point(px(0.0), px(-40.0)));
        assert_eq!(wheel_lines(delta), -2.0);
    }

    #[test]
    fn zpx_is_pixels_at_one_hundred_percent() {
        assert_eq!(zpx(13.0).to_pixels(px(BASE_REM)), px(13.0));
        // At 150% the rem is 24px, so the same length is 19.5px.
        assert_eq!(zpx(13.0).to_pixels(px(BASE_REM * 1.5)), px(19.5));
    }
}

#[cfg(test)]
mod ui_tests {
    use gpui_kit::test::{TestSupportExt as _, TestWindowExt as _};
    use gpui_kit::{
        AnyWindowHandle, AppContext as _, Context, InteractiveElement as _, Modifiers,
        ParentElement as _, PlatformInput, Render, TestAppContext, WindowBounds, WindowOptions,
        div, point, size,
    };

    use super::*;

    struct Probe;

    impl Render for Probe {
        fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
            div()
                .size_full()
                .child(
                    div()
                        .id("follows")
                        .test_support()
                        .w(zpx(100.0))
                        .h(zpx(20.0)),
                )
                .child(unzoomed(
                    div()
                        .id("fixed")
                        .test_support()
                        .w(zpx(100.0))
                        .h(zpx(20.0))
                        .child(zoomed(
                            cx,
                            div().id("nested").test_support().w(zpx(100.0)).h(zpx(20.0)),
                        )),
                ))
                .child(wheel_listener())
        }
    }

    fn open(cx: &mut TestAppContext, path: PathBuf) -> AnyWindowHandle {
        cx.update(|cx| {
            gpui_kit::init(cx);
            init_at(Some(path), cx);
            let bounds = Bounds {
                origin: point(px(0.0), px(0.0)),
                size: size(px(640.0), px(480.0)),
            };
            let options = WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                ..Default::default()
            };
            gpui_kit::open_window(options, cx, |_, cx| cx.new(|_| Probe))
                .expect("open test window")
                .0
        })
    }

    fn width(window: &mut Window, id: &'static str, cx: &mut App) -> f32 {
        window.render_frame(cx);
        f32::from(window.find(id).bounds().size.width)
    }

    fn ctrl_wheel(window: &mut Window, lines: f32, cx: &mut App) {
        let event = ScrollWheelEvent {
            position: point(px(320.0), px(240.0)),
            delta: ScrollDelta::Lines(point(0.0, lines)),
            modifiers: Modifiers::secondary_key(),
            ..Default::default()
        };
        window.dispatch_event(PlatformInput::ScrollWheel(event), cx);
    }

    fn temp_zoom_file(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("buddy-zoom-ui-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("zoom-level.json")
    }

    #[gpui_kit::test]
    fn shortcuts_zoom_rem_sized_ui_and_save_the_level(cx: &mut TestAppContext) {
        let path = temp_zoom_file("keys");
        let handle = open(cx, path.clone());
        let mut widths = Vec::new();
        let mut saved = Vec::new();
        cx.update_window(handle, |_, window, cx| {
            widths.push(width(window, "follows", cx));
            for key in [
                "secondary-=",
                "secondary-shift-=",
                "secondary-+",
                "secondary--",
                "secondary-0",
            ] {
                window.press(key, cx);
                widths.push(width(window, "follows", cx));
                saved.push(std::fs::read_to_string(&path).unwrap_or_default());
            }
        })
        .unwrap();
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
        assert_eq!(widths, vec![100.0, 110.0, 120.0, 130.0, 120.0, 100.0]);
        assert_eq!(saved[1], "{\"zoomFactor\":1.2}");
        assert_eq!(saved[4], "{\"zoomFactor\":1.0}");
    }

    #[gpui_kit::test]
    fn ctrl_wheel_zooms_one_step_per_notch(cx: &mut TestAppContext) {
        let path = temp_zoom_file("wheel");
        let handle = open(cx, path.clone());
        let mut widths = Vec::new();
        cx.update_window(handle, |_, window, cx| {
            window.render_frame(cx);
            ctrl_wheel(window, 3.0, cx);
            widths.push(width(window, "follows", cx));
            ctrl_wheel(window, 3.0, cx);
            widths.push(width(window, "follows", cx));
            ctrl_wheel(window, -3.0, cx);
            widths.push(width(window, "follows", cx));
        })
        .unwrap();
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
        assert_eq!(widths, vec![110.0, 120.0, 110.0]);
    }

    #[gpui_kit::test]
    fn a_saved_level_is_restored_and_limits_hold(cx: &mut TestAppContext) {
        let path = temp_zoom_file("restore");
        Zoom::from_factor(2.9).save_to(&path).unwrap();
        let handle = open(cx, path.clone());
        let mut widths = Vec::new();
        cx.update_window(handle, |_, window, cx| {
            widths.push(width(window, "follows", cx));
            window.press("secondary-=", cx);
            window.press("secondary-=", cx);
            widths.push(width(window, "follows", cx));
        })
        .unwrap();
        let saved = std::fs::read_to_string(&path).unwrap();
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
        assert_eq!(widths, vec![290.0, 300.0]);
        assert_eq!(saved, "{\"zoomFactor\":3.0}");
    }

    #[gpui_kit::test]
    fn unzoomed_subtrees_keep_their_size_and_zoomed_ones_follow(cx: &mut TestAppContext) {
        let path = temp_zoom_file("subtree");
        Zoom::from_factor(1.5).save_to(&path).unwrap();
        let handle = open(cx, path.clone());
        let mut widths = Vec::new();
        cx.update_window(handle, |_, window, cx| {
            for id in ["follows", "fixed", "nested"] {
                widths.push(width(window, id, cx));
            }
        })
        .unwrap();
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
        assert_eq!(widths, vec![150.0, 100.0, 150.0]);
    }
}
