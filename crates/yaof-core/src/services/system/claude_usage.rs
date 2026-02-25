//! Claude Code usage monitoring service
//!
//! Fetches usage limits from the Anthropic OAuth API using credentials
//! stored in the macOS Keychain. Caches results and refreshes periodically.

use std::process::Command;
use std::time::Instant;

use super::ClaudeUsageStatus;

const REFRESH_INTERVAL_SECS: u64 = 300; // 5 minutes

pub struct ClaudeUsageService {
    cached: ClaudeUsageStatus,
    last_fetch: Option<Instant>,
}

impl ClaudeUsageService {
    pub fn new() -> Self {
        Self {
            cached: ClaudeUsageStatus::default(),
            last_fetch: None,
        }
    }

    pub fn get_status(&mut self) -> ClaudeUsageStatus {
        let should_refresh = match self.last_fetch {
            None => true,
            Some(t) => t.elapsed().as_secs() >= REFRESH_INTERVAL_SECS,
        };

        if should_refresh {
            match self.fetch_usage() {
                Ok(status) => {
                    self.cached = status;
                    self.last_fetch = Some(Instant::now());
                }
                Err(e) => {
                    eprintln!("[ClaudeUsage] {}", e);
                }
            }
        }

        self.cached.clone()
    }

    fn fetch_usage(&self) -> Result<ClaudeUsageStatus, String> {
        let token = self.get_access_token()?;

        let output = Command::new("curl")
            .args([
                "-s",
                "-H",
                &format!("Authorization: Bearer {}", token),
                "-H",
                "User-Agent: claude-code/2.0.32",
                "-H",
                "anthropic-beta: oauth-2025-04-20",
                "https://api.anthropic.com/api/oauth/usage",
            ])
            .output()
            .map_err(|e| format!("curl failed: {}", e))?;

        if !output.status.success() {
            return Err("curl returned non-zero exit code".to_string());
        }

        let body = String::from_utf8(output.stdout)
            .map_err(|e| format!("Invalid UTF-8 from curl: {}", e))?;

        let json: serde_json::Value =
            serde_json::from_str(&body).map_err(|e| format!("JSON parse error: {}", e))?;

        Ok(ClaudeUsageStatus {
            session_utilization: json["five_hour"]["utilization"].as_f64().unwrap_or(0.0),
            session_resets_at: json["five_hour"]["resets_at"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            weekly_utilization: json["seven_day"]["utilization"].as_f64().unwrap_or(0.0),
            weekly_resets_at: json["seven_day"]["resets_at"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            available: true,
        })
    }

    fn get_access_token(&self) -> Result<String, String> {
        let output = Command::new("security")
            .args([
                "find-generic-password",
                "-s",
                "Claude Code-credentials",
                "-w",
            ])
            .output()
            .map_err(|e| format!("security command failed: {}", e))?;

        if !output.status.success() {
            return Err("No Claude Code credentials in Keychain".to_string());
        }

        let raw = String::from_utf8(output.stdout)
            .map_err(|e| format!("Invalid UTF-8 from keychain: {}", e))?;

        let json: serde_json::Value =
            serde_json::from_str(raw.trim()).map_err(|e| format!("Keychain JSON error: {}", e))?;

        json["claudeAiOauth"]["accessToken"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "No accessToken in credentials".to_string())
    }
}

impl Default for ClaudeUsageService {
    fn default() -> Self {
        Self::new()
    }
}
