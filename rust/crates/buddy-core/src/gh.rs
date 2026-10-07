//! GitHub CLI access, mirroring `electron/ipc/githubHandlers.ts`: the app never
//! stores tokens; `gh` resolves them per account.

use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;

pub const API_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, thiserror::Error)]
pub enum GhError {
    #[error("Invalid GitHub account slug: '{0}'")]
    InvalidSlug(String),
    #[error("GitHub CLI (gh) is not installed. Install from: https://cli.github.com/")]
    NotInstalled,
    #[error("GitHub CLI request timed out")]
    Timeout,
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Failed(String),
}

impl GhError {
    pub fn is_not_found(&self) -> bool {
        matches!(self, GhError::NotFound(_))
    }
}

/// `isValidGitHubAccountSlug`: 1-39 chars, alphanumeric segments joined by
/// single hyphens.
pub fn is_valid_slug(slug: &str) -> bool {
    if slug.is_empty() || slug.len() > 39 {
        return false;
    }
    slug.split('-')
        .all(|segment| !segment.is_empty() && segment.chars().all(|c| c.is_ascii_alphanumeric()))
}

pub fn assert_valid_slug(slug: &str) -> Result<(), GhError> {
    if is_valid_slug(slug) {
        Ok(())
    } else {
        Err(GhError::InvalidSlug(slug.to_string()))
    }
}

async fn run(args: &[&str], token: Option<&str>, timeout: Duration) -> Result<String, GhError> {
    let mut command = Command::new("gh");
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if let Some(token) = token {
        command.env("GH_TOKEN", token);
    }

    let output = match tokio::time::timeout(timeout, command.output()).await {
        Ok(Ok(output)) => output,
        Ok(Err(err)) if err.kind() == std::io::ErrorKind::NotFound => {
            return Err(GhError::NotInstalled);
        }
        Ok(Err(err)) => return Err(GhError::Failed(err.to_string())),
        Err(_) => return Err(GhError::Timeout),
    };

    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let message = if stderr.is_empty() { stdout } else { stderr };
    if message.contains("HTTP 404") || message.contains("Not Found") {
        Err(GhError::NotFound(message))
    } else {
        Err(GhError::Failed(message))
    }
}

/// `gh auth token --user <username>`.
pub async fn auth_token(username: &str) -> Result<String, GhError> {
    assert_valid_slug(username)?;
    let token = run(&["auth", "token", "--user", username], None, API_TIMEOUT).await?;
    if token.is_empty() {
        return Err(GhError::Failed(format!(
            "No token for account '{username}'"
        )));
    }
    Ok(token)
}

/// `parseActiveGitHubAccount`: the login whose "Active account: true" follows
/// its "Logged in to ... account <login>" line in `gh auth status` output.
pub fn parse_active_account(status_output: &str) -> Option<String> {
    let lines: Vec<&str> = status_output.lines().collect();
    for (i, line) in lines.iter().enumerate() {
        let Some(rest) = line.split("Logged in to ").nth(1) else {
            continue;
        };
        let Some(login) = rest
            .split(" account ")
            .nth(1)
            .and_then(|s| s.split_whitespace().next())
        else {
            continue;
        };
        if lines[i + 1..(i + 5).min(lines.len())]
            .iter()
            .any(|l| l.contains("Active account: true"))
        {
            return Some(login.to_string());
        }
    }
    None
}

/// The account `gh` currently uses, or `None` when gh is missing or logged out.
pub async fn active_account() -> Option<String> {
    let mut command = Command::new("gh");
    command
        .args(["auth", "status"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let output = tokio::time::timeout(API_TIMEOUT, command.output())
        .await
        .ok()?
        .ok()?;
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    text.push('\n');
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    parse_active_account(&text)
}

/// `gh api <endpoint> [-H header]...` returning stdout.
pub async fn api(endpoint: &str, token: Option<&str>, headers: &[&str]) -> Result<String, GhError> {
    let mut args = vec!["api", endpoint];
    for header in headers {
        args.push("-H");
        args.push(header);
    }
    run(&args, token, API_TIMEOUT).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_slugs_like_shared_helper() {
        assert!(is_valid_slug("hemsoft"));
        assert!(is_valid_slug("relias-engineering"));
        assert!(is_valid_slug("a1"));
        assert!(!is_valid_slug(""));
        assert!(!is_valid_slug("-lead"));
        assert!(!is_valid_slug("double--dash"));
        assert!(!is_valid_slug("has space"));
        assert!(!is_valid_slug(&"x".repeat(40)));
    }

    #[test]
    fn parses_active_account_from_status_output() {
        let text = "github.com\n  ✓ Logged in to github.com account HemSoft (keyring)\n  - Active account: true\n  - Git operations protocol: ssh\n\n  ✓ Logged in to github.com account fhemmerrelias (keyring)\n  - Active account: false\n";
        assert_eq!(parse_active_account(text).as_deref(), Some("HemSoft"));
        assert_eq!(
            parse_active_account("You are not logged into any GitHub hosts."),
            None
        );
    }
}
