use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct ClaudeUsageResult {
    pub five_hour: UsageWindow,
    pub seven_day: UsageWindow,
}

#[derive(Debug, Serialize)]
pub struct UsageWindow {
    pub utilization: f64,
    pub resets_at: String,
}

#[derive(Debug, Deserialize)]
struct KeychainCredentials {
    #[serde(rename = "claudeAiOauth")]
    claude_ai_oauth: Option<OAuthData>,
}

#[derive(Debug, Deserialize)]
struct OAuthData {
    #[serde(rename = "accessToken")]
    access_token: String,
}

#[derive(Debug, Deserialize)]
struct ApiResponse {
    five_hour: ApiWindow,
    seven_day: ApiWindow,
}

#[derive(Debug, Deserialize)]
struct ApiWindow {
    utilization: f64,
    resets_at: String,
}

fn get_access_token() -> Result<String, String> {
    let output = Command::new("security")
        .args(["find-generic-password", "-s", "Claude Code-credentials", "-w"])
        .output()
        .map_err(|e| format!("Failed to run security command: {}", e))?;

    if !output.status.success() {
        return Err("Failed to read Claude Code credentials from Keychain".to_string());
    }

    let raw = String::from_utf8(output.stdout)
        .map_err(|e| format!("Invalid UTF-8 from keychain: {}", e))?;

    let creds: KeychainCredentials = serde_json::from_str(raw.trim())
        .map_err(|e| format!("Failed to parse keychain credentials: {}", e))?;

    creds
        .claude_ai_oauth
        .map(|o| o.access_token)
        .ok_or_else(|| "No OAuth token found in credentials".to_string())
}

pub async fn get_usage() -> Result<ClaudeUsageResult, String> {
    let token = get_access_token().map_err(|e| {
        eprintln!("[ClaudeUsage] Token error: {}", e);
        e
    })?;

    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.anthropic.com/api/oauth/usage")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "claude-code/2.0.32")
        .header("anthropic-beta", "oauth-2025-04-20")
        .send()
        .await
        .map_err(|e| {
            eprintln!("[ClaudeUsage] HTTP error: {}", e);
            format!("Failed to fetch usage: {}", e)
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        eprintln!("[ClaudeUsage] API error {}: {}", status, body);
        return Err(format!("Usage API returned status {}", status));
    }

    let body = resp.text().await.map_err(|e| format!("Failed to read response: {}", e))?;
    eprintln!("[ClaudeUsage] Response: {}", body);

    let api: ApiResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse usage response: {}", e))?;

    Ok(ClaudeUsageResult {
        five_hour: UsageWindow {
            utilization: api.five_hour.utilization,
            resets_at: api.five_hour.resets_at,
        },
        seven_day: UsageWindow {
            utilization: api.seven_day.utilization,
            resets_at: api.seven_day.resets_at,
        },
    })
}
