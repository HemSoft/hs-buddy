//! Port of `TabBar.tsx`, reduced to the single pinned Dashboard tab.

use gpui_kit::assets::IconName;
use gpui_kit::component::{ActiveTheme, Icon, h_flex};
use gpui_kit::{App, FontWeight, IntoElement, ParentElement, Styled, px};

pub const TAB_BAR_HEIGHT: f32 = 35.0;

pub fn render(cx: &App) -> impl IntoElement + use<> {
    let theme = cx.theme();
    h_flex()
        .w_full()
        .h(px(TAB_BAR_HEIGHT))
        .flex_shrink_0()
        .bg(theme.tab_bar)
        .border_b_1()
        .border_color(theme.border)
        .child(
            h_flex()
                .h_full()
                .px(px(14.0))
                .gap(px(8.0))
                .items_center()
                .bg(theme.tab_active)
                .border_t_1()
                .border_color(theme.primary)
                .border_r_1()
                .text_color(theme.tab_active_foreground)
                .text_size(px(12.0))
                .font_weight(FontWeight::MEDIUM)
                .child(Icon::new(IconName::LayoutDashboard).size(px(14.0)))
                .child("Dashboard"),
        )
}
