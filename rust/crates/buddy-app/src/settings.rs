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
    /// step. A failed write is logged, not fatal.
    pub fn update(cx: &mut App, edit: impl FnOnce(&mut AppConfig)) {
        let settings = cx.global_mut::<Self>();
        let mut fresh = match AppConfig::load() {
            Ok(config) => config,
            Err(err) => {
                log::warn!("could not reload configuration before saving: {err}");
                settings.config.clone()
            }
        };
        edit(&mut fresh);
        if let Err(err) = fresh.save() {
            log::warn!("could not save configuration: {err}");
        }
        settings.config = fresh;
    }

    /// Replace the in-memory configuration (used by Reload).
    pub fn replace(cx: &mut App, config: AppConfig) {
        cx.global_mut::<Self>().config = config;
    }
}
