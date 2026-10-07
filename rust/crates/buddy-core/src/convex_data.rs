//! Live Convex subscriptions for the dashboard (`buddyStats:get`,
//! `repoBookmarks:list`), forwarded over a channel to the UI runtime.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use convex::{ConvexClient, FunctionResult};
use futures::StreamExt;
use futures::channel::mpsc::UnboundedSender;

use crate::stats::BuddyStats;

/// Local Convex dev backend (`npx convex dev` / Aspire), matching `.env.local`.
pub const DEFAULT_CONVEX_URL: &str = "http://127.0.0.1:3210";

/// Resolve the deployment URL the way the Electron app effectively does:
/// `BUDDY_CONVEX_URL`, then `VITE_CONVEX_URL` from the environment, then
/// `VITE_CONVEX_URL` from the repo's `.env.local` or `.env` (searched upward
/// from the working directory and the executable), then the local backend.
pub fn convex_url() -> String {
    for key in ["BUDDY_CONVEX_URL", "VITE_CONVEX_URL"] {
        if let Some(url) = std::env::var(key).ok().and_then(clean_url) {
            return url;
        }
    }
    for dir in search_roots() {
        for file in [".env.local", ".env"] {
            let path = dir.join(file);
            if let Ok(body) = std::fs::read_to_string(&path)
                && let Some(url) = dotenv_value(&body, "VITE_CONVEX_URL").and_then(clean_url)
            {
                log::info!("convex url from {}", path.display());
                return url;
            }
        }
    }
    DEFAULT_CONVEX_URL.to_string()
}

fn clean_url(raw: String) -> Option<String> {
    let trimmed = raw.trim().trim_end_matches('/');
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

/// Directories to probe for env files: cwd and the executable's directory,
/// each followed by all ancestors.
fn search_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut push_chain = |start: Option<PathBuf>| {
        let mut current = start;
        while let Some(dir) = current {
            if !roots.contains(&dir) {
                roots.push(dir.clone());
            }
            current = dir.parent().map(Path::to_path_buf);
        }
    };
    push_chain(std::env::current_dir().ok());
    push_chain(
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(Path::to_path_buf)),
    );
    roots
}

/// Minimal dotenv lookup: `KEY=value`, optional `export`, `#` comments,
/// surrounding single or double quotes stripped.
pub fn dotenv_value(body: &str, key: &str) -> Option<String> {
    body.lines().find_map(|line| {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            return None;
        }
        let line = line.strip_prefix("export ").unwrap_or(line);
        let (k, v) = line.split_once('=')?;
        if k.trim() != key {
            return None;
        }
        let v = v.trim();
        // Quoted values keep everything inside the quotes (including `#`);
        // unquoted values stop at an inline ` #` comment, as dotenv does.
        let v = if let Some(inner) = v.strip_prefix('"').and_then(|s| s.split('"').next()) {
            inner
        } else if let Some(inner) = v.strip_prefix('\'').and_then(|s| s.split('\'').next()) {
            inner
        } else {
            v.split(" #").next().unwrap_or(v).trim()
        };
        Some(v.to_string())
    })
}

#[derive(Debug, Clone)]
pub enum ConvexUpdate {
    Stats(BuddyStats),
    RepoBookmarkCount(usize),
    Error(String),
}

fn result_json(result: FunctionResult) -> Result<serde_json::Value, String> {
    match result {
        FunctionResult::Value(value) => Ok(value.export()),
        FunctionResult::ErrorMessage(message) => Err(message),
        FunctionResult::ConvexError(error) => Err(error.to_string()),
    }
}

/// Runs until the receiver is dropped. Connection and subscription failures
/// (backend not started yet, closed by the server) are reported through the
/// channel and retried with backoff, so starting `npx convex dev` after the
/// app is already open still connects.
pub async fn run_dashboard_subscriptions(url: String, tx: UnboundedSender<ConvexUpdate>) {
    let mut attempt: u32 = 0;
    while !tx.is_closed() {
        match subscribe_once(&url, &tx).await {
            Ok(()) => return,
            Err(message) => {
                attempt += 1;
                let delay = Duration::from_secs((5u64 << attempt.min(4)).min(60));
                let _ = tx.unbounded_send(ConvexUpdate::Error(format!(
                    "{message}; retrying in {}s",
                    delay.as_secs()
                )));
                tokio::time::sleep(delay).await;
            }
        }
    }
}

/// One connection lifetime. `Ok` only when the receiver went away.
async fn subscribe_once(url: &str, tx: &UnboundedSender<ConvexUpdate>) -> Result<(), String> {
    let hint = "is the local backend running?";
    let mut client = ConvexClient::new(url)
        .await
        .map_err(|err| format!("Convex connection failed: {err} ({url}); {hint}"))?;
    let stats = client
        .subscribe("buddyStats:get", BTreeMap::new())
        .await
        .map_err(|err| format!("buddyStats:get failed: {err} ({url}); {hint}"))?;
    let bookmarks = client
        .subscribe("repoBookmarks:list", BTreeMap::new())
        .await
        .map_err(|err| format!("repoBookmarks:list failed: {err} ({url}); {hint}"))?;

    let mut merged = futures::stream::select(
        stats.map(|result| ("stats", result)),
        bookmarks.map(|result| ("bookmarks", result)),
    );

    while let Some((source, result)) = merged.next().await {
        let update = match (source, result_json(result)) {
            ("stats", Ok(json)) => ConvexUpdate::Stats(BuddyStats::from_json(&json)),
            ("bookmarks", Ok(json)) => {
                ConvexUpdate::RepoBookmarkCount(json.as_array().map(Vec::len).unwrap_or(0))
            }
            (_, Err(message)) => ConvexUpdate::Error(message),
            _ => continue,
        };
        if tx.unbounded_send(update).is_err() {
            return Ok(());
        }
    }
    // Keep the client alive until the streams end so subscriptions stay open.
    drop(client);
    Err(format!(
        "Convex connection to {url} closed; start the local backend (npx convex dev) or set BUDDY_CONVEX_URL"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_vite_convex_url_from_dotenv_text() {
        let body = "# Deployment used by `npx convex dev`\nCONVEX_DEPLOYMENT=anonymous:anonymous-hs-buddy\nVITE_CONVEX_URL=http://127.0.0.1:3210\nVITE_CONVEX_SITE_URL=http://127.0.0.1:3211\n";
        assert_eq!(
            dotenv_value(body, "VITE_CONVEX_URL").as_deref(),
            Some("http://127.0.0.1:3210")
        );
        assert_eq!(dotenv_value(body, "MISSING"), None);
        assert_eq!(
            dotenv_value(
                "export VITE_CONVEX_URL=\"https://x.convex.cloud/\"",
                "VITE_CONVEX_URL"
            )
            .as_deref(),
            Some("https://x.convex.cloud/")
        );
        assert_eq!(
            dotenv_value("VITE_CONVEX_URL='http://localhost:3210'", "VITE_CONVEX_URL").as_deref(),
            Some("http://localhost:3210")
        );
        assert_eq!(
            dotenv_value(
                "VITE_CONVEX_URL=http://127.0.0.1:3210 # local backend",
                "VITE_CONVEX_URL"
            )
            .as_deref(),
            Some("http://127.0.0.1:3210")
        );
        assert_eq!(
            dotenv_value("VITE_CONVEX_URL=\"http://h/#frag\" # c", "VITE_CONVEX_URL").as_deref(),
            Some("http://h/#frag")
        );
    }

    #[test]
    fn strips_trailing_slash_and_rejects_empty() {
        assert_eq!(
            clean_url(" http://127.0.0.1:3210/ ".into()).as_deref(),
            Some("http://127.0.0.1:3210")
        );
        assert_eq!(clean_url("   ".into()), None);
    }
}

#[cfg(test)]
mod live_tests {
    use super::*;

    /// Diagnostic only: `cargo test -p buddy-core convex_live -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore]
    async fn convex_live() {
        let _ =
            env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("debug"))
                .try_init();
        let url = convex_url();
        println!("connecting to {url}");
        let mut client = match ConvexClient::new(&url).await {
            Ok(c) => c,
            Err(err) => {
                println!("new() failed: {err:?}");
                return;
            }
        };
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(15),
            client.query("buddyStats:get", BTreeMap::new()),
        )
        .await;
        println!("query result: {result:?}");
    }
}
