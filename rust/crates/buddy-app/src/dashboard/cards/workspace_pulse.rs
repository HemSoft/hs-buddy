//! `WorkspacePulseCard`: lifetime activity counters.

use buddy_core::format::thousands;
use gpui_kit::assets::IconName;
use gpui_kit::component::{h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::{AnyElement, Context, IntoElement, ParentElement, Styled, div, px};

use crate::dashboard::DashboardView;
use crate::dashboard::primitives::{StatCard, section, section_heading, stat_card};
use crate::theme::{BuddyPalette, hex};

const COLUMNS: usize = 4;

fn member_since(first_launch_ms: u64) -> String {
    if first_launch_ms == 0 {
        return "Today".to_string();
    }
    // `toLocaleDateString` formats in the host time zone, so convert first.
    chrono::DateTime::from_timestamp_millis(first_launch_ms as i64)
        .map(|date| {
            date.with_timezone(&chrono::Local)
                .format("%b %Y")
                .to_string()
        })
        .unwrap_or_else(|| "Today".to_string())
}

pub fn render(view: &DashboardView, cx: &mut Context<DashboardView>) -> AnyElement {
    let pulse = view.pulse();
    let palette = *BuddyPalette::global(cx);
    let status = view
        .convex_error()
        .or_else(|| (!view.stats_loaded()).then(|| "Connecting to Convex…".to_string()));
    let count = |n: u64| thousands(n as i64);

    let mut cards = vec![
        StatCard::new(
            IconName::GitPullRequest,
            count(pulse.total_prs_viewed),
            "PRs Viewed",
        ),
        StatCard::new(
            IconName::Sparkles,
            count(pulse.copilot_pr_reviews),
            "PRs Reviewed",
        ),
        StatCard::new(
            IconName::FolderGit2,
            count(pulse.repos_browsed),
            "Repos Browsed",
        ),
        StatCard::new(IconName::Play, count(pulse.runs_triggered), "Runs Executed")
            .subtitle((pulse.total_finished > 0).then(|| format!("{}%", pulse.success_rate))),
        StatCard::new(IconName::Star, count(pulse.bookmarks), "Bookmarks"),
        StatCard::new(
            IconName::Calendar,
            member_since(pulse.first_launch_ms),
            "Member Since",
        )
        .subtitle((pulse.app_launches > 0).then(|| {
            let plural = if pulse.app_launches == 1 { "" } else { "s" };
            format!("{} session{plural}", count(pulse.app_launches))
        })),
    ];
    if let Some(active) = pulse.active_prs {
        cards.insert(
            1,
            StatCard::new(IconName::Activity, count(active), "Active PRs")
                .icon_colors(palette.accent_success, hex("#4ec9b0").opacity(0.12)),
        );
    }

    let mut rows: Vec<Vec<StatCard>> = Vec::new();
    for card in cards {
        match rows.last_mut() {
            Some(row) if row.len() < COLUMNS => row.push(card),
            _ => rows.push(vec![card]),
        }
    }

    section(Some(hex("#50aaff")), cx)
        .child(section_heading(
            "Buddy activity",
            "Workspace Pulse",
            "Pull requests, runs, bookmarks, and session history in one panel",
            cx,
        ))
        .when_some(status, |this, status| {
            this.child(
                div()
                    .text_size(px(11.0))
                    .text_color(palette.text_muted)
                    .child(status),
            )
        })
        .child(
            v_flex()
                .w_full()
                .gap(px(10.0))
                .children(rows.into_iter().map(|row| {
                    let missing = COLUMNS - row.len();
                    h_flex()
                        .w_full()
                        .gap(px(10.0))
                        .children(row.into_iter().map(|card| stat_card(card, cx)))
                        .when(missing > 0, |this| {
                            this.children((0..missing).map(|_| div().flex_1()))
                        })
                })),
        )
        .into_any_element()
}
