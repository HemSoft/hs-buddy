//! Port of `StatusBar.tsx`: compact status items on the configured colors.
//! Only metrics the native app can actually provide are shown.

use gpui_kit::assets::IconName;
use gpui_kit::component::status_bar::StatusBar;
use gpui_kit::component::{ActiveTheme, Icon, h_flex};
use gpui_kit::{App, IntoElement, ParentElement, SharedString, Styled, px};

use crate::app::BuddyApp;
use crate::theme::BuddyPalette;

pub const STATUS_BAR_HEIGHT: f32 = 22.0;

fn status_item(icon: IconName, text: impl Into<SharedString>) -> impl IntoElement {
    h_flex()
        .h_full()
        .px(px(8.0))
        .gap(px(5.0))
        .items_center()
        .child(Icon::new(icon).size(px(12.0)))
        .child(text.into())
}

pub fn render(app: &BuddyApp, cx: &App) -> impl IntoElement + use<> {
    let palette = BuddyPalette::global(cx);
    let theme = cx.theme();
    // The account `gh` is actually using, like the Electron status bar; not
    // merely the first configured account.
    let account = app
        .active_account
        .clone()
        .unwrap_or_else(|| "No gh account".to_string());
    // `formatTime(now, { seconds: true })`: the locale's clock convention.
    let now = chrono::Local::now();
    let clock = buddy_core::format::clock(now.time())
        .unwrap_or_else(|| now.format("%-I:%M:%S %p").to_string());

    StatusBar::new()
        .h(px(STATUS_BAR_HEIGHT))
        .bg(theme.status_bar)
        .border_t_1()
        .border_color(theme.status_bar_border)
        .text_color(palette.status_bar_fg)
        .text_size(px(11.0))
        .left(status_item(IconName::Users, account))
        .right(status_item(IconName::Clock, clock))
}
