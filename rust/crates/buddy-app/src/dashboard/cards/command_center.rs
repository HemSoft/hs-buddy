//! `CommandCenterCard`: Copilot usage summary (span 2).

use buddy_core::format::{currency, thousands};
use gpui_kit::assets::IconName;
use gpui_kit::component::{ActiveTheme, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::{
    AnyElement, Context, FontWeight, IntoElement, ParentElement, Styled, div, linear_color_stop,
    linear_gradient, px,
};

use crate::app::Section;
use crate::dashboard::DashboardView;
use crate::dashboard::primitives::{Pill, StatCard, icon_box, section, section_heading, stat_card};
use crate::theme::{BuddyPalette, hex};

pub fn render(view: &DashboardView, cx: &mut Context<DashboardView>) -> AnyElement {
    let summary = view.command_center().clone();
    let copilot_error = view.copilot_error();
    let palette = *BuddyPalette::global(cx);
    let secondary = cx.theme().secondary;
    let has_accounts = summary.has_accounts();

    let accent = hex("#70e091");
    let copilot = hex("#5fe1ff");
    let copilot_soft = hex("#6ad6c0");
    let copilot_soft_bg = hex("#4ec9b0").opacity(0.12);
    let overage = hex("#f2b05e");
    let overage_bg = overage.opacity(0.14);
    let overage_card_border = hex("#e89b3c").opacity(0.22);
    let overage_card_bg = linear_gradient(
        135.0,
        linear_color_stop(hex("#e89b3c").opacity(0.08), 0.0),
        linear_color_stop(secondary, 1.0),
    );

    let projected = summary
        .projected_total
        .map(thousands)
        .unwrap_or_else(|| "…".to_string());
    let projected_overage = match summary.projected_overage_cost {
        Some(cost) if cost > 0.0 => currency(cost),
        _ => "$0.00".to_string(),
    };

    let open_label = if has_accounts {
        "Open Usage"
    } else {
        "Configure Accounts"
    };
    let open_target = if has_accounts {
        Section::Copilot
    } else {
        Section::Settings
    };

    section(Some(accent), cx)
        .child(section_heading(
            "Copilot usage",
            "Command Center",
            "Live spend, projection, and account health at a glance",
            cx,
        ))
        .child(
            h_flex()
                .w_full()
                .items_center()
                .justify_between()
                .gap(px(16.0))
                .flex_wrap()
                .child(
                    h_flex()
                        .items_center()
                        .gap(px(10.0))
                        .child(icon_box(
                            32.0,
                            7.0,
                            IconName::Sparkles,
                            18.0,
                            copilot,
                            copilot.opacity(0.12),
                        ))
                        .child(
                            v_flex()
                                .gap(px(2.0))
                                .child(
                                    div()
                                        .text_size(px(12.0))
                                        .font_weight(FontWeight::BOLD)
                                        .text_color(palette.text_heading)
                                        .child("CONNECTED ACCOUNTS"),
                                )
                                .child(
                                    div()
                                        .text_size(px(11.0))
                                        .text_color(palette.text_secondary)
                                        .child(if summary.loading {
                                            "Refreshing usage…".to_string()
                                        } else {
                                            summary.account_description()
                                        }),
                                )
                                .when_some(copilot_error, |this, error| {
                                    this.child(
                                        div()
                                            .text_size(px(10.0))
                                            .text_color(palette.accent_error)
                                            .child(error),
                                    )
                                }),
                        ),
                )
                .child(
                    h_flex()
                        .items_center()
                        .gap(px(8.0))
                        .child(
                            Pill::new("cc-refresh", "Refresh")
                                .icon(IconName::RefreshCw)
                                .disabled(summary.loading || !has_accounts)
                                .tooltip("Refresh Copilot usage data")
                                .build(
                                    cx.listener(|this, _, _, cx| this.refresh_copilot_usage(cx)),
                                    cx,
                                ),
                        )
                        .child(
                            Pill::new("cc-open", open_label)
                                .trailing(IconName::ArrowRight)
                                .build(
                                    cx.listener(move |this, _, _, cx| {
                                        this.navigate(open_target, cx)
                                    }),
                                    cx,
                                ),
                        ),
                ),
        )
        .child(
            h_flex()
                .w_full()
                .gap(px(10.0))
                .child(stat_card(
                    StatCard::new(IconName::Zap, thousands(summary.total_used), "Total Used")
                        .icon_colors(copilot_soft, copilot_soft_bg),
                    cx,
                ))
                .child(stat_card(
                    StatCard::new(
                        IconName::Sparkles,
                        currency(summary.total_overage_cost),
                        "Total Overage",
                    )
                    .icon_colors(copilot_soft, copilot_soft_bg),
                    cx,
                ))
                .child(stat_card(
                    StatCard::new(IconName::Activity, projected, "Projected")
                        .icon_colors(copilot_soft, copilot_soft_bg),
                    cx,
                ))
                .child(stat_card(
                    StatCard::new(IconName::ArrowRight, projected_overage, "Est. Overage")
                        .icon_colors(overage, overage_bg)
                        .card_style(overage_card_bg, overage_card_border),
                    cx,
                )),
        )
        .into_any_element()
}
