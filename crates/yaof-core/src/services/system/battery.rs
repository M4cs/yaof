//! Battery monitoring service
//!
//! Provides battery status including:
//! - Charge percentage
//! - Charging state
//! - Time remaining

use std::time::Instant;

use super::BatteryStatus;

const REFRESH_INTERVAL_SECS: u64 = 30;

pub struct BatteryService {
    cached: BatteryStatus,
    last_fetch: Option<Instant>,
}

impl BatteryService {
    pub fn new() -> Self {
        Self {
            cached: BatteryStatus::default(),
            last_fetch: None,
        }
    }

    pub fn get_status(&mut self) -> BatteryStatus {
        let should_refresh = match self.last_fetch {
            None => true,
            Some(t) => t.elapsed().as_secs() >= REFRESH_INTERVAL_SECS,
        };

        if should_refresh {
            self.cached = self.fetch_battery();
            self.last_fetch = Some(Instant::now());
        }

        self.cached.clone()
    }

    fn fetch_battery(&self) -> BatteryStatus {
        #[cfg(target_os = "macos")]
        return self.fetch_battery_macos();

        #[cfg(not(target_os = "macos"))]
        return BatteryStatus::default();
    }

    #[cfg(target_os = "macos")]
    fn fetch_battery_macos(&self) -> BatteryStatus {
        use std::process::{Command, Stdio};
        use super::wait_with_timeout;

        let child = Command::new("pmset")
            .args(["-g", "batt"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();

        let output = match child {
            Ok(c) => match wait_with_timeout(c, 3) {
                Ok(out) => out,
                Err(_) => return BatteryStatus::default(),
            },
            Err(_) => return BatteryStatus::default(),
        };

        if !output.status.success() {
            return BatteryStatus::default();
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        self.parse_pmset(&stdout)
    }

    #[cfg(target_os = "macos")]
    fn parse_pmset(&self, output: &str) -> BatteryStatus {
        // Example pmset output:
        // Now drawing from 'Battery Power'
        //  -InternalBattery-0 (id=...)	78%; discharging; 5:02 remaining
        // Or:
        //  -InternalBattery-0 (id=...)	100%; charged; 0:00 remaining
        // Or:
        //  -InternalBattery-0 (id=...)	85%; charging; 0:42 remaining

        for line in output.lines() {
            let trimmed = line.trim();
            if !trimmed.starts_with('-') {
                continue;
            }

            // Find percentage
            let percentage = trimmed
                .split('\t')
                .nth(1)
                .and_then(|part| {
                    part.split(';')
                        .next()
                        .and_then(|pct| pct.trim().trim_end_matches('%').parse::<u8>().ok())
                })
                .unwrap_or(0);

            // Find charge state
            let charging = trimmed.contains("charging") && !trimmed.contains("discharging");

            // Find time remaining
            let time_remaining = trimmed
                .split(';')
                .find(|s| s.contains("remaining"))
                .map(|s| s.trim().replace(" remaining", ""))
                .filter(|s| s != "0:00" && !s.contains("not charging"));

            return BatteryStatus {
                percentage,
                charging,
                time_remaining,
                available: true,
            };
        }

        BatteryStatus::default()
    }
}

impl Default for BatteryService {
    fn default() -> Self {
        Self::new()
    }
}
