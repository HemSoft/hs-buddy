//! `WeatherCard`: current conditions, 3-day forecast, pollen index.

use std::rc::Rc;

use buddy_core::dashboard::CardId;
use buddy_core::pollen::{PollenData, PollenType, level_color_hex, level_label};
use buddy_core::weather::{ForecastDay, WeatherData, WeatherGlyph, code_glyph};
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
    ActionBar, IntervalHandler, Pill, StatCard, action_bar, card_header, collapse_button, icon_box,
    kicker, section, section_heading, stat_card, status_message,
};
use crate::theme::{BuddyPalette, hex};

fn weather_icon(code: u16) -> IconName {
    match code_glyph(code) {
        WeatherGlyph::Sun => IconName::Sun,
        WeatherGlyph::Cloud => IconName::Cloud,
        WeatherGlyph::Fog => IconName::CloudFog,
        WeatherGlyph::Rain => IconName::CloudRain,
        WeatherGlyph::Snow => IconName::CloudSnow,
        WeatherGlyph::Lightning => IconName::CloudLightning,
    }
}

fn pollen_type_icon(kind: PollenType) -> IconName {
    match kind {
        PollenType::Tree => IconName::TreePine,
        PollenType::Grass => IconName::Sprout,
        PollenType::Weed => IconName::Leaf,
    }
}

fn level_color(index: u8, palette: &BuddyPalette) -> Hsla {
    level_color_hex(index)
        .map(hex)
        .unwrap_or(palette.text_muted)
}

fn collapsed_summary(data: &WeatherData, sun: Hsla, cx: &App) -> Div {
    let palette = BuddyPalette::global(cx);
    h_flex()
        .w_full()
        .items_center()
        .justify_between()
        .gap(px(12.0))
        .py(px(4.0))
        .child(
            h_flex()
                .items_center()
                .gap(px(8.0))
                .child(icon_box(
                    28.0,
                    6.0,
                    weather_icon(data.weather_code),
                    16.0,
                    sun,
                    sun.opacity(0.12),
                ))
                .child(
                    div()
                        .text_size(px(18.0))
                        .font_weight(FontWeight::BOLD)
                        .text_color(palette.text_heading)
                        .child(format!("{}{}", data.temperature, data.temperature_unit)),
                )
                .child(
                    div()
                        .text_size(px(12.0))
                        .text_color(palette.text_secondary)
                        .child(data.description.clone()),
                ),
        )
        .child(
            div()
                .text_size(px(12.0))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(palette.text_secondary)
                .whitespace_nowrap()
                .child(format!("H: {}°   L: {}°", data.high, data.low)),
        )
}

fn forecast_row(day: &ForecastDay, sun: Hsla, cx: &App) -> Div {
    let theme = cx.theme();
    let palette = *BuddyPalette::global(cx);
    h_flex()
        .w_full()
        .items_center()
        .gap(px(10.0))
        .px(px(10.0))
        .py(px(8.0))
        .rounded(px(6.0))
        .bg(theme.secondary)
        .border_1()
        .border_color(theme.border)
        .hover(move |style| style.border_color(palette.border_secondary))
        .child(
            div()
                .w(px(42.0))
                .text_size(px(12.0))
                .font_weight(FontWeight::BOLD)
                .text_color(palette.text_heading)
                .child(day.day_name.clone()),
        )
        .child(
            div()
                .w(px(22.0))
                .flex()
                .justify_center()
                .text_color(sun)
                .child(Icon::new(weather_icon(day.weather_code)).size(px(14.0))),
        )
        .child(
            div()
                .flex_1()
                .min_w_0()
                .text_size(px(11.0))
                .text_color(palette.text_secondary)
                .truncate()
                .child(day.description.clone()),
        )
        .child(
            h_flex()
                .gap(px(8.0))
                .text_size(px(12.0))
                .font_weight(FontWeight::SEMIBOLD)
                .whitespace_nowrap()
                .child(
                    div()
                        .text_color(palette.text_heading)
                        .child(format!("{}°", day.high)),
                )
                .child(
                    div()
                        .text_color(palette.text_muted)
                        .child(format!("{}°", day.low)),
                ),
        )
}

fn current_section(data: &WeatherData, sun: Hsla, cx: &App) -> Vec<AnyElement> {
    let palette = *BuddyPalette::global(cx);
    let sun_bg = sun.opacity(0.12);
    let mut out = vec![
        v_flex()
            .w_full()
            .items_center()
            .gap(px(4.0))
            .py(px(8.0))
            .child(
                h_flex()
                    .items_center()
                    .gap(px(10.0))
                    .child(icon_box(
                        40.0,
                        10.0,
                        weather_icon(data.weather_code),
                        18.0,
                        sun,
                        sun_bg,
                    ))
                    .child(
                        div()
                            .text_size(px(36.0))
                            .line_height(px(36.0))
                            .font_weight(FontWeight::EXTRA_BOLD)
                            .text_color(palette.text_heading)
                            .child(format!("{}{}", data.temperature, data.temperature_unit)),
                    ),
            )
            .child(
                div()
                    .text_size(px(13.0))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(palette.text_secondary)
                    .child(data.description.clone()),
            )
            .into_any_element(),
        h_flex()
            .w_full()
            .gap(px(10.0))
            .child(stat_card(
                StatCard::new(
                    IconName::Thermometer,
                    format!("{}° / {}°", data.high, data.low),
                    "High / Low",
                )
                .icon_colors(sun, sun_bg),
                cx,
            ))
            .child(stat_card(
                StatCard::new(
                    IconName::Droplets,
                    format!("{}%", data.humidity),
                    "Humidity",
                )
                .icon_colors(sun, sun_bg),
                cx,
            ))
            .child(stat_card(
                StatCard::new(IconName::Wind, format!("{} mph", data.wind_speed), "Wind")
                    .icon_colors(sun, sun_bg),
                cx,
            ))
            .into_any_element(),
    ];
    if !data.forecast.is_empty() {
        out.push(
            v_flex()
                .w_full()
                .gap(px(6.0))
                .child(kicker("3-Day Forecast", 10.0, cx))
                .child(
                    v_flex()
                        .w_full()
                        .gap(px(2.0))
                        .children(data.forecast.iter().map(|day| forecast_row(day, sun, cx))),
                )
                .into_any_element(),
        );
    }
    out
}

fn pollen_badge(kind: PollenType, index: u8, cx: &App) -> Div {
    let theme = cx.theme();
    let palette = BuddyPalette::global(cx);
    v_flex()
        .flex_1()
        .items_center()
        .gap(px(2.0))
        .px(px(6.0))
        .py(px(8.0))
        .rounded(px(6.0))
        .bg(theme.secondary)
        .border_1()
        .border_color(theme.border)
        .child(
            div()
                .text_size(px(10.0))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(palette.text_muted)
                .child(kind.badge_label().to_uppercase()),
        )
        .child(
            div()
                .text_size(px(11.0))
                .font_weight(FontWeight::BOLD)
                .text_color(level_color(index, palette))
                .child(level_label(index)),
        )
}

fn pollen_detail(pollen: &PollenData, open: bool, cx: &mut Context<DashboardView>) -> Option<Div> {
    if pollen.species.is_empty() && pollen.health_recommendations.is_empty() {
        return None;
    }
    let palette = *BuddyPalette::global(cx);
    let toggle = h_flex()
        .id("pollen-detail-toggle")
        .items_center()
        .gap(px(4.0))
        .py(px(4.0))
        .text_size(px(10.0))
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(palette.text_muted)
        .cursor_pointer()
        .hover(move |style| style.text_color(palette.text_secondary))
        .on_click(cx.listener(|this, _, _, cx| this.toggle_pollen_detail(cx)))
        .child("SPECIES DETAIL")
        .child(
            Icon::new(if open {
                IconName::ChevronUp
            } else {
                IconName::ChevronDown
            })
            .size(px(12.0)),
        );

    let content = open.then(|| {
        v_flex()
            .w_full()
            .gap(px(8.0))
            .pt(px(4.0))
            .children(pollen.species_by_type().into_iter().map(|(kind, items)| {
                v_flex()
                    .w_full()
                    .gap(px(2.0))
                    .child(
                        h_flex()
                            .items_center()
                            .gap(px(5.0))
                            .text_color(palette.text_muted)
                            .child(Icon::new(pollen_type_icon(kind)).size(px(11.0)))
                            .child(kicker(kind.group_label(), 10.0, cx)),
                    )
                    .children(items.into_iter().map(|species| {
                        h_flex()
                            .w_full()
                            .items_center()
                            .gap(px(8.0))
                            .px(px(8.0))
                            .py(px(3.0))
                            .text_size(px(11.0))
                            .child(
                                div()
                                    .flex_1()
                                    .text_color(palette.text_secondary)
                                    .child(species.display_name.clone()),
                            )
                            .child(
                                div()
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(level_color(species.index, &palette))
                                    .child(level_label(species.index)),
                            )
                            .when(!species.in_season, |this| {
                                this.child(
                                    div()
                                        .text_size(px(9.0))
                                        .text_color(palette.text_muted)
                                        .child("off-season"),
                                )
                            })
                    }))
            }))
            .when(!pollen.health_recommendations.is_empty(), |this| {
                this.child(
                    v_flex()
                        .w_full()
                        .gap(px(4.0))
                        .child(kicker("Health Tips", 10.0, cx))
                        .children(pollen.health_recommendations.iter().map(|tip| {
                            div()
                                .text_size(px(11.0))
                                .line_height(px(15.0))
                                .text_color(palette.text_secondary)
                                .child(format!("• {tip}"))
                        })),
                )
            })
    });

    Some(
        v_flex()
            .w_full()
            .child(toggle)
            .when_some(content, |this, content| this.child(content)),
    )
}

fn pollen_area(view: &DashboardView, cx: &mut Context<DashboardView>) -> Option<Div> {
    let palette = *BuddyPalette::global(cx);
    let header = |cx: &App| {
        h_flex()
            .items_center()
            .gap(px(6.0))
            .child(
                Icon::new(IconName::Flower2)
                    .size(px(12.0))
                    .text_color(hex("#a8d08d")),
            )
            .child(kicker("Pollen Index", 10.0, cx))
    };

    if let Some(pollen) = view.pollen() {
        let pollen = pollen.clone();
        let detail = pollen_detail(&pollen, view.pollen_detail_open(), cx);
        return Some(
            v_flex()
                .w_full()
                .gap(px(8.0))
                .child(header(cx))
                .child(h_flex().w_full().gap(px(10.0)).children(
                    PollenType::ALL.map(|kind| pollen_badge(kind, pollen.index_for(kind), cx)),
                ))
                .when_some(detail, |this, detail| this.child(detail)),
        );
    }

    view.pollen_error().map(|error| {
        v_flex()
            .w_full()
            .gap(px(8.0))
            .opacity(0.7)
            .child(header(cx))
            .child(
                div()
                    .text_size(px(11.0))
                    .text_color(palette.text_muted)
                    .child(error.to_string()),
            )
    })
}

fn search_bar(view: &DashboardView, cx: &mut Context<DashboardView>) -> Div {
    let palette = BuddyPalette::global(cx);
    let query_empty = view
        .weather_search_input()
        .read(cx)
        .value()
        .trim()
        .is_empty();
    h_flex()
        .w_full()
        .items_center()
        .gap(px(6.0))
        .child(
            div().flex_1().child(
                Input::new(view.weather_search_input()).small().prefix(
                    Icon::new(IconName::Search)
                        .size(px(14.0))
                        .text_color(palette.text_muted),
                ),
            ),
        )
        .child(
            Pill::new("weather-go", "Go")
                .disabled(query_empty || view.weather_refresh().loading)
                .tooltip("Search location")
                .build(
                    cx.listener(|this, _, window, cx| this.submit_weather_search(window, cx)),
                    cx,
                ),
        )
}

pub fn render(
    view: &DashboardView,
    _window: &mut Window,
    cx: &mut Context<DashboardView>,
) -> AnyElement {
    let sun = hex("#ffc150");
    let expanded = view.is_expanded(CardId::Weather);
    let data = view.weather().cloned();
    let refresh = view.weather_refresh().clone();
    let caption = view.weather_caption();

    let heading = section_heading("Local weather", "Weather", caption, cx);
    let toggle = collapse_button(
        "weather-collapse",
        expanded,
        cx.listener(|this, _, _, cx| this.toggle_expanded(CardId::Weather, cx)),
        cx,
    );

    let mut card = section(Some(sun), cx).child(card_header(heading, toggle));

    if !expanded {
        if let Some(data) = &data {
            card = card.child(collapsed_summary(data, sun, cx));
        }
        return card.into_any_element();
    }

    card = card.child(search_bar(view, cx));

    match (&data, view.weather_error()) {
        (None, None) if refresh.loading => {
            card = card.child(status_message("Fetching weather…", false, cx));
        }
        (None, Some(error)) => {
            card = card.child(status_message(error.to_string(), true, cx));
        }
        (Some(data), error) => {
            if let Some(error) = error {
                card = card.child(
                    div()
                        .w_full()
                        .text_size(px(11.0))
                        .text_color(BuddyPalette::global(cx).accent_error)
                        .child(format!("Showing the last successful forecast. {error}")),
                );
            }
            card = card.children(current_section(data, sun, cx));
            if let Some(pollen) = pollen_area(view, cx) {
                card = card.child(pollen);
            }
        }
        (None, None) => {}
    }

    let weak = cx.entity().downgrade();
    let on_interval: IntervalHandler = Rc::new(move |minutes, cx| {
        weak.update(cx, |this, cx| this.set_weather_interval(minutes, cx))
            .ok();
    });
    let use_my_location = Pill::new("weather-my-location", "Use My Location")
        .icon(IconName::MapPin)
        .tooltip("Use my current location")
        .build(cx.listener(|this, _, _, cx| this.use_my_location(cx)), cx)
        .into_any_element();

    card.child(action_bar(
        ActionBar {
            refresh_id: "weather-refresh",
            interval_id: "weather-interval",
            refresh_title: "Refresh weather data",
            loading: refresh.loading,
            interval_minutes: refresh.interval_minutes,
            last_refreshed_label: refresh.last_refreshed_label(),
            next_refresh_label: refresh.next_refresh_label(),
            extra: vec![use_my_location],
        },
        cx.listener(|this, _, _, cx| this.refresh_weather(cx)),
        on_interval,
        cx,
    ))
    .into_any_element()
}
