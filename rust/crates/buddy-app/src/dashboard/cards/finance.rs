//! `FinanceCard`: watchlist quotes.

use std::rc::Rc;

use buddy_core::dashboard::CardId;
use buddy_core::finance::QuoteData;
use buddy_core::format::price;
use gpui_kit::assets::IconName;
use gpui_kit::component::input::Input;
use gpui_kit::component::{ActiveTheme, Icon, Sizable as _, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::{
    AnyElement, App, Context, Div, FontWeight, Hsla, InteractiveElement, IntoElement,
    ParentElement, StatefulInteractiveElement, Styled, Window, div, px,
};

use crate::dashboard::DashboardView;
use crate::dashboard::primitives::{
    ActionBar, IntervalHandler, Pill, action_bar, card_header, collapse_button, section,
    section_heading, status_message,
};
use crate::theme::{BuddyPalette, hex};

const UP: &str = "#4ece8a";
const DOWN: &str = "#e25555";

fn trend_color(quote: &QuoteData) -> Hsla {
    hex(if quote.is_up() { UP } else { DOWN })
}

fn arrow(quote: &QuoteData) -> &'static str {
    if quote.is_up() { "▲" } else { "▼" }
}

fn market_pill(open: bool) -> Div {
    let (fg, bg, label) = if open {
        (hex("#1a3a24"), hex("#4ece8a").opacity(0.85), "OPEN")
    } else {
        (hex("#3a2a0a"), hex("#e6a032").opacity(0.85), "CLOSED")
    };
    div()
        .px(px(5.0))
        .rounded(px(6.0))
        .bg(bg)
        .text_color(fg)
        .text_size(px(9.0))
        .line_height(px(13.0))
        .font_weight(FontWeight::BOLD)
        .child(label)
}

fn quote_row(index: usize, quote: &QuoteData, cx: &mut Context<DashboardView>) -> Div {
    let theme = cx.theme();
    let palette = *BuddyPalette::global(cx);
    let secondary = theme.secondary;
    let border = theme.border;
    let trend = trend_color(quote);
    let symbol = quote.symbol.clone();
    let remove_bg = hex(DOWN).opacity(0.12);
    let down = hex(DOWN);

    h_flex()
        .w_full()
        .items_center()
        .gap(px(8.0))
        .px(px(10.0))
        .py(px(5.0))
        .rounded(px(4.0))
        .bg(secondary)
        .border_1()
        .border_color(border)
        .border_l(px(3.0))
        .hover(move |style| style.border_color(palette.border_secondary))
        .map(|this| {
            // border_l above sets width; color it with the trend after the base color.
            this.border_color(border)
        })
        .child(
            h_flex()
                .flex_1()
                .min_w_0()
                .items_center()
                .gap(px(6.0))
                .child(
                    div()
                        .text_size(px(9.0))
                        .font_weight(FontWeight::BOLD)
                        .text_color(trend)
                        .child(arrow(quote)),
                )
                .child(
                    div()
                        .text_size(px(12.0))
                        .font_weight(FontWeight::BOLD)
                        .text_color(palette.text_heading)
                        .truncate()
                        .child(quote.name.clone()),
                )
                .child(market_pill(quote.market_open)),
        )
        .child(
            v_flex()
                .items_end()
                .flex_shrink_0()
                .child(
                    div()
                        .text_size(px(13.0))
                        .font_weight(FontWeight::BOLD)
                        .text_color(palette.text_heading)
                        .child(price(quote.price)),
                )
                .child(
                    div()
                        .text_size(px(11.0))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(trend)
                        .child(format!("{} {}", arrow(quote), quote.change_text())),
                ),
        )
        .child(
            div()
                .id(("finance-remove", index))
                .size(px(18.0))
                .flex_shrink_0()
                .rounded(px(3.0))
                .flex()
                .items_center()
                .justify_center()
                .text_color(palette.text_muted)
                .cursor_pointer()
                .hover(move |style| style.text_color(down).bg(remove_bg))
                .tooltip({
                    let symbol = symbol.clone();
                    move |window, cx| {
                        gpui_kit::component::tooltip::Tooltip::new(format!("Remove {symbol}"))
                            .build(window, cx)
                    }
                })
                .on_click(cx.listener(move |this, _, _, cx| this.remove_symbol(&symbol, cx)))
                .child(Icon::new(IconName::X).size(px(12.0))),
        )
}

fn collapsed_summary(quotes: &[QuoteData], cx: &App) -> Option<Div> {
    if quotes.is_empty() {
        return None;
    }
    let palette = BuddyPalette::global(cx);
    Some(
        h_flex()
            .w_full()
            .items_center()
            .gap(px(16.0))
            .py(px(4.0))
            .flex_wrap()
            .children(quotes.iter().take(3).map(|quote| {
                h_flex()
                    .items_center()
                    .gap(px(6.0))
                    .child(
                        div()
                            .text_size(px(12.0))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(palette.text_heading)
                            .child(quote.name.clone()),
                    )
                    .child(
                        div()
                            .text_size(px(12.0))
                            .font_weight(FontWeight::BOLD)
                            .text_color(trend_color(quote))
                            .child(format!(
                                "{} {:.2}%",
                                arrow(quote),
                                quote.change_percent.abs()
                            )),
                    )
            })),
    )
}

fn add_row(view: &DashboardView, cx: &mut Context<DashboardView>) -> Div {
    let palette = BuddyPalette::global(cx);
    let empty = view.finance_add_input().read(cx).value().trim().is_empty();
    h_flex()
        .w_full()
        .items_center()
        .gap(px(6.0))
        .child(
            div().flex_1().child(
                Input::new(view.finance_add_input()).small().prefix(
                    Icon::new(IconName::DollarSign)
                        .size(px(14.0))
                        .text_color(palette.text_muted),
                ),
            ),
        )
        .child(
            Pill::new("finance-add", "Add")
                .icon(IconName::Plus)
                .disabled(empty)
                .tooltip("Add symbol")
                .build(
                    cx.listener(|this, _, window, cx| this.submit_finance_add(window, cx)),
                    cx,
                ),
        )
}

pub fn render(
    view: &DashboardView,
    _window: &mut Window,
    cx: &mut Context<DashboardView>,
) -> AnyElement {
    let accent = hex("#50c878");
    let expanded = view.is_expanded(CardId::Finance);
    let quotes = view.quotes().to_vec();
    let refresh = view.finance_refresh().clone();
    let tracked = view.watchlist_len(cx);
    let caption = format!(
        "{tracked} symbol{} tracked",
        if tracked == 1 { "" } else { "s" }
    );

    let heading = section_heading("Markets", "Finance", caption, cx);
    let toggle = collapse_button(
        "finance-collapse",
        expanded,
        cx.listener(|this, _, _, cx| this.toggle_expanded(CardId::Finance, cx)),
        cx,
    );
    let mut card = section(Some(accent), cx).child(card_header(heading, toggle));

    if !expanded {
        return card
            .when_some(collapsed_summary(&quotes, cx), |this, summary| {
                this.child(summary)
            })
            .into_any_element();
    }

    if let Some(error) = view.finance_error() {
        card = card.child(status_message(error.to_string(), true, cx));
    } else if quotes.is_empty() {
        card = card.child(if refresh.loading {
            status_message("Fetching market data…", false, cx)
        } else {
            status_message("No market data available. Try refreshing.", true, cx)
        });
    }

    if !quotes.is_empty() {
        card = card.child(
            v_flex().w_full().gap(px(1.0)).children(
                quotes
                    .iter()
                    .enumerate()
                    .map(|(i, quote)| quote_row(i, quote, cx)),
            ),
        );
    }

    card = card.child(add_row(view, cx));

    let weak = cx.entity().downgrade();
    let on_interval: IntervalHandler = Rc::new(move |minutes, cx| {
        weak.update(cx, |this, cx| this.set_finance_interval(minutes, cx))
            .ok();
    });

    card.child(action_bar(
        ActionBar {
            id: "finance",
            refresh_title: "Refresh market data",
            loading: refresh.loading,
            interval_minutes: refresh.interval_minutes,
            last_refreshed_label: refresh.last_refreshed_label(),
            next_refresh_label: refresh.next_refresh_label(),
            extra: Vec::new(),
        },
        cx.listener(|this, _, _, cx| this.refresh_finance(cx)),
        on_interval,
        cx,
    ))
    .into_any_element()
}
