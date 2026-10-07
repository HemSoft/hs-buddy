//! The dashboard (`WelcomePanel.tsx`): header, card grid, quick actions, footer.

mod cards;
mod header;
pub mod primitives;

use std::collections::HashMap;
use std::future::Future;
use std::time::{Duration, Instant};

use buddy_core::config::{GitHubConfig, WeatherLocation};
use buddy_core::convex_data::{self, ConvexUpdate};
use buddy_core::copilot_usage::{self, CommandCenterSummary};
use buddy_core::dashboard::{CardId, DASHBOARD_CARDS};
use buddy_core::finance::{self, QuoteData};
use buddy_core::pollen::{self, PollenData, PollenError};
use buddy_core::stats::{BuddyStats, WorkspacePulse};
use buddy_core::weather::{self, WeatherData};
use buddy_core::{http, secrets};
use futures::StreamExt as _;
use gpui_kit::assets::IconName;
use gpui_kit::component::input::{InputEvent, InputState};
use gpui_kit::component::scroll::ScrollableElement as _;
use gpui_kit::component::{ActiveTheme, Icon, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::{
    AnyElement, App, AppContext as _, Context, Entity, EventEmitter, InteractiveElement,
    IntoElement, ParentElement, Render, Styled, Subscription, Window, div, px,
};

use crate::app::Section;
use crate::runtime::Runtime;
use crate::settings::Settings;
use crate::theme::BuddyPalette;

/// Below this window width the grid collapses to one column (`@media (max-width: 860px)`).
const SINGLE_COLUMN_MAX_WIDTH: f32 = 860.0;
const MAX_CONTENT_WIDTH: f32 = 1200.0;
const WEATHER_DEFAULT_INTERVAL_MINUTES: u32 = 30;
const FINANCE_DEFAULT_INTERVAL_MINUTES: u32 = 15;
const CONVEX_STARTUP_GRACE: Duration = Duration::from_secs(20);

pub enum DashboardEvent {
    Navigate(Section),
}

/// Per-card refresh bookkeeping (`useAutoRefresh`).
#[derive(Debug, Clone)]
pub struct RefreshState {
    pub loading: bool,
    pub interval_minutes: u32,
    pub last_refreshed: Option<Instant>,
}

impl RefreshState {
    fn new(interval_minutes: u32) -> Self {
        Self {
            loading: false,
            interval_minutes,
            last_refreshed: None,
        }
    }

    fn mark_refreshed(&mut self) {
        self.loading = false;
        self.last_refreshed = Some(Instant::now());
    }

    fn is_due(&self) -> bool {
        if self.loading || self.interval_minutes == 0 {
            return false;
        }
        match self.last_refreshed {
            Some(at) => at.elapsed() >= Duration::from_secs(u64::from(self.interval_minutes) * 60),
            None => false,
        }
    }

    pub fn last_refreshed_label(&self) -> Option<String> {
        self.last_refreshed
            .map(|at| buddy_core::format::ago(at.elapsed().as_millis() as u64))
    }

    pub fn next_refresh_label(&self) -> Option<String> {
        if self.interval_minutes == 0 {
            return None;
        }
        let at = self.last_refreshed?;
        let period = Duration::from_secs(u64::from(self.interval_minutes) * 60);
        let remaining = period.saturating_sub(at.elapsed());
        Some(buddy_core::format::countdown(remaining.as_millis() as u64))
    }
}

pub struct DashboardView {
    http: reqwest::Client,
    weather_search: Entity<InputState>,
    finance_add: Entity<InputState>,
    expanded: HashMap<CardId, bool>,
    pollen_detail_open: bool,
    session_start: Instant,
    stats: Option<BuddyStats>,
    repo_bookmark_count: usize,
    convex_error: Option<String>,
    convex_started: Instant,
    command_center: CommandCenterSummary,
    copilot_errors: Vec<(String, String)>,
    weather: Option<WeatherData>,
    weather_error: Option<String>,
    weather_location: WeatherLocation,
    /// Bumped whenever the location or an explicit weather request starts;
    /// responses carrying an older generation are ignored.
    weather_generation: u64,
    finance_generation: u64,
    copilot_generation: u64,
    weather_refresh: RefreshState,
    pollen: Option<PollenData>,
    pollen_error: Option<String>,
    quotes: Vec<QuoteData>,
    finance_error: Option<String>,
    finance_refresh: RefreshState,
    /// Inputs the last loads used, so a Settings change (Reload or an
    /// external edit) refreshes only the cards whose inputs changed.
    loaded_watchlist: Vec<String>,
    loaded_github: GitHubConfig,
    loaded_pollen_key: String,
    _subscriptions: Vec<Subscription>,
}

impl EventEmitter<DashboardEvent> for DashboardView {}

impl DashboardView {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let weather_search =
            cx.new(|cx| InputState::new(window, cx).placeholder("City, state or zip code…"));
        let finance_add = cx
            .new(|cx| InputState::new(window, cx).placeholder("Add symbol (e.g. AAPL, ETH-USD)…"));

        let subscriptions = vec![
            cx.observe_global::<Settings>(|this, cx| this.settings_changed(cx)),
            cx.subscribe_in(&weather_search, window, |this, _, event, window, cx| {
                if matches!(event, InputEvent::PressEnter { .. }) {
                    this.submit_weather_search(window, cx);
                }
            }),
            cx.subscribe_in(&finance_add, window, |this, _, event, window, cx| {
                if matches!(event, InputEvent::PressEnter { .. }) {
                    this.submit_finance_add(window, cx);
                }
            }),
        ];

        let mut this = Self {
            http: http::client(),
            weather_search,
            finance_add,
            expanded: HashMap::new(),
            pollen_detail_open: false,
            session_start: Instant::now(),
            stats: None,
            repo_bookmark_count: 0,
            convex_error: None,
            convex_started: Instant::now(),
            command_center: CommandCenterSummary::default(),
            copilot_errors: Vec::new(),
            weather: None,
            weather_error: None,
            weather_location: weather::default_location(),
            weather_generation: 0,
            finance_generation: 0,
            copilot_generation: 0,
            weather_refresh: RefreshState::new(WEATHER_DEFAULT_INTERVAL_MINUTES),
            pollen: None,
            pollen_error: None,
            quotes: Vec::new(),
            finance_error: None,
            finance_refresh: RefreshState::new(FINANCE_DEFAULT_INTERVAL_MINUTES),
            loaded_watchlist: Vec::new(),
            loaded_github: GitHubConfig::default(),
            loaded_pollen_key: String::new(),
            _subscriptions: subscriptions,
        };

        this.restore_weather_location(cx);
        this.load_finance(cx);
        this.load_copilot(cx);
        this.start_convex(cx);
        this.start_ticker(cx);
        this
    }

    // ── Async plumbing ───────────────────────────────────────────────────

    /// Run `future` on the I/O runtime and apply its output on the UI thread.
    fn run<T, F>(
        &self,
        cx: &mut Context<Self>,
        future: F,
        apply: impl FnOnce(&mut Self, T, &mut Context<Self>) + 'static,
    ) where
        T: Send + 'static,
        F: Future<Output = T> + Send + 'static,
    {
        let rx = Runtime::global(cx).spawn(future);
        cx.spawn(async move |this, cx| {
            if let Ok(value) = rx.await {
                this.update(cx, |this, cx| {
                    apply(this, value, cx);
                    cx.notify();
                })
                .ok();
            }
        })
        .detach();
    }

    /// Settings changed (card toggle, Reload, or an edit Electron made that a
    /// save picked up): re-run only the loads whose inputs differ.
    fn settings_changed(&mut self, cx: &mut Context<Self>) {
        let config = Settings::global(cx).config.clone();
        if config.finance.watchlist != self.loaded_watchlist {
            self.load_finance(cx);
        }
        if config.github != self.loaded_github {
            self.load_copilot(cx);
        }
        if config.ui.pollen_api_key != self.loaded_pollen_key {
            self.load_pollen(cx);
        }
        cx.notify();
    }

    fn start_ticker(&self, cx: &mut Context<Self>) {
        cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor().timer(Duration::from_secs(1)).await;
                if this.update(cx, |this, cx| this.tick(cx)).is_err() {
                    break;
                }
            }
        })
        .detach();
    }

    /// Once a second: fire due auto-refreshes and repaint countdowns/uptime.
    fn tick(&mut self, cx: &mut Context<Self>) {
        if self.weather_refresh.is_due() {
            self.refresh_weather(cx);
        }
        if self.finance_refresh.is_due() {
            self.refresh_finance(cx);
        }
        cx.notify();
    }

    fn start_convex(&self, cx: &mut Context<Self>) {
        let (tx, mut rx) = futures::channel::mpsc::unbounded::<ConvexUpdate>();
        Runtime::global(cx).spawn_detached(convex_data::run_dashboard_subscriptions(
            convex_data::convex_url(),
            tx,
        ));
        cx.spawn(async move |this, cx| {
            while let Some(update) = rx.next().await {
                let applied = this.update(cx, |this, cx| {
                    match update {
                        ConvexUpdate::Stats(stats) => {
                            this.stats = Some(stats);
                            this.convex_error = None;
                        }
                        ConvexUpdate::RepoBookmarkCount(count) => this.repo_bookmark_count = count,
                        ConvexUpdate::Error(message) => {
                            log::warn!("convex: {message}");
                            this.convex_error = Some(message);
                        }
                    }
                    cx.notify();
                });
                if applied.is_err() {
                    break;
                }
            }
        })
        .detach();
    }

    // ── Loads ────────────────────────────────────────────────────────────

    fn restore_weather_location(&mut self, cx: &mut Context<Self>) {
        self.weather_refresh.loading = true;
        self.run(
            cx,
            async move {
                tokio::task::spawn_blocking(secrets::load_weather_location)
                    .await
                    .ok()
                    .flatten()
            },
            |this, saved, cx| {
                if let Some(location) = saved {
                    this.weather_location = location;
                }
                this.load_weather(cx);
                this.load_pollen(cx);
            },
        );
    }

    /// Start a new weather request generation; older in-flight replies are dropped.
    fn next_weather_generation(&mut self) -> u64 {
        self.weather_generation += 1;
        self.weather_generation
    }

    fn load_weather(&mut self, cx: &mut Context<Self>) {
        self.weather_refresh.loading = true;
        let http = self.http.clone();
        let location = self.weather_location.clone();
        let generation = self.next_weather_generation();
        self.run(
            cx,
            async move { weather::fetch_weather(&http, &location).await },
            move |this, result, _| {
                if generation != this.weather_generation {
                    return;
                }
                match result {
                    Ok(data) => {
                        this.weather = Some(data);
                        this.weather_error = None;
                    }
                    Err(err) => this.weather_error = Some(err),
                }
                this.weather_refresh.mark_refreshed();
            },
        );
    }

    fn load_pollen(&mut self, cx: &mut Context<Self>) {
        let http = self.http.clone();
        let (lat, lon) = (
            self.weather_location.latitude,
            self.weather_location.longitude,
        );
        let api_key = Settings::global(cx).config.ui.pollen_api_key.clone();
        self.loaded_pollen_key = api_key.clone();
        let generation = self.weather_generation;
        self.run(
            cx,
            async move { pollen::fetch_pollen(&http, lat, lon, &api_key).await },
            move |this, result, _| {
                if generation != this.weather_generation {
                    return;
                }
                match result {
                    Ok(data) => {
                        this.pollen = Some(data);
                        this.pollen_error = None;
                    }
                    Err(PollenError::NoApiKey) => {
                        this.pollen = None;
                        this.pollen_error = None;
                    }
                    Err(PollenError::Message(message)) => this.pollen_error = Some(message),
                }
            },
        );
    }

    fn load_finance(&mut self, cx: &mut Context<Self>) {
        let watchlist = Settings::global(cx).config.finance.watchlist.clone();
        self.loaded_watchlist = watchlist.clone();
        if watchlist.is_empty() {
            self.quotes.clear();
            self.finance_refresh.mark_refreshed();
            return;
        }
        self.finance_refresh.loading = true;
        let http = self.http.clone();
        self.finance_generation += 1;
        let generation = self.finance_generation;
        self.run(
            cx,
            async move { finance::fetch_quotes(&http, &watchlist).await },
            move |this, result, cx| {
                if generation != this.finance_generation {
                    return;
                }
                match result {
                    Ok(mut quotes) => {
                        // Reconcile against the live watchlist: a symbol removed
                        // while this request was in flight must not come back.
                        let current = Settings::global(cx).config.finance.watchlist.clone();
                        quotes.retain(|q| current.contains(&q.symbol));
                        this.quotes = quotes;
                        this.finance_error = None;
                    }
                    Err(err) => this.finance_error = Some(err),
                }
                this.finance_refresh.mark_refreshed();
            },
        );
    }

    fn load_copilot(&mut self, cx: &mut Context<Self>) {
        let github = Settings::global(cx).config.github.clone();
        self.loaded_github = github.clone();
        self.command_center.loading = true;
        self.copilot_generation += 1;
        let generation = self.copilot_generation;
        self.run(
            cx,
            async move { copilot_usage::fetch_report(&github, chrono::Utc::now()).await },
            move |this, report, _| {
                if generation != this.copilot_generation {
                    return;
                }
                for (username, error) in &report.errors {
                    log::warn!("copilot usage for {username}: {error}");
                }
                this.command_center = report.summary;
                this.copilot_errors = report.errors;
            },
        );
    }

    fn set_weather_location(&mut self, location: WeatherLocation, cx: &mut Context<Self>) {
        self.weather_location = location.clone();
        self.weather = None;
        self.pollen = None;
        Runtime::global(cx).spawn_detached(async move {
            let result =
                tokio::task::spawn_blocking(move || secrets::save_weather_location(&location))
                    .await;
            if let Ok(Err(err)) = result {
                log::warn!("could not remember weather location: {err}");
            }
        });
        self.load_weather(cx);
        self.load_pollen(cx);
    }

    // ── State accessors used by the cards ───────────────────────────────

    pub fn is_expanded(&self, card: CardId) -> bool {
        self.expanded.get(&card).copied().unwrap_or(true)
    }

    pub fn toggle_expanded(&mut self, card: CardId, cx: &mut Context<Self>) {
        let next = !self.is_expanded(card);
        self.expanded.insert(card, next);
        cx.notify();
    }

    /// `useLiveUptime`: stored uptime plus the running session.
    pub fn live_uptime_ms(&self) -> u64 {
        let stats = self.stats.as_ref();
        let stored = stats.map(|s| s.total_uptime_ms).unwrap_or(0);
        let session = match stats.and_then(|s| s.last_session_start) {
            Some(started_ms) => {
                let now_ms = chrono::Utc::now().timestamp_millis().max(0) as u64;
                now_ms.saturating_sub(started_ms)
            }
            None => self.session_start.elapsed().as_millis() as u64,
        };
        stored + session
    }

    pub fn command_center(&self) -> &CommandCenterSummary {
        &self.command_center
    }

    pub fn copilot_error(&self) -> Option<String> {
        self.copilot_errors
            .first()
            .map(|(username, error)| format!("{username}: {error}"))
    }

    pub fn pulse(&self) -> WorkspacePulse {
        let stats = self.stats.clone().unwrap_or_default();
        // Active PR counts need the pull-request views, which are not ported yet.
        WorkspacePulse::from_stats(&stats, None, self.repo_bookmark_count as u64)
    }

    /// Connection error, or a reachability hint once the first load is overdue.
    pub fn convex_error(&self) -> Option<String> {
        if let Some(error) = &self.convex_error {
            return Some(error.clone());
        }
        (self.stats.is_none() && self.convex_started.elapsed() > CONVEX_STARTUP_GRACE)
            .then(|| format!("Convex not reachable yet ({})", convex_data::convex_url()))
    }

    pub fn stats_loaded(&self) -> bool {
        self.stats.is_some()
    }

    pub fn weather(&self) -> Option<&WeatherData> {
        self.weather.as_ref()
    }

    pub fn weather_error(&self) -> Option<&str> {
        self.weather_error.as_deref()
    }

    pub fn weather_caption(&self) -> String {
        self.weather
            .as_ref()
            .map(|w| w.location_name.clone())
            .unwrap_or_else(|| self.weather_location.name.clone())
    }

    pub fn weather_refresh(&self) -> &RefreshState {
        &self.weather_refresh
    }

    pub fn weather_search_input(&self) -> &Entity<InputState> {
        &self.weather_search
    }

    pub fn pollen(&self) -> Option<&PollenData> {
        self.pollen.as_ref()
    }

    pub fn pollen_error(&self) -> Option<&str> {
        self.pollen_error.as_deref()
    }

    pub fn pollen_detail_open(&self) -> bool {
        self.pollen_detail_open
    }

    pub fn toggle_pollen_detail(&mut self, cx: &mut Context<Self>) {
        self.pollen_detail_open = !self.pollen_detail_open;
        cx.notify();
    }

    pub fn quotes(&self) -> &[QuoteData] {
        &self.quotes
    }

    pub fn finance_error(&self) -> Option<&str> {
        self.finance_error.as_deref()
    }

    pub fn finance_refresh(&self) -> &RefreshState {
        &self.finance_refresh
    }

    pub fn finance_add_input(&self) -> &Entity<InputState> {
        &self.finance_add
    }

    pub fn watchlist_len(&self, cx: &App) -> usize {
        Settings::global(cx).config.finance.watchlist.len()
    }

    // ── Actions ──────────────────────────────────────────────────────────

    pub fn refresh_copilot_usage(&mut self, cx: &mut Context<Self>) {
        if !self.command_center.loading {
            self.load_copilot(cx);
            cx.notify();
        }
    }

    pub fn refresh_weather(&mut self, cx: &mut Context<Self>) {
        if self.weather_refresh.loading {
            return;
        }
        self.load_weather(cx);
        self.load_pollen(cx);
        cx.notify();
    }

    pub fn set_weather_interval(&mut self, minutes: u32, cx: &mut Context<Self>) {
        self.weather_refresh.interval_minutes = minutes;
        cx.notify();
    }

    /// "Use My Location": approximate from the public IP, then name it.
    pub fn use_my_location(&mut self, cx: &mut Context<Self>) {
        self.weather_refresh.loading = true;
        self.weather_error = None;
        let http = self.http.clone();
        let generation = self.next_weather_generation();
        self.run(
            cx,
            async move {
                let mut location = weather::locate_by_ip(&http).await?;
                if let Some(name) =
                    weather::reverse_geocode(&http, location.latitude, location.longitude).await
                {
                    location.name = name;
                }
                Ok::<_, String>(location)
            },
            move |this, result, cx| {
                if generation != this.weather_generation {
                    return;
                }
                match result {
                    Ok(location) => this.set_weather_location(location, cx),
                    Err(err) => {
                        this.weather_error = Some(err);
                        this.weather_refresh.loading = false;
                    }
                }
            },
        );
        cx.notify();
    }

    pub fn submit_weather_search(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let query = self.weather_search.read(cx).value().trim().to_string();
        if query.is_empty() {
            return;
        }
        self.weather_search
            .update(cx, |state, cx| state.set_value("", window, cx));
        self.weather_refresh.loading = true;
        self.weather_error = None;
        let http = self.http.clone();
        let generation = self.next_weather_generation();
        self.run(
            cx,
            async move { weather::search_location(&http, &query).await },
            move |this, result, cx| {
                if generation != this.weather_generation {
                    return;
                }
                match result {
                    Ok(location) => this.set_weather_location(location, cx),
                    Err(err) => {
                        this.weather_error = Some(err);
                        this.weather_refresh.loading = false;
                    }
                }
            },
        );
        cx.notify();
    }

    pub fn refresh_finance(&mut self, cx: &mut Context<Self>) {
        if self.finance_refresh.loading {
            return;
        }
        self.load_finance(cx);
        cx.notify();
    }

    pub fn set_finance_interval(&mut self, minutes: u32, cx: &mut Context<Self>) {
        self.finance_refresh.interval_minutes = minutes;
        cx.notify();
    }

    pub fn submit_finance_add(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let raw = self.finance_add.read(cx).value().to_string();
        let symbol = finance::normalize_symbol(&raw);
        if !finance::is_valid_symbol(&symbol) {
            return;
        }
        self.finance_add
            .update(cx, |state, cx| state.set_value("", window, cx));
        if Settings::global(cx)
            .config
            .finance
            .watchlist
            .contains(&symbol)
        {
            return;
        }
        Settings::update(cx, |config| config.finance.watchlist.push(symbol.clone()));
        let http = self.http.clone();
        self.run(
            cx,
            async move { finance::fetch_quote(&http, &symbol).await },
            |this, result, _| match result {
                Ok(quote) => {
                    if !this.quotes.iter().any(|q| q.symbol == quote.symbol) {
                        this.quotes.push(quote);
                    }
                    this.finance_error = None;
                }
                Err(err) => this.finance_error = Some(err),
            },
        );
        cx.notify();
    }

    pub fn remove_symbol(&mut self, symbol: &str, cx: &mut Context<Self>) {
        self.quotes.retain(|q| q.symbol != symbol);
        let symbol = symbol.to_string();
        Settings::update(cx, |config| {
            config.finance.watchlist.retain(|s| *s != symbol)
        });
        cx.notify();
    }

    pub fn toggle_card(&mut self, card: CardId, cx: &mut Context<Self>) {
        let visible = Settings::global(cx)
            .config
            .is_dashboard_card_visible(card.key());
        Settings::update(cx, |config| {
            config.set_dashboard_card_visible(card.key(), !visible)
        });
        cx.notify();
    }

    pub fn navigate(&mut self, section: Section, cx: &mut Context<Self>) {
        cx.emit(DashboardEvent::Navigate(section));
    }

    // ── Layout ───────────────────────────────────────────────────────────

    fn visible_cards(&self, cx: &App) -> Vec<CardId> {
        let config = &Settings::global(cx).config;
        DASHBOARD_CARDS
            .into_iter()
            .filter(|card| config.is_dashboard_card_visible(card.key()))
            .collect()
    }

    fn render_card(&self, card: CardId, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        match card {
            CardId::CommandCenter => cards::command_center::render(self, cx),
            CardId::WorkspacePulse => cards::workspace_pulse::render(self, cx),
            CardId::Weather => cards::weather::render(self, window, cx),
            CardId::Finance => cards::finance::render(self, window, cx),
        }
    }

    /// Two-column CSS grid semantics: span-2 cards take a row, span-1 cards pair up.
    fn grid_rows(cards: &[CardId], two_columns: bool) -> Vec<Vec<CardId>> {
        let mut rows: Vec<Vec<CardId>> = Vec::new();
        let mut pending: Option<CardId> = None;
        for &card in cards {
            if card.span() == 2 || !two_columns {
                if let Some(p) = pending.take() {
                    rows.push(vec![p]);
                }
                rows.push(vec![card]);
            } else if let Some(p) = pending.take() {
                rows.push(vec![p, card]);
            } else {
                pending = Some(card);
            }
        }
        if let Some(p) = pending {
            rows.push(vec![p]);
        }
        rows
    }

    fn render_grid(&self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        let two_columns = window.viewport_size().width > px(SINGLE_COLUMN_MAX_WIDTH);
        let cards = self.visible_cards(cx);
        let rows = Self::grid_rows(&cards, two_columns);

        v_flex()
            .w_full()
            .gap(px(16.0))
            .children(rows.into_iter().map(|row| {
                let needs_spacer = two_columns && row.len() == 1 && row[0].span() == 1;
                h_flex()
                    .w_full()
                    .items_start()
                    .gap(px(16.0))
                    .children(row.into_iter().map(|card| {
                        div()
                            .flex_1()
                            .min_w_0()
                            .child(self.render_card(card, window, cx))
                    }))
                    .when(needs_spacer, |this| this.child(div().flex_1()))
            }))
    }

    fn render_quick_actions(&self, cx: &mut Context<Self>) -> impl IntoElement + use<> {
        let action = |id: &'static str, icon: IconName, label: &'static str, section: Section| {
            primitives::Pill::new(id, label)
                .icon(icon)
                .accent_icon()
                .build(
                    cx.listener(move |this, _, _, cx| this.navigate(section, cx)),
                    cx,
                )
        };
        h_flex()
            .gap(px(8.0))
            .flex_wrap()
            .justify_center()
            .child(action(
                "qa-my-prs",
                IconName::GitPullRequest,
                "My PRs",
                Section::GitHub,
            ))
            .child(action(
                "qa-orgs",
                IconName::Building2,
                "Organizations",
                Section::GitHub,
            ))
            .child(action(
                "qa-jobs",
                IconName::Zap,
                "Jobs",
                Section::Automation,
            ))
            .child(action(
                "qa-settings",
                IconName::Settings,
                "Settings",
                Section::Settings,
            ))
    }

    fn render_footer(&self, cx: &App) -> impl IntoElement + use<> {
        let palette = BuddyPalette::global(cx);
        h_flex()
            .items_center()
            .gap(px(5.0))
            .text_size(px(11.0))
            .text_color(palette.text_muted)
            .child("Made with")
            .child(
                Icon::new(IconName::Heart)
                    .size(px(12.0))
                    .text_color(crate::theme::hex("#e25555")),
            )
            .child("by HemSoft Developments")
    }
}

impl Render for DashboardView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let background = cx.theme().background;
        let narrow = window.viewport_size().width <= px(680.0);
        let (pad_y, pad_x) = if narrow { (12.0, 16.0) } else { (20.0, 24.0) };

        div()
            .id("dashboard-scroll")
            .size_full()
            .bg(background)
            .overflow_y_scrollbar()
            .child(
                div()
                    .w_full()
                    .flex()
                    .justify_center()
                    .px(px(pad_x))
                    .py(px(pad_y))
                    .child(
                        v_flex()
                            .w_full()
                            .max_w(px(MAX_CONTENT_WIDTH))
                            .items_center()
                            .gap(px(20.0))
                            .child(header::render(self, cx))
                            .child(self.render_grid(window, cx))
                            .child(self.render_quick_actions(cx))
                            .child(self.render_footer(cx)),
                    ),
            )
    }
}
