//! The loaded configuration as a GPUI global, shared by the shell and views.

use buddy_core::config::{AppConfig, UiConfig};
use gpui_kit::{App, Global};

pub struct Settings {
    pub config: AppConfig,
}

impl Global for Settings {}

impl Settings {
    pub fn global(cx: &App) -> &Self {
        cx.global::<Self>()
    }

    /// Re-read the file (Electron may have written it meanwhile), apply the
    /// edit to that fresh copy, persist it, and keep the in-memory copy in
    /// step. If the file cannot be read, the edit is abandoned rather than
    /// serializing a fallback over a file that may still hold recoverable
    /// data; a failed write is logged, not fatal.
    ///
    /// Returns `true` once the edit is on disk, so callers that must not
    /// forget a pending change can keep it pending.
    ///
    /// The file is shared with Electron, which may write between the reload
    /// and the save; the save is refused when the file changed meanwhile and
    /// the edit is applied again to the newer content (a few attempts).
    pub fn update(cx: &mut App, edit: impl Fn(&mut AppConfig)) -> bool {
        const ATTEMPTS: usize = 3;
        for attempt in 1..=ATTEMPTS {
            let (mut fresh, stamp) = match AppConfig::load_with_stamp() {
                Ok(loaded) => loaded,
                Err(err) => {
                    log::warn!("not saving: configuration could not be reloaded ({err})");
                    return false;
                }
            };
            edit(&mut fresh);
            match fresh.save_if_unchanged(&stamp) {
                Ok(true) => {
                    // The reload may have merged appearance changes Electron
                    // made meanwhile; the GPUI theme is derived state and has
                    // to follow, as it does on Reload Configuration.
                    let appearance_changed =
                        appearance_differs(&cx.global::<Self>().config.ui, &fresh.ui);
                    cx.global_mut::<Self>().config = fresh;
                    if appearance_changed {
                        let config = cx.global::<Self>().config.clone();
                        crate::theme::install(&config, cx);
                        cx.refresh_windows();
                    }
                    return true;
                }
                Ok(false) if attempt < ATTEMPTS => {
                    log::info!("configuration changed on disk while editing; applying again");
                }
                Ok(false) => {
                    log::warn!("configuration kept changing on disk; edit not saved");
                    Self::resync(cx);
                    return false;
                }
                Err(err) => {
                    log::warn!("could not save configuration: {err}");
                    Self::resync(cx);
                    return false;
                }
            }
        }
        false
    }

    /// After a failed save the in-memory copy must reflect the disk, not the
    /// edit that never landed, so the UI does not show a state that a
    /// restart would undo.
    fn resync(cx: &mut App) {
        match AppConfig::load() {
            Ok(disk) => cx.global_mut::<Self>().config = disk,
            Err(err) => log::warn!("configuration left as last loaded; reload failed: {err}"),
        }
    }

    /// Replace the in-memory configuration (used by Reload).
    pub fn replace(cx: &mut App, config: AppConfig) {
        cx.global_mut::<Self>().config = config;
    }
}

/// The `ui` fields `theme::install` reads.
fn appearance_differs(a: &UiConfig, b: &UiConfig) -> bool {
    a.theme != b.theme
        || a.accent_color != b.accent_color
        || a.bg_primary != b.bg_primary
        || a.bg_secondary != b.bg_secondary
        || a.font_color != b.font_color
        || a.font_family != b.font_family
        || a.mono_font_family != b.mono_font_family
        || a.status_bar_bg != b.status_bar_bg
        || a.status_bar_fg != b.status_bar_fg
}
