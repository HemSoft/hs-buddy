//! Port of `ActivityBar.tsx`: a 48px vertical strip of section icons.

use gpui_kit::assets::IconName;
use gpui_kit::component::tooltip::Tooltip;
use gpui_kit::component::{ActiveTheme, Icon, v_flex};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::{
    AnyElement, Context, InteractiveElement, IntoElement, ParentElement, SharedString,
    StatefulInteractiveElement, Styled, Window, div, px,
};

use crate::app::{BuddyApp, Section};
use crate::theme::BuddyPalette;

pub const ACTIVITY_BAR_WIDTH: f32 = 48.0;

struct SectionItem {
    section: Section,
    label: &'static str,
    icon: IconName,
}

fn sections() -> [SectionItem; 11] {
    [
        SectionItem {
            section: Section::GitHub,
            label: "GitHub",
            icon: IconName::Github,
        },
        SectionItem {
            section: Section::Terminal,
            label: "Terminal",
            icon: IconName::SquareTerminal,
        },
        SectionItem {
            section: Section::Tasks,
            label: "Tasks",
            icon: IconName::SquareCheck,
        },
        SectionItem {
            section: Section::Insights,
            label: "Insights",
            icon: IconName::ChartColumn,
        },
        SectionItem {
            section: Section::Automation,
            label: "Automation",
            icon: IconName::Bot,
        },
        SectionItem {
            section: Section::Ralph,
            label: "Ralph Loops",
            icon: IconName::RefreshCw,
        },
        SectionItem {
            section: Section::Crew,
            label: "The Crew",
            icon: IconName::Users,
        },
        SectionItem {
            section: Section::Tempo,
            label: "Tempo",
            icon: IconName::Clock,
        },
        SectionItem {
            section: Section::Bookmarks,
            label: "Bookmarks",
            icon: IconName::Bookmark,
        },
        SectionItem {
            section: Section::Copilot,
            label: "Copilot",
            icon: IconName::Sparkles,
        },
        SectionItem {
            section: Section::Settings,
            label: "Settings",
            icon: IconName::Settings,
        },
    ]
}

fn item(
    id: &'static str,
    label: &'static str,
    icon: IconName,
    active: bool,
    cx: &mut Context<BuddyApp>,
    on_click: impl Fn(&mut BuddyApp, &mut Window, &mut Context<BuddyApp>) + 'static,
) -> AnyElement {
    let palette = *BuddyPalette::global(cx);
    let accent = cx.theme().primary;
    let label: SharedString = label.into();
    div()
        .id(id)
        .w_full()
        .h(px(48.0))
        .flex()
        .items_center()
        .justify_center()
        .border_l_2()
        .border_color(if active {
            accent
        } else {
            gpui_kit::transparent_black()
        })
        .text_color(if active {
            palette.activity_bar_fg_active
        } else {
            palette.activity_bar_fg
        })
        .when(active, |this| this.bg(palette.activity_bar_hover))
        .hover(move |style| {
            style
                .text_color(palette.activity_bar_fg_active)
                .bg(palette.activity_bar_hover)
        })
        .cursor_pointer()
        .tooltip(move |window, cx| Tooltip::new(label.clone()).build(window, cx))
        .on_click(cx.listener(move |this, _, window, cx| {
            on_click(this, window, cx);
            cx.notify();
        }))
        .child(Icon::new(icon).size(px(24.0)))
        .into_any_element()
}

pub fn render(app: &BuddyApp, cx: &mut Context<BuddyApp>) -> impl IntoElement + use<> {
    let palette = *BuddyPalette::global(cx);
    let dashboard_active = app.active_section.is_none();

    v_flex()
        .w(px(ACTIVITY_BAR_WIDTH))
        .flex_shrink_0()
        .h_full()
        .bg(palette.activity_bar_bg)
        .child(item(
            "activity-home",
            "Dashboard",
            IconName::LayoutDashboard,
            dashboard_active,
            cx,
            |this, _, _| this.active_section = None,
        ))
        .child(
            div()
                .mx(px(8.0))
                .my(px(4.0))
                .h(px(1.0))
                .bg(palette.border_secondary),
        )
        .children(sections().into_iter().map(|entry| {
            let section = entry.section;
            item(
                section.id(),
                entry.label,
                entry.icon,
                app.active_section == Some(section),
                cx,
                move |this, _, _| this.active_section = Some(section),
            )
        }))
}
