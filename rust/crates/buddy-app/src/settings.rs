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

    /// Mutate the config and persist it; a failed write is logged, not fatal.
    pub fn update(cx: &mut App, edit: impl FnOnce(&mut AppConfig)) {
        let settings = cx.global_mut::<Self>();
        edit(&mut settings.config);
        if let Err(err) = settings.config.save() {
            log::warn!("could not save configuration: {err}");
        }
    }
}
