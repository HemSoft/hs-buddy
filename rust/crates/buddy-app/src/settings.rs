//! The loaded configuration as a GPUI global, shared by the shell and views.

use buddy_core::config::AppConfig;
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
    pub fn update(cx: &mut App, edit: impl FnOnce(&mut AppConfig)) -> bool {
        let mut fresh = match AppConfig::load() {
            Ok(config) => config,
            Err(err) => {
                log::warn!("not saving: configuration could not be reloaded ({err})");
                return false;
            }
        };
        let settings = cx.global_mut::<Self>();
        edit(&mut fresh);
        let saved = match fresh.save() {
            Ok(()) => true,
            Err(err) => {
                log::warn!("could not save configuration: {err}");
                false
            }
        };
        settings.config = fresh;
        saved
    }

    /// Replace the in-memory configuration (used by Reload).
    pub fn replace(cx: &mut App, config: AppConfig) {
        cx.global_mut::<Self>().config = config;
    }
}
