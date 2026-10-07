//! Mirror of the electron-store configuration file (`src/types/config.ts`).
//!
//! Both the Electron app and the native app read and write the same
//! `config.json`, so unknown keys are preserved through `extra` maps and every
//! field has the same default as `defaultConfig` in TypeScript.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Environment variable that overrides the config file location.
pub const CONFIG_PATH_ENV: &str = "BUDDY_CONFIG_PATH";

/// Directory names Electron may use under the platform config root, in
/// lookup order: the packaged `productName`, the documented legacy name, and
/// the unpackaged `package.json` name.
const APP_DIR_CANDIDATES: [&str; 3] = ["Buddy", "hs-buddy", "@hemsoft/buddy"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UsageProvider {
    Copilot,
    Codex,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubAccount {
    pub username: String,
    pub org: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repo_root: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage_provider: Option<UsageProvider>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GitHubConfig {
    pub accounts: Vec<GitHubAccount>,
    /// Durable per-account provider choice keyed by `org/username` (lowercase).
    pub usage_provider_overrides: BTreeMap<String, UsageProvider>,
    /// Product-seeded defaults that `usage_provider_overrides` may mirror.
    pub usage_provider_default_overrides: BTreeMap<String, UsageProvider>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

impl GitHubConfig {
    /// `getUsageProviderOverrideKey`: `org/username`, trimmed and lower-cased.
    pub fn override_key(account: &GitHubAccount) -> String {
        format!(
            "{}/{}",
            account.org.trim().to_lowercase(),
            account.username.trim().to_lowercase()
        )
    }

    /// The provider the Electron app would use: the override map wins over
    /// the inline account field.
    pub fn effective_usage_provider(&self, account: &GitHubAccount) -> Option<UsageProvider> {
        self.usage_provider_overrides
            .get(&Self::override_key(account))
            .copied()
            .or(account.usage_provider)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemeName {
    Dark,
    Light,
}

#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DisplayRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherLocation {
    pub latitude: f64,
    pub longitude: f64,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UiConfig {
    pub theme: ThemeName,
    pub accent_color: String,
    pub font_color: String,
    pub bg_primary: String,
    pub bg_secondary: String,
    pub status_bar_bg: String,
    pub status_bar_fg: String,
    pub font_family: String,
    pub mono_font_family: String,
    pub zoom_level: f64,
    pub sidebar_width: f64,
    pub pane_sizes: Vec<f64>,
    pub display_id: i64,
    pub display_bounds: DisplayRect,
    pub display_work_area: DisplayRect,
    pub show_bookmarked_only: bool,
    pub assistant_open: bool,
    pub terminal_open: bool,
    pub terminal_panel_height: f64,
    pub favorite_users: Vec<String>,
    /// Dashboard card visibility keyed by card id; missing means visible.
    pub dashboard_cards: BTreeMap<String, bool>,
    /// Electron keeps this null and stores ciphertext at the top level.
    pub weather_location: Option<WeatherLocation>,
    pub pollen_api_key: String,
    pub enterprise_slug: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

impl Default for UiConfig {
    fn default() -> Self {
        Self {
            theme: ThemeName::Dark,
            accent_color: "#0e639c".into(),
            font_color: "#cccccc".into(),
            bg_primary: "#1e1e1e".into(),
            bg_secondary: "#252526".into(),
            status_bar_bg: "#181818".into(),
            status_bar_fg: "#9d9d9d".into(),
            font_family: "Inter".into(),
            mono_font_family: "Cascadia Code".into(),
            zoom_level: 100.0,
            sidebar_width: 300.0,
            pane_sizes: vec![300.0, 900.0],
            display_id: 0,
            display_bounds: DisplayRect::default(),
            display_work_area: DisplayRect::default(),
            show_bookmarked_only: false,
            assistant_open: false,
            terminal_open: false,
            terminal_panel_height: 300.0,
            favorite_users: Vec::new(),
            dashboard_cards: BTreeMap::new(),
            weather_location: None,
            pollen_api_key: String::new(),
            enterprise_slug: String::new(),
            extra: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PrConfig {
    pub refresh_interval: f64,
    pub auto_refresh: bool,
    pub recently_merged_days: f64,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

impl Default for PrConfig {
    fn default() -> Self {
        Self {
            refresh_interval: 15.0,
            auto_refresh: true,
            recently_merged_days: 7.0,
            extra: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FinanceConfig {
    /// Ticker symbols tracked on the Finance dashboard card.
    pub watchlist: Vec<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

impl Default for FinanceConfig {
    fn default() -> Self {
        Self {
            watchlist: ["^GSPC", "^IXIC", "^DJI", "BTC-USD"]
                .into_iter()
                .map(String::from)
                .collect(),
            extra: BTreeMap::new(),
        }
    }
}

/// Settings only the native app uses. Electron's schema allows unknown
/// top-level keys, so this section round-trips untouched through its store.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NativeConfig {
    /// Auto-refresh interval in minutes per dashboard card id; 0 is off.
    pub auto_refresh: BTreeMap<String, u32>,
}

impl NativeConfig {
    fn is_default(&self) -> bool {
        self.auto_refresh.is_empty()
    }
}

/// The whole configuration file. Sections the native app does not model yet
/// (`copilot`, `automation`, `notifications`, ...) survive in `extra`.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    pub github: GitHubConfig,
    pub ui: UiConfig,
    pub pr: PrConfig,
    pub finance: FinanceConfig,
    #[serde(skip_serializing_if = "NativeConfig::is_default")]
    pub native: NativeConfig,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

/// Window geometry persisted by Electron's `electron-window-state` in
/// `window-state.json` next to `config.json`.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WindowState {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub is_maximized: bool,
    pub is_full_screen: bool,
}

impl WindowState {
    /// Load the saved geometry when it exists and describes a usable window.
    pub fn load() -> Option<Self> {
        let path = config_path().ok()?.with_file_name("window-state.json");
        let body = std::fs::read_to_string(path).ok()?;
        let state: Self = serde_json::from_str(&body).ok()?;
        (state.width >= 200.0
            && state.height >= 200.0
            && state.x.is_finite()
            && state.y.is_finite())
        .then_some(state)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("could not determine a configuration directory")]
    NoConfigDir,
    #[error("failed to read {path}: {source}")]
    Read {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to parse {path}: {source}")]
    Parse {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("failed to write {path}: {source}")]
    Write {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

/// Resolve the config file path, honoring `BUDDY_CONFIG_PATH` first, then the
/// first existing electron-store location, then the packaged default.
pub fn config_path() -> Result<PathBuf, ConfigError> {
    if let Some(path) = std::env::var_os(CONFIG_PATH_ENV) {
        return Ok(PathBuf::from(path));
    }
    let root = platform_config_root().ok_or(ConfigError::NoConfigDir)?;
    let candidates = APP_DIR_CANDIDATES
        .iter()
        .map(|dir| root.join(dir).join("config.json"))
        .collect::<Vec<_>>();
    Ok(candidates
        .iter()
        .find(|path| path.is_file())
        .cloned()
        .unwrap_or_else(|| candidates[0].clone()))
}

fn platform_config_root() -> Option<PathBuf> {
    if cfg!(target_os = "windows") {
        return std::env::var_os("APPDATA").map(PathBuf::from);
    }
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    if cfg!(target_os = "macos") {
        return Some(home.join("Library").join("Application Support"));
    }
    Some(
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".config")),
    )
}

impl AppConfig {
    /// Parse a config file body. Missing keys take TypeScript defaults.
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    /// Load from the resolved path; a missing file yields defaults.
    pub fn load() -> Result<Self, ConfigError> {
        let path = config_path()?;
        match std::fs::read_to_string(&path) {
            Ok(body) => Self::from_json(&body).map_err(|source| ConfigError::Parse {
                path: path.clone(),
                source,
            }),
            Err(source) if source.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(source) => Err(ConfigError::Read { path, source }),
        }
    }

    /// Write the whole file atomically (temp file + rename) so electron-store's
    /// watcher never observes a partial document.
    pub fn save(&mut self) -> Result<(), ConfigError> {
        self.migrate_legacy_weather_location();
        let path = config_path()?;
        let body = serde_json::to_string_pretty(self).expect("AppConfig is always serializable");
        let write = |source| ConfigError::Write {
            path: path.clone(),
            source,
        };
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(write)?;
        }
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, &body).map_err(write)?;
        // `rename` replaces an existing destination on every supported platform
        // (Windows uses MOVEFILE_REPLACE_EXISTING). If a reader holds the file
        // open without share-delete, fall back to an in-place write so the
        // change is never silently lost.
        if let Err(rename_err) = std::fs::rename(&tmp, &path) {
            log::warn!(
                "atomic replace of {} failed ({rename_err}); writing in place",
                path.display()
            );
            let _ = std::fs::remove_file(&tmp);
            std::fs::write(&path, body).map_err(write)?;
        }
        Ok(())
    }

    /// Older Electron builds stored the weather location in plaintext under
    /// `ui.weatherLocation`. Like Electron, move it to protected storage and
    /// never write the plaintext back.
    ///
    /// The plaintext is cleared only once the keychain has accepted the value;
    /// if the keychain is unavailable the saved city is kept rather than lost.
    fn migrate_legacy_weather_location(&mut self) {
        let Some(location) = self.ui.weather_location.as_ref() else {
            return;
        };
        match crate::secrets::save_weather_location(location) {
            Ok(()) => {
                log::info!("migrated legacy weather location to the keychain");
                self.ui.weather_location = None;
            }
            Err(err) => {
                log::warn!("keeping legacy weather location in config; keychain unavailable: {err}")
            }
        }
    }

    /// Dashboard card visibility: a card is visible unless explicitly `false`.
    pub fn is_dashboard_card_visible(&self, card_id: &str) -> bool {
        self.ui
            .dashboard_cards
            .get(card_id)
            .copied()
            .unwrap_or(true)
    }

    pub fn set_dashboard_card_visible(&mut self, card_id: &str, visible: bool) {
        self.ui.dashboard_cards.insert(card_id.to_string(), visible);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_object_yields_typescript_defaults() {
        let config = AppConfig::from_json("{}").unwrap();
        assert_eq!(config, AppConfig::default());
        assert_eq!(config.ui.accent_color, "#0e639c");
        assert_eq!(config.ui.pane_sizes, vec![300.0, 900.0]);
        assert_eq!(config.finance.watchlist.len(), 4);
        assert!(config.pr.auto_refresh);
    }

    #[test]
    fn parses_electron_store_shape_and_preserves_unknown_keys() {
        let json = r#"{
          "weatherLocationCiphertext": "abc",
          "github": {
            "accounts": [{ "username": "hemsoft", "org": "hemsoft", "usageProvider": "codex" }],
            "usageProviderOverrides": { "hemsoft/hemsoft": "codex" }
          },
          "ui": {
            "theme": "light",
            "dashboardCards": { "finance": false },
            "zoomLevel": 110,
            "someFutureFlag": true
          },
          "copilot": { "model": "claude-sonnet-4.5" }
        }"#;
        let config = AppConfig::from_json(json).unwrap();
        assert_eq!(config.ui.theme, ThemeName::Light);
        assert_eq!(config.ui.zoom_level, 110.0);
        assert_eq!(
            config.github.accounts[0].usage_provider,
            Some(UsageProvider::Codex)
        );
        assert!(!config.is_dashboard_card_visible("finance"));
        assert!(config.is_dashboard_card_visible("weather"));
        assert_eq!(
            config
                .github
                .usage_provider_overrides
                .get("hemsoft/hemsoft"),
            Some(&UsageProvider::Codex)
        );
        let inline = GitHubAccount {
            username: "Franz".into(),
            org: "Relias".into(),
            repo_root: None,
            usage_provider: None,
            extra: BTreeMap::new(),
        };
        assert_eq!(GitHubConfig::override_key(&inline), "relias/franz");
        assert_eq!(
            config
                .github
                .effective_usage_provider(&config.github.accounts[0]),
            Some(UsageProvider::Codex)
        );
        assert_eq!(config.github.effective_usage_provider(&inline), None);
        assert!(config.ui.extra.contains_key("someFutureFlag"));
        assert!(config.extra.contains_key("copilot"));
        assert!(config.extra.contains_key("weatherLocationCiphertext"));

        let round_trip: Value = serde_json::to_value(&config).unwrap();
        assert_eq!(round_trip["copilot"]["model"], "claude-sonnet-4.5");
        assert_eq!(round_trip["ui"]["someFutureFlag"], true);
        assert_eq!(
            round_trip["github"]["accounts"][0]["usageProvider"],
            "codex"
        );
        assert_eq!(
            round_trip["github"]["usageProviderOverrides"]["hemsoft/hemsoft"],
            "codex"
        );
    }

    /// Serializes the tests that set `BUDDY_CONFIG_PATH`.
    static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn native_section_round_trips_and_is_omitted_when_empty() {
        let mut config = AppConfig::default();
        assert!(!serde_json::to_string(&config).unwrap().contains("native"));
        config.native.auto_refresh.insert("weather".into(), 0);
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("\"native\":{\"autoRefresh\":{\"weather\":0}}"));
        let back = AppConfig::from_json(&json).unwrap();
        assert_eq!(back.native.auto_refresh.get("weather"), Some(&0));
    }

    #[test]
    fn window_state_parses_electron_window_state_file() {
        let raw = r#"{"width":2629,"height":1246,"x":445,"y":63,"displayBounds":{"x":0,"y":0,"width":3440,"height":1440},"isMaximized":false,"isFullScreen":false}"#;
        let state: WindowState = serde_json::from_str(raw).unwrap();
        assert_eq!(
            (state.x, state.y, state.width, state.height),
            (445.0, 63.0, 2629.0, 1246.0)
        );
        assert!(!state.is_maximized);
    }

    #[test]
    fn env_override_wins_for_config_path() {
        let _guard = ENV_LOCK.lock().unwrap();
        // SAFETY: serialized by ENV_LOCK; no other thread reads this variable concurrently.
        unsafe { std::env::set_var(CONFIG_PATH_ENV, "/tmp/buddy-test-config.json") };
        let path = config_path().unwrap();
        unsafe { std::env::remove_var(CONFIG_PATH_ENV) };
        assert_eq!(path, PathBuf::from("/tmp/buddy-test-config.json"));
    }

    /// Runs on every CI platform, including Windows, to prove that saving over
    /// an existing config.json replaces it.
    #[test]
    fn save_replaces_an_existing_file() {
        let _guard = ENV_LOCK.lock().unwrap();
        let dir = std::env::temp_dir().join(format!("buddy-save-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.json");
        std::fs::write(
            &path,
            "{\"ui\":{\"theme\":\"light\"},\"copilot\":{\"model\":\"x\"}}",
        )
        .unwrap();
        // SAFETY: serialized by ENV_LOCK.
        unsafe { std::env::set_var(CONFIG_PATH_ENV, &path) };

        let mut first = AppConfig::load().unwrap();
        assert_eq!(first.ui.theme, ThemeName::Light);
        first.set_dashboard_card_visible("finance", false);
        first.save().unwrap();
        let mut second = AppConfig::load().unwrap();
        second.finance.watchlist.push("AAPL".into());
        second.save().unwrap();

        let reread = AppConfig::load().unwrap();
        unsafe { std::env::remove_var(CONFIG_PATH_ENV) };
        let _ = std::fs::remove_dir_all(&dir);

        assert!(!reread.is_dashboard_card_visible("finance"));
        assert!(reread.finance.watchlist.contains(&"AAPL".to_string()));
        assert_eq!(reread.ui.theme, ThemeName::Light);
        assert_eq!(reread.extra["copilot"]["model"], "x");
        assert!(!path.with_extension("json.tmp").exists());
    }
}
