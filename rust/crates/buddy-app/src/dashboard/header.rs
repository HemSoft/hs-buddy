//! `WelcomeHeader`: app identity, version, Customize popover, live uptime.

use buddy_core::dashboard::DASHBOARD_CARDS;
use gpui_kit::assets::IconName;
use gpui_kit::component::button::{Button, ButtonCustomVariant, ButtonVariants as _};
use gpui_kit::component::popover::Popover;
use gpui_kit::component::{ActiveTheme, Icon, Sizable as _, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::{
    BoxShadow, Context, FontWeight, IntoElement, ParentElement, Styled, div, linear_color_stop,
    linear_gradient, point, px,
};

use super::DashboardView;
use crate::settings::Settings;
use crate::theme::BuddyPalette;

/// The product version from `package.json` (see `build.rs`).
pub const APP_VERSION: &str = env!("BUDDY_VERSION");

fn badge(
    text: String,
    icon: Option<IconName>,
    elevated: bool,
    cx: &gpui_kit::App,
) -> impl IntoElement + use<> {
    let theme = cx.theme();
    let palette = BuddyPalette::global(cx);
    h_flex()
        .items_center()
        .gap(px(5.0))
        .px(px(10.0))
        .py(px(3.0))
        .rounded(px(20.0))
        .border_1()
        .border_color(theme.border)
        .bg(if elevated {
            palette.bg_hover
        } else {
            theme.secondary
        })
        .text_size(px(11.0))
        .font_weight(FontWeight::MEDIUM)
        .text_color(palette.text_secondary)
        .when_some(icon, |this, icon| {
            this.child(Icon::new(icon).size(px(12.0)).text_color(theme.primary))
        })
        .child(text)
}

fn customize(cx: &mut Context<DashboardView>) -> impl IntoElement + use<> {
    let weak = cx.entity().downgrade();
    Popover::new("dashboard-config")
        .trigger(
            Button::new("dashboard-config-trigger")
                .outline()
                .xsmall()
                .icon(Icon::new(IconName::Settings).size(px(14.0)))
                .label("Customize")
                .tooltip("Configure dashboard cards"),
        )
        .content(move |_, _, cx| {
            let palette = *BuddyPalette::global(cx);
            let primary = cx.theme().primary;
            let foreground = cx.theme().foreground;
            // Rows are real buttons: focusable, in the tab order, keyboard-toggled.
            let row = ButtonCustomVariant::new(cx)
                .color(cx.theme().transparent)
                .foreground(foreground)
                .hover(palette.bg_hover)
                .active(palette.bg_hover)
                .shadow(false);
            let visibility: Vec<bool> = DASHBOARD_CARDS
                .iter()
                .map(|card| {
                    Settings::global(cx)
                        .config
                        .is_dashboard_card_visible(card.key())
                })
                .collect();

            v_flex()
                .min_w(px(200.0))
                .child(
                    div()
                        .px(px(8.0))
                        .pt(px(6.0))
                        .pb(px(8.0))
                        .text_size(px(10.0))
                        .font_weight(FontWeight::BOLD)
                        .text_color(palette.text_muted)
                        .child("DASHBOARD CARDS"),
                )
                .children(
                    DASHBOARD_CARDS
                        .into_iter()
                        .zip(visibility)
                        .map(|(card, visible)| {
                            let weak = weak.clone();
                            let action = if visible { "Hide" } else { "Show" };
                            Button::new(card.key())
                                .custom(row)
                                .toggled(visible)
                                .accessibility_label(format!("{action} {}", card.title()))
                                .w_full()
                                .p(px(8.0))
                                .rounded(px(6.0))
                                .font_weight(FontWeight::MEDIUM)
                                .child(
                                    h_flex()
                                        .w_full()
                                        .items_center()
                                        .gap(px(8.0))
                                        .text_size(px(12.0))
                                        .child(if visible {
                                            Icon::new(IconName::Eye)
                                                .size(px(14.0))
                                                .text_color(primary)
                                        } else {
                                            Icon::new(IconName::EyeOff)
                                                .size(px(14.0))
                                                .text_color(palette.text_muted.opacity(0.6))
                                        })
                                        .child(card.title()),
                                )
                                .on_click(move |_, _, cx| {
                                    weak.update(cx, |this, cx| this.toggle_card(card, cx)).ok();
                                })
                        }),
                )
        })
}

pub fn render(view: &DashboardView, cx: &mut Context<DashboardView>) -> impl IntoElement + use<> {
    let palette = *BuddyPalette::global(cx);
    let background = cx.theme().background;
    let uptime_ms = view.live_uptime_ms();

    h_flex()
        .w_full()
        .items_center()
        .gap(px(16.0))
        .child(
            div()
                .size(px(52.0))
                .flex_shrink_0()
                .rounded(px(12.0))
                .flex()
                .items_center()
                .justify_center()
                .bg(linear_gradient(
                    135.0,
                    linear_color_stop(palette.gold, 0.0),
                    linear_color_stop(palette.orange, 0.5),
                ))
                .shadow(vec![
                    BoxShadow {
                        color: palette.gold.opacity(0.25),
                        offset: point(px(0.0), px(4.0)),
                        blur_radius: px(16.0),
                        spread_radius: px(0.0),
                        inset: false,
                    },
                    BoxShadow {
                        color: gpui_kit::black().opacity(0.25),
                        offset: point(px(0.0), px(2.0)),
                        blur_radius: px(8.0),
                        spread_radius: px(0.0),
                        inset: false,
                    },
                ])
                .text_color(background)
                .child(Icon::new(IconName::Users).size(px(32.0))),
        )
        .child(
            v_flex()
                .flex_1()
                .min_w_0()
                .gap(px(2.0))
                .child(
                    div()
                        .text_size(px(24.0))
                        .line_height(px(29.0))
                        .font_weight(FontWeight::BOLD)
                        .text_color(palette.text_heading)
                        .child("Buddy"),
                )
                .child(
                    h_flex()
                        .items_center()
                        .gap(px(6.0))
                        .text_size(px(13.0))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(palette.gold)
                        .child(Icon::new(IconName::Handshake).size(px(15.0)))
                        .child("Your Universal Productivity Companion"),
                ),
        )
        .child(
            v_flex()
                .items_end()
                .gap(px(6.0))
                .flex_shrink_0()
                .child(
                    h_flex()
                        .items_center()
                        .gap(px(8.0))
                        .child(badge(format!("Version {APP_VERSION}"), None, true, cx))
                        .child(customize(cx)),
                )
                .when(uptime_ms > 0, |this| {
                    this.child(badge(
                        buddy_core::format::uptime(uptime_ms),
                        Some(IconName::Clock),
                        false,
                        cx,
                    ))
                }),
        )
}
