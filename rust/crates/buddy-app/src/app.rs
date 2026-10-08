//! Root view: the application shell around the active content.

use std::time::Duration;

use gpui_kit::component::{ActiveTheme, h_flex, v_flex};
use gpui_kit::{
    App, AppContext as _, Context, Entity, IntoElement, ParentElement, Render, Styled, Window, div,
    px,
};

use crate::dashboard::{DashboardEvent, DashboardView};
use crate::runtime::Runtime;
use crate::shell::{activity_bar, status_bar, tab_bar, title_bar};

gpui_kit::actions!(buddy, [Quit, About, Reload, ToggleFullScreen]);

/// Activity-bar sections, mirroring the ids in `ActivityBar.tsx`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Section {
    GitHub,
    Terminal,
    Tasks,
    Insights,
    Automation,
    Ralph,
    Crew,
    Tempo,
    Bookmarks,
    Copilot,
    Settings,
}

impl Section {
    pub fn id(self) -> &'static str {
        match self {
            Section::GitHub => "github",
            Section::Terminal => "terminal",
            Section::Tasks => "tasks",
            Section::Insights => "insights",
            Section::Automation => "automation",
            Section::Ralph => "ralph",
            Section::Crew => "crew",
            Section::Tempo => "tempo",
            Section::Bookmarks => "bookmarks",
            Section::Copilot => "copilot",
            Section::Settings => "settings",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Section::GitHub => "GitHub",
            Section::Terminal => "Terminal",
            Section::Tasks => "Tasks",
            Section::Insights => "Insights",
            Section::Automation => "Automation",
            Section::Ralph => "Ralph Loops",
            Section::Crew => "The Crew",
            Section::Tempo => "Tempo",
            Section::Bookmarks => "Bookmarks",
            Section::Copilot => "Copilot",
            Section::Settings => "Settings",
        }
    }
}

pub struct BuddyApp {
    /// `None` means the dashboard is active.
    pub active_section: Option<Section>,
    /// The account the `gh` CLI is currently using, once resolved.
    pub active_account: Option<String>,
    dashboard: Entity<DashboardView>,
}

impl BuddyApp {
    /// Show a section (`None` is the dashboard); the dashboard pauses its
    /// refreshes while hidden.
    pub fn set_section(&mut self, section: Option<Section>, cx: &mut Context<Self>) {
        self.active_section = section;
        self.dashboard.update(cx, |dashboard, cx| {
            dashboard.set_active(section.is_none(), cx)
        });
        cx.notify();
    }

    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let dashboard = cx.new(|cx| DashboardView::new(window, cx));
        cx.subscribe(&dashboard, |this, _, event, cx| {
            let DashboardEvent::Navigate(section) = event;
            this.set_section(Some(*section), cx);
        })
        .detach();

        // One-second tick for the clock and, later, the uptime badge.
        cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor().timer(Duration::from_secs(1)).await;
                if this.update(cx, |_, cx| cx.notify()).is_err() {
                    break;
                }
            }
        })
        .detach();

        // Resolve the active gh account off the UI thread, and re-check every
        // 30 seconds like the Electron status bar so `gh auth switch` shows up.
        cx.spawn(async move |this, cx| {
            loop {
                let rx =
                    cx.update(|cx| Runtime::global(cx).spawn(buddy_core::gh::active_account()));
                if let Ok(account) = rx.await
                    && this
                        .update(cx, |this, cx| {
                            if this.active_account != account {
                                this.active_account = account;
                                cx.notify();
                            }
                        })
                        .is_err()
                {
                    break;
                }
                cx.background_executor()
                    .timer(Duration::from_secs(30))
                    .await;
            }
        })
        .detach();

        Self {
            active_section: None,
            active_account: None,
            dashboard,
        }
    }

    fn render_content(&self, cx: &App) -> impl IntoElement + use<> {
        let theme = cx.theme();
        let container = div().flex_1().min_h_0().w_full().bg(theme.background);
        match self.active_section {
            None => container.child(self.dashboard.clone()),
            Some(section) => container
                .flex()
                .items_center()
                .justify_center()
                .text_color(theme.muted_foreground)
                .child(format!("{} (not yet ported)", section.label())),
        }
    }
}

impl Render for BuddyApp {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.theme();
        let font_family = theme.font_family.clone();
        let background = theme.background;
        let foreground = theme.foreground;

        v_flex()
            .size_full()
            .font_family(font_family)
            .text_size(px(13.0))
            .bg(background)
            .text_color(foreground)
            .child(title_bar::render(self, window, cx))
            .child(
                h_flex()
                    .flex_1()
                    .min_h_0()
                    .w_full()
                    .child(activity_bar::render(self, cx))
                    .child(
                        v_flex()
                            .flex_1()
                            .min_w_0()
                            .h_full()
                            .child(tab_bar::render(cx))
                            .child(self.render_content(cx)),
                    ),
            )
            .child(status_bar::render(self, cx))
    }
}
