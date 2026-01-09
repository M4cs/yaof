//! Network monitoring service
//!
//! Provides network connection status including:
//! - Connection state (connected/disconnected)
//! - Signal strength (for WiFi)
//! - Connection type (wifi, ethernet, disconnected)

use super::NetworkStatus;

/// Service for monitoring network status
pub struct NetworkService {
    #[cfg(target_os = "macos")]
    _macos_state: (),
    #[cfg(target_os = "windows")]
    _windows_state: (),
    #[cfg(target_os = "linux")]
    _linux_state: (),
}

impl NetworkService {
    pub fn new() -> Self {
        Self {
            #[cfg(target_os = "macos")]
            _macos_state: (),
            #[cfg(target_os = "windows")]
            _windows_state: (),
            #[cfg(target_os = "linux")]
            _linux_state: (),
        }
    }

    /// Get current network status
    pub fn get_status(&self) -> NetworkStatus {
        #[cfg(target_os = "macos")]
        return self.get_status_macos();

        #[cfg(target_os = "windows")]
        return self.get_status_windows();

        #[cfg(target_os = "linux")]
        return self.get_status_linux();

        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        return NetworkStatus::default();
    }

    #[cfg(target_os = "macos")]
    fn get_status_macos(&self) -> NetworkStatus {
        use std::process::Command;

        // Check if we have an active network connection using scutil
        let output = Command::new("scutil").args(["--nwi"]).output();

        let connected = match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                stdout.contains("IPv4") || stdout.contains("IPv6")
            }
            Err(_) => false,
        };

        if !connected {
            return NetworkStatus::default();
        }

        // Try to get WiFi info using airport command
        let wifi_output = Command::new("/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport")
            .args(["-I"])
            .output();

        match wifi_output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);

                // Check if WiFi is connected
                if stdout.contains("SSID:") {
                    // Parse signal strength (agrCtlRSSI)
                    let strength = stdout
                        .lines()
                        .find(|line| line.contains("agrCtlRSSI:"))
                        .and_then(|line| {
                            line.split(':')
                                .nth(1)
                                .and_then(|v| v.trim().parse::<i32>().ok())
                        })
                        .map(|rssi| {
                            // Convert RSSI to percentage (typical range: -100 to -30 dBm)
                            let clamped = rssi.clamp(-100, -30);
                            ((clamped + 100) as f32 / 70.0 * 100.0) as u8
                        });

                    NetworkStatus {
                        connected: true,
                        strength,
                        connection_type: "wifi".to_string(),
                    }
                } else {
                    // Connected but not via WiFi, assume ethernet
                    NetworkStatus {
                        connected: true,
                        strength: None,
                        connection_type: "ethernet".to_string(),
                    }
                }
            }
            Err(_) => {
                // Couldn't check WiFi, but we know we're connected
                NetworkStatus {
                    connected: true,
                    strength: None,
                    connection_type: "ethernet".to_string(),
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    fn get_status_windows(&self) -> NetworkStatus {
        use std::process::Command;

        // Use netsh to check WiFi status
        let output = Command::new("netsh")
            .args(["wlan", "show", "interfaces"])
            .output();

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);

                if stdout.contains("State") && stdout.contains("connected") {
                    // Parse signal strength
                    let strength = stdout
                        .lines()
                        .find(|line| line.contains("Signal"))
                        .and_then(|line| {
                            line.split(':')
                                .nth(1)
                                .and_then(|v| v.trim().trim_end_matches('%').parse::<u8>().ok())
                        });

                    NetworkStatus {
                        connected: true,
                        strength,
                        connection_type: "wifi".to_string(),
                    }
                } else {
                    // Check for ethernet connection
                    let ping_result = Command::new("ping")
                        .args(["-n", "1", "-w", "1000", "8.8.8.8"])
                        .output();

                    if ping_result.map(|o| o.status.success()).unwrap_or(false) {
                        NetworkStatus {
                            connected: true,
                            strength: None,
                            connection_type: "ethernet".to_string(),
                        }
                    } else {
                        NetworkStatus::default()
                    }
                }
            }
            Err(_) => NetworkStatus::default(),
        }
    }

    #[cfg(target_os = "linux")]
    fn get_status_linux(&self) -> NetworkStatus {
        use std::process::Command;

        // Try nmcli first (NetworkManager)
        let output = Command::new("nmcli")
            .args(["-t", "-f", "TYPE,STATE,SIGNAL", "device"])
            .output();

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);

                for line in stdout.lines() {
                    let parts: Vec<&str> = line.split(':').collect();
                    if parts.len() >= 2 && parts[1] == "connected" {
                        let connection_type = parts[0].to_lowercase();
                        let strength = if connection_type == "wifi" && parts.len() >= 3 {
                            parts[2].parse::<u8>().ok()
                        } else {
                            None
                        };

                        return NetworkStatus {
                            connected: true,
                            strength,
                            connection_type: if connection_type == "wifi" {
                                "wifi".to_string()
                            } else {
                                "ethernet".to_string()
                            },
                        };
                    }
                }

                NetworkStatus::default()
            }
            Err(_) => {
                // Fallback: check /sys/class/net for interfaces
                if let Ok(entries) = std::fs::read_dir("/sys/class/net") {
                    for entry in entries.flatten() {
                        let name = entry.file_name();
                        let name_str = name.to_string_lossy();

                        // Skip loopback
                        if name_str == "lo" {
                            continue;
                        }

                        // Check operstate
                        let operstate_path = entry.path().join("operstate");
                        if let Ok(state) = std::fs::read_to_string(&operstate_path) {
                            if state.trim() == "up" {
                                let connection_type = if name_str.starts_with("wl") {
                                    "wifi"
                                } else {
                                    "ethernet"
                                };

                                return NetworkStatus {
                                    connected: true,
                                    strength: None,
                                    connection_type: connection_type.to_string(),
                                };
                            }
                        }
                    }
                }

                NetworkStatus::default()
            }
        }
    }
}

impl Default for NetworkService {
    fn default() -> Self {
        Self::new()
    }
}
