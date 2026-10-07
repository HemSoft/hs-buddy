//! Port of `TitleBar.tsx`. The window is frameless, so File/Edit/View/Help
//! live here (see the Frameless Window rule in AGENTS.md).

use gpui_kit::assets::IconName;
use gpui_kit::component::button::{Button, ButtonVariants as _};
use gpui_kit::component::menu::DropdownMenu as _;
use gpui_kit::component::{ActiveTheme, Icon, Selectable as _, Sizable as _, TitleBar, h_flex};
use gpui_kit::{
    Context, FontWeight, IntoElement, ParentElement, Styled, Window, div, linear_color_stop,
    linear_gradient, px,
};

use crate::app::{
    About, BuddyApp, Copy, Cut, Paste, Quit, Redo, Reload, ResetZoom, SelectAll, ToggleFullScreen,
    Undo, ZoomIn, ZoomOut,
};
use crate::settings::Settings;
use crate::theme::BuddyPalette;

pub const TITLE_BAR_HEIGHT: f32 = 34.0;

fn app_icon(palette: &BuddyPalette, background: gpui_kit::Hsla) -> impl IntoElement {
    div()
        .size(px(20.0))
        .flex_shrink_0()
        .rounded(px(5.0))
        .flex()
        .items_center()
        .justify_center()
        .bg(linear_gradient(
            135.0,
            linear_color_stop(palette.gold, 0.0),
            linear_color_stop(palette.orange, 1.0),
        ))
        .text_color(background)
        .child(Icon::new(IconName::Users).size(px(13.0)))
}

fn menu_button(id: &'static str, label: &'static str) -> Button {
    Button::new(id).ghost().xsmall().label(label).compact()
}

pub fn render(
    _app: &BuddyApp,
    _window: &mut Window,
    cx: &mut Context<BuddyApp>,
) -> impl IntoElement + use<> {
    let palette = *BuddyPalette::global(cx);
    let (assistant_open, terminal_open) = {
        let ui = &Settings::global(cx).config.ui;
        (ui.assistant_open, ui.terminal_open)
    };
    let theme = cx.theme();
    let title_bar_bg = theme.title_bar;
    let foreground = theme.foreground;
    let background = theme.background;

    TitleBar::new()
        .h(px(TITLE_BAR_HEIGHT))
        .bg(title_bar_bg)
        .child(
            h_flex()
                .flex_1()
                .h_full()
                .items_center()
                .gap(px(10.0))
                .text_size(px(12.0))
                .text_color(foreground)
                .child(app_icon(&palette, background))
                .child(
                    div()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(palette.text_heading)
                        .child("Buddy"),
                )
                .child(
                    h_flex()
                        .gap(px(2.0))
                        .child(
                            menu_button("menu-file", "File")
                                .dropdown_menu(|menu, _, _| menu.menu("Exit", Box::new(Quit))),
                        )
                        .child(
                            menu_button("menu-edit", "Edit").dropdown_menu(|menu, _, _| {
                                menu.menu("Undo", Box::new(Undo))
                                    .menu("Redo", Box::new(Redo))
                                    .separator()
                                    .menu("Cut", Box::new(Cut))
                                    .menu("Copy", Box::new(Copy))
                                    .menu("Paste", Box::new(Paste))
                                    .separator()
                                    .menu("Select All", Box::new(SelectAll))
                            }),
                        )
                        .child(
                            menu_button("menu-view", "View").dropdown_menu(|menu, _, _| {
                                menu.menu("Zoom In", Box::new(ZoomIn))
                                    .menu("Zoom Out", Box::new(ZoomOut))
                                    .menu("Reset Zoom", Box::new(ResetZoom))
                                    .separator()
                                    .menu("Reload", Box::new(Reload))
                                    .separator()
                                    .menu("Full Screen", Box::new(ToggleFullScreen))
                            }),
                        )
                        .child(
                            menu_button("menu-help", "Help").dropdown_menu(|menu, _, _| {
                                menu.menu("About Buddy", Box::new(About))
                            }),
                        ),
                )
                .child(div().flex_1())
                .child(
                    h_flex()
                        .gap(px(2.0))
                        .pr(px(6.0))
                        .child(
                            Button::new("toggle-assistant")
                                .ghost()
                                .xsmall()
                                .compact()
                                .icon(Icon::new(IconName::Sparkles).size(px(14.0)))
                                .tooltip("Toggle Copilot Assistant")
                                .selected(assistant_open),
                        )
                        .child(
                            Button::new("toggle-terminal")
                                .ghost()
                                .xsmall()
                                .compact()
                                .icon(Icon::new(IconName::SquareTerminal).size(px(14.0)))
                                .tooltip("Toggle Terminal")
                                .selected(terminal_open),
                        ),
                ),
        )
}
