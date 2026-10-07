mod app;
mod assets;
mod dashboard;
mod runtime;
mod settings;
mod shell;
mod theme;

use buddy_core::config::{AppConfig, WindowState};
use gpui_kit::component::TitleBar;
use gpui_kit::{
    App, AppContext as _, Bounds, KeyBinding, Pixels, TitlebarOptions, WindowBounds,
    WindowDecorations, WindowOptions, point, px, size,
};

use crate::app::{About, BuddyApp, Quit, Reload, ToggleFullScreen};
use crate::assets::BuddyAssets;
use crate::runtime::Runtime;
use crate::settings::Settings;
use gpui_kit::component::WindowExt as _;

/// Reuse the geometry Electron saved in `window-state.json` when it still
/// lands on a connected display; otherwise center a default-sized window.
fn initial_window_bounds(cx: &App) -> WindowBounds {
    let fallback =
        || WindowBounds::Windowed(Bounds::centered(None, size(px(1280.0), px(820.0)), cx));
    let Some(state) = WindowState::load() else {
        return fallback();
    };
    let bounds: Bounds<Pixels> = Bounds {
        origin: point(px(state.x as f32), px(state.y as f32)),
        size: size(px(state.width as f32), px(state.height as f32)),
    };
    let on_a_display = cx
        .displays()
        .iter()
        .any(|display| display.bounds().contains(&bounds.center()));
    if !on_a_display {
        return fallback();
    }
    if state.is_maximized {
        WindowBounds::Maximized(bounds)
    } else {
        WindowBounds::Windowed(bounds)
    }
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let config = match AppConfig::load() {
        Ok(config) => config,
        Err(err) => {
            log::warn!("using default configuration: {err}");
            AppConfig::default()
        }
    };

    gpui_kit::application()
        .with_assets(BuddyAssets)
        .run(move |cx| {
            gpui_kit::init(cx);
            theme::install(&config, cx);
            cx.set_global(Settings {
                config: config.clone(),
            });
            cx.set_global(Runtime::start());

            cx.bind_keys([
                KeyBinding::new("ctrl-q", Quit, None),
                KeyBinding::new("cmd-q", Quit, None),
                KeyBinding::new("f11", ToggleFullScreen, None),
            ]);
            cx.on_action(|_: &Quit, cx| cx.quit());
            cx.on_action(|_: &ToggleFullScreen, cx| {
                if let Some(window) = cx.active_window() {
                    window
                        .update(cx, |_, window, _| window.toggle_fullscreen())
                        .ok();
                }
            });
            cx.on_action(|_: &Reload, cx| match AppConfig::load() {
                Ok(config) => {
                    theme::install(&config, cx);
                    Settings::replace(cx, config);
                    cx.refresh_windows();
                }
                Err(err) => log::warn!("reload failed: {err}"),
            });
            cx.on_action(|_: &About, cx| {
                if let Some(window) = cx.active_window() {
                    window
                        .update(cx, |_, window, cx| {
                            window.open_alert_dialog(cx, |alert, _, _| {
                                alert.title("About Buddy").description(format!(
                                    "Buddy {} (native GPUI build)\nYour Universal Productivity Companion\nMade with love by HemSoft Developments",
                                    env!("CARGO_PKG_VERSION")
                                ))
                            })
                        })
                        .ok();
                }
            });
            cx.on_window_closed(|cx, _| {
                if cx.windows().is_empty() {
                    cx.quit();
                }
            })
            .detach();

            let options = WindowOptions {
                window_bounds: Some(initial_window_bounds(cx)),
                window_min_size: Some(size(px(800.0), px(600.0))),
                window_decorations: Some(WindowDecorations::Client),
                app_id: Some("com.hemsoft.buddy".into()),
                titlebar: Some(TitlebarOptions {
                    title: Some("Buddy".into()),
                    ..TitleBar::title_bar_options()
                }),
                ..TitleBar::window_options()
            };

            gpui_kit::open_window(options, cx, |window, cx| {
                cx.new(|cx| BuddyApp::new(window, cx))
            })
            .expect("failed to open the Buddy window");
            cx.activate(true);
        });
}
