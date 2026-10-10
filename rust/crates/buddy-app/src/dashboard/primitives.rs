//! Shared dashboard building blocks (`DashboardPrimitives.tsx` + card CSS).

use std::rc::Rc;

use buddy_core::dashboard::INTERVAL_OPTIONS;
use gpui_kit::assets::IconName;
use gpui_kit::component::button::{Button, ButtonCustomVariant, ButtonVariants as _};
use gpui_kit::component::menu::{DropdownMenu as _, PopupMenuItem};
use gpui_kit::component::{ActiveTheme, Disableable as _, Icon, Sizable as _, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::{
    AnyElement, App, Background, BoxShadow, ClickEvent, Div, FontWeight, Hsla, IntoElement,
    ParentElement, SharedString, Styled, Window, div, point,
};

use crate::theme::BuddyPalette;
use crate::zoom::{scaled, zpx};

/// `.welcome-section`: the rounded card container with an optional accent ring.
pub fn section(accent: Option<Hsla>, narrow: bool, cx: &App) -> Div {
    let theme = cx.theme();
    v_flex()
        .w_full()
        .gap(zpx(14.0))
        .p(zpx(if narrow { 14.0 } else { 16.0 }))
        .rounded(zpx(16.0))
        .border_1()
        .border_color(theme.border)
        .bg(theme.secondary)
        .when_some(accent, |this, accent| {
            this.border_color(accent.opacity(0.45))
                .shadow(vec![BoxShadow {
                    color: accent.opacity(0.12),
                    offset: point(scaled(cx, 0.0), scaled(cx, 0.0)),
                    blur_radius: scaled(cx, 0.0),
                    spread_radius: scaled(cx, 1.0),
                    inset: false,
                }])
        })
}

/// `.welcome-section-kicker` / `.pollen-title`: small bold uppercase label.
pub fn kicker(text: &str, size: f32, cx: &App) -> Div {
    let palette = BuddyPalette::global(cx);
    div()
        .text_size(zpx(size))
        .font_weight(FontWeight::BOLD)
        .text_color(palette.text_muted)
        .child(text.to_uppercase())
}

/// `SectionHeading`: kicker + title on the left, caption on the right; when
/// narrow, the caption goes below the title, left-aligned.
pub fn section_heading(
    kicker_text: &str,
    title: &str,
    caption: impl Into<SharedString>,
    narrow: bool,
    cx: &App,
) -> Div {
    let palette = BuddyPalette::global(cx);
    let row = if narrow {
        v_flex().items_start().gap(zpx(6.0))
    } else {
        h_flex().items_end().justify_between().gap(zpx(16.0))
    };
    row.w_full()
        .child(
            v_flex()
                .gap(zpx(2.0))
                .child(kicker(kicker_text, 11.0, cx))
                .child(
                    div()
                        .text_size(zpx(22.0))
                        .line_height(zpx(24.0))
                        .font_weight(FontWeight::EXTRA_BOLD)
                        .text_color(palette.text_heading)
                        .child(title.to_string()),
                ),
        )
        .child(
            div()
                .when(!narrow, |this| this.max_w(zpx(320.0)).text_right())
                .text_size(zpx(11.0))
                .line_height(zpx(15.0))
                .text_color(palette.text_secondary)
                .child(caption.into()),
        )
}

/// `.welcome-stats-grid` / `.welcome-usage-stats`: equal-width stat tiles,
/// `columns` per row; a short last row keeps the column width.
pub fn stat_grid(cards: Vec<StatCard>, columns: usize, cx: &App) -> Div {
    let mut rows: Vec<Vec<StatCard>> = Vec::new();
    for card in cards {
        match rows.last_mut() {
            Some(row) if row.len() < columns => row.push(card),
            _ => rows.push(vec![card]),
        }
    }
    v_flex()
        .w_full()
        .gap(zpx(10.0))
        .children(rows.into_iter().map(|row| {
            let missing = columns - row.len();
            h_flex()
                .w_full()
                .gap(zpx(10.0))
                .children(row.into_iter().map(|card| stat_card(card, cx)))
                .when(missing > 0, |this| {
                    this.children((0..missing).map(|_| div().flex_1()))
                })
        }))
}

/// A square icon tile (`.welcome-stat-icon`, `.weather-icon-*`).
pub fn icon_box(
    size: f32,
    radius: f32,
    icon: IconName,
    icon_size: f32,
    color: Hsla,
    bg: Hsla,
) -> Div {
    div()
        .size(zpx(size))
        .flex_shrink_0()
        .rounded(zpx(radius))
        .flex()
        .items_center()
        .justify_center()
        .text_color(color)
        .bg(bg)
        .child(Icon::new(icon).size(zpx(icon_size)))
}

pub struct StatCard {
    pub icon: IconName,
    pub value: String,
    pub label: &'static str,
    pub subtitle: Option<String>,
    pub icon_color: Option<Hsla>,
    pub icon_bg: Option<Hsla>,
    pub card_bg: Option<Background>,
    pub card_border: Option<Hsla>,
}

impl StatCard {
    pub fn new(icon: IconName, value: impl Into<String>, label: &'static str) -> Self {
        Self {
            icon,
            value: value.into(),
            label,
            subtitle: None,
            icon_color: None,
            icon_bg: None,
            card_bg: None,
            card_border: None,
        }
    }

    pub fn subtitle(mut self, subtitle: Option<String>) -> Self {
        self.subtitle = subtitle;
        self
    }

    pub fn icon_colors(mut self, color: Hsla, bg: Hsla) -> Self {
        self.icon_color = Some(color);
        self.icon_bg = Some(bg);
        self
    }

    pub fn card_style(mut self, bg: Background, border: Hsla) -> Self {
        self.card_bg = Some(bg);
        self.card_border = Some(border);
        self
    }
}

/// `StatCard`: icon tile beside a value / label / subtitle stack.
pub fn stat_card(card: StatCard, cx: &App) -> Div {
    let theme = cx.theme();
    let palette = BuddyPalette::global(cx);
    let icon_color = card.icon_color.unwrap_or(theme.primary);
    let icon_bg = card.icon_bg.unwrap_or_else(|| theme.primary.opacity(0.12));
    let bg = card.card_bg.unwrap_or_else(|| theme.secondary.into());
    h_flex()
        .flex_1()
        .min_w_0()
        .items_center()
        .gap(zpx(10.0))
        .p(zpx(12.0))
        .rounded(zpx(8.0))
        .border_1()
        .border_color(card.card_border.unwrap_or(theme.border))
        .bg(bg)
        .child(icon_box(32.0, 7.0, card.icon, 18.0, icon_color, icon_bg))
        .child(
            v_flex()
                .min_w_0()
                .gap(zpx(1.0))
                .child(
                    div()
                        .text_size(zpx(18.0))
                        .line_height(zpx(22.0))
                        .font_weight(FontWeight::BOLD)
                        .text_color(palette.text_heading)
                        .whitespace_nowrap()
                        .child(card.value),
                )
                .child(
                    div()
                        .text_size(zpx(10.0))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(palette.text_muted)
                        .child(card.label.to_uppercase()),
                )
                .when_some(card.subtitle, |this, subtitle| {
                    this.child(
                        div()
                            .text_size(zpx(10.0))
                            .text_color(palette.text_secondary)
                            .child(subtitle),
                    )
                }),
        )
}

/// `.welcome-usage-btn` / `.welcome-action-btn`: bordered pill button.
pub struct Pill {
    id: &'static str,
    label: SharedString,
    icon: Option<IconName>,
    trailing: Option<IconName>,
    disabled: bool,
    accent_icon: bool,
    tooltip: Option<SharedString>,
}

impl Pill {
    pub fn new(id: &'static str, label: impl Into<SharedString>) -> Self {
        Self {
            id,
            label: label.into(),
            icon: None,
            trailing: None,
            disabled: false,
            accent_icon: false,
            tooltip: None,
        }
    }

    pub fn icon(mut self, icon: IconName) -> Self {
        self.icon = Some(icon);
        self
    }

    pub fn trailing(mut self, icon: IconName) -> Self {
        self.trailing = Some(icon);
        self
    }

    pub fn disabled(mut self, disabled: bool) -> Self {
        self.disabled = disabled;
        self
    }

    /// Color the leading icon with the accent (quick-action style).
    pub fn accent_icon(mut self) -> Self {
        self.accent_icon = true;
        self
    }

    pub fn tooltip(mut self, tooltip: impl Into<SharedString>) -> Self {
        self.tooltip = Some(tooltip.into());
        self
    }

    /// A real [`Button`]: focusable, in the tab order, and activated by
    /// keyboard as well as pointer.
    pub fn build(
        self,
        on_click: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
        cx: &App,
    ) -> Button {
        let theme = cx.theme();
        let icon_color = if self.accent_icon {
            theme.primary
        } else {
            theme.foreground
        };
        Button::new(self.id)
            .custom(pill_variant(cx))
            .accessibility_label(self.label.clone())
            .border_1()
            .border_color(theme.border)
            .px(zpx(12.0))
            .py(zpx(8.0))
            .rounded(scaled(cx, 8.0))
            .font_weight(FontWeight::SEMIBOLD)
            .when_some(self.icon, |this, icon| {
                this.child(Icon::new(icon).size(zpx(14.0)).text_color(icon_color))
            })
            .child(div().text_size(zpx(12.0)).child(self.label))
            .when_some(self.trailing, |this, icon| {
                this.child(Icon::new(icon).size(zpx(14.0)))
            })
            .when_some(self.tooltip, |this, tooltip| this.tooltip(tooltip))
            .disabled(self.disabled)
            .on_click(on_click)
    }
}

/// `.pill-btn` colours: secondary surface, hover highlight, foreground text.
fn pill_variant(cx: &App) -> ButtonCustomVariant {
    let theme = cx.theme();
    let palette = *BuddyPalette::global(cx);
    ButtonCustomVariant::new(cx)
        .color(theme.secondary)
        .foreground(theme.foreground)
        .hover(palette.bg_hover)
        .active(palette.bg_hover)
        .shadow(false)
}

/// `.card-collapse-btn`: 28px chevron toggle.
pub fn collapse_button(
    id: &'static str,
    expanded: bool,
    on_toggle: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
    cx: &App,
) -> Button {
    let theme = cx.theme();
    let palette = *BuddyPalette::global(cx);
    let icon = if expanded {
        IconName::ChevronUp
    } else {
        IconName::ChevronDown
    };
    let title = if expanded { "Collapse" } else { "Expand" };
    Button::new(id)
        .custom(pill_variant(cx))
        .accessibility_label(title)
        .tooltip(title)
        .size(zpx(28.0))
        .p(zpx(0.0))
        .rounded(scaled(cx, 6.0))
        .border_1()
        .border_color(theme.border)
        .text_color(palette.text_secondary)
        .child(Icon::new(icon).size(zpx(16.0)))
        .on_click(on_toggle)
}

/// `CardHeader`: heading on the left, collapse toggle on the right.
pub fn card_header(heading: impl IntoElement, toggle: impl IntoElement) -> Div {
    h_flex()
        .w_full()
        .items_start()
        .gap(zpx(8.0))
        .child(div().flex_1().min_w_0().child(heading))
        .child(toggle)
}

/// Shared handler type for the interval dropdown.
pub type IntervalHandler = Rc<dyn Fn(u32, &mut App)>;

pub struct ActionBar {
    /// Stable element ids supplied by the card (no per-render allocation).
    pub refresh_id: &'static str,
    pub interval_id: &'static str,
    pub refresh_title: &'static str,
    pub loading: bool,
    pub interval_minutes: u32,
    pub last_refreshed_label: Option<String>,
    pub next_refresh_label: Option<String>,
    pub extra: Vec<AnyElement>,
}

/// `CardActionBar`: Refresh, extra buttons, interval select, and status line.
pub fn action_bar(
    bar: ActionBar,
    on_refresh: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
    on_interval: IntervalHandler,
    cx: &App,
) -> Div {
    let palette = *BuddyPalette::global(cx);
    let current = bar.interval_minutes;
    let current_label = INTERVAL_OPTIONS
        .iter()
        .find(|(value, _)| *value == current)
        .map(|(_, label)| *label)
        .unwrap_or("Off");

    let status = bar.last_refreshed_label.map(|last| {
        let mut text = format!("Updated {last}");
        if let Some(next) = bar.next_refresh_label {
            text.push_str(&format!(" · Next in {next}"));
        }
        text
    });

    v_flex()
        .w_full()
        .gap(zpx(4.0))
        .child(
            h_flex()
                .w_full()
                .items_center()
                .gap(zpx(8.0))
                .child(
                    Pill::new(bar.refresh_id, "Refresh")
                        .icon(IconName::RefreshCw)
                        .disabled(bar.loading)
                        .tooltip(bar.refresh_title)
                        .build(on_refresh, cx),
                )
                .children(bar.extra)
                .child(div().flex_1())
                .child(
                    Button::new(bar.interval_id)
                        .outline()
                        .xsmall()
                        .label(current_label)
                        .dropdown_caret(true)
                        .tooltip("Auto-refresh interval")
                        .dropdown_menu(move |menu, _, _| {
                            INTERVAL_OPTIONS.iter().fold(menu, |menu, (value, label)| {
                                let on_interval = on_interval.clone();
                                let value = *value;
                                menu.item(
                                    PopupMenuItem::new(*label)
                                        .checked(value == current)
                                        .on_click(move |_, _, cx| on_interval(value, cx)),
                                )
                            })
                        }),
                ),
        )
        .when_some(status, |this, status| {
            this.child(
                div()
                    .w_full()
                    .text_size(zpx(10.0))
                    .text_color(palette.text_muted)
                    .text_right()
                    .child(status),
            )
        })
}

/// `.weather-loading` / `.weather-error`: centered status message.
pub fn status_message(text: impl Into<SharedString>, error: bool, cx: &App) -> Div {
    let palette = BuddyPalette::global(cx);
    h_flex()
        .w_full()
        .items_center()
        .justify_center()
        .gap(zpx(8.0))
        .p(zpx(24.0))
        .text_size(zpx(13.0))
        .text_color(if error {
            palette.accent_error
        } else {
            palette.text_secondary
        })
        .child(text.into())
}
