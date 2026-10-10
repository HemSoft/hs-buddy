//! Port of `TabBar.tsx`, reduced to the single pinned Dashboard tab.

use crate::zoom::zpx;
use gpui_kit::assets::IconName;
use gpui_kit::component::{ActiveTheme, Icon, h_flex};
use gpui_kit::{App, FontWeight, IntoElement, ParentElement, Styled, div};

pub const TAB_BAR_HEIGHT: f32 = 35.0;

pub fn render(cx: &App) -> impl IntoElement + use<> {
    let theme = cx.theme();
    h_flex()
        .w_full()
        .h(zpx(TAB_BAR_HEIGHT))
        .flex_shrink_0()
        .bg(theme.tab_bar)
        .border_b_1()
        .border_color(theme.border)
        .child(
            // Active tab: neutral right divider, accent on the bottom edge (`.tab.active`).
            div()
                .h_full()
                .border_r_1()
                .border_color(theme.border)
                .child(
                    h_flex()
                        .h_full()
                        .px(zpx(14.0))
                        .gap(zpx(8.0))
                        .items_center()
                        .bg(theme.tab_active)
                        .border_b_1()
                        .border_color(theme.primary)
                        .text_color(theme.tab_active_foreground)
                        .text_size(zpx(12.0))
                        .font_weight(FontWeight::MEDIUM)
                        .child(Icon::new(IconName::LayoutDashboard).size(zpx(14.0)))
                        .child("Dashboard"),
                ),
        )
}
