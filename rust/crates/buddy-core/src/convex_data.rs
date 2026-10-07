//! Live Convex subscriptions for the dashboard (`buddyStats:get`,
//! `repoBookmarks:list`), forwarded over a channel to the UI runtime.

use std::collections::BTreeMap;

use convex::{ConvexClient, FunctionResult};
use futures::StreamExt;
use futures::channel::mpsc::UnboundedSender;

use crate::stats::BuddyStats;

/// Default deployment from `electron/config.ts`.
pub const DEFAULT_CONVEX_URL: &str = "https://balanced-trout-451.convex.cloud";

/// `BUDDY_CONVEX_URL`, then Vite's `VITE_CONVEX_URL`, then the default.
pub fn convex_url() -> String {
    std::env::var("BUDDY_CONVEX_URL")
        .or_else(|_| std::env::var("VITE_CONVEX_URL"))
        .ok()
        .map(|url| url.trim().to_string())
        .filter(|url| !url.is_empty())
        .unwrap_or_else(|| DEFAULT_CONVEX_URL.to_string())
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

/// Runs until the receiver is dropped or the connection fails irrecoverably.
pub async fn run_dashboard_subscriptions(url: String, tx: UnboundedSender<ConvexUpdate>) {
    let mut client = match ConvexClient::new(&url).await {
        Ok(client) => client,
        Err(err) => {
            let _ = tx.unbounded_send(ConvexUpdate::Error(format!(
                "Convex connection failed: {err} ({url}); check BUDDY_CONVEX_URL"
            )));
            return;
        }
    };

    let stats = match client.subscribe("buddyStats:get", BTreeMap::new()).await {
        Ok(sub) => sub,
        Err(err) => {
            let _ = tx.unbounded_send(ConvexUpdate::Error(format!(
                "buddyStats:get failed: {err} ({url}); check BUDDY_CONVEX_URL"
            )));
            return;
        }
    };
    let bookmarks = match client
        .subscribe("repoBookmarks:list", BTreeMap::new())
        .await
    {
        Ok(sub) => sub,
        Err(err) => {
            let _ = tx.unbounded_send(ConvexUpdate::Error(format!(
                "repoBookmarks:list failed: {err} ({url}); check BUDDY_CONVEX_URL"
            )));
            return;
        }
    };

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
            break;
        }
    }
    // The server closed every subscription stream (deployment missing or paused).
    let _ = tx.unbounded_send(ConvexUpdate::Error(format!(
        "Convex connection to {url} closed; check BUDDY_CONVEX_URL"
    )));
    // `client` lives until here so the subscriptions stay open.
    drop(client);
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
