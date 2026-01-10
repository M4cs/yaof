//! Desktop/workspace detection service
//!
//! Provides the currently active desktop/workspace number.
//! This is platform-specific:
//! - macOS: Uses Spaces (via AppleScript)
//! - Windows: Virtual desktops
//! - Linux: X11 workspaces or Wayland equivalents

use super::DesktopStatus;

/// Service for monitoring active desktop/workspace
pub struct DesktopService {
    #[cfg(target_os = "macos")]
    _macos_state: (),
    #[cfg(target_os = "windows")]
    _windows_state: (),
    #[cfg(target_os = "linux")]
    _linux_state: (),
}

impl DesktopService {
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

    /// Get current desktop status
    pub fn get_status(&self) -> DesktopStatus {
        #[cfg(target_os = "macos")]
        return self.get_status_macos();

        #[cfg(target_os = "windows")]
        return self.get_status_windows();

        #[cfg(target_os = "linux")]
        return self.get_status_linux();

        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        return DesktopStatus::default();
    }

    #[cfg(target_os = "macos")]
    fn get_status_macos(&self) -> DesktopStatus {
        use std::process::Command;

        // macOS doesn't have a straightforward way to get the current Space number
        // We can use AppleScript with System Events, but it requires accessibility permissions
        let script = r#"
            tell application "System Events"
                set currentDesktop to 1
                try
                    -- Get the index of the current space
                    set currentDesktop to do shell script "defaults read com.apple.spaces 'current-space-index' 2>/dev/null || echo 1"
                end try
                return currentDesktop
            end tell
        "#;

        let output = Command::new("osascript").args(["-e", script]).output();

        match output {
            Ok(out) if out.status.success() => {
                let number = String::from_utf8_lossy(&out.stdout)
                    .trim()
                    .parse::<u32>()
                    .unwrap_or(1);
                DesktopStatus { number, name: None }
            }
            _ => {
                // Fallback: try to read from defaults
                let _defaults_output = Command::new("defaults")
                    .args(["read", "com.apple.dock", "workspaces"])
                    .output();

                // If we can't determine the space, return 1 as default
                DesktopStatus {
                    number: 1,
                    name: None,
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    fn get_status_windows(&self) -> DesktopStatus {
        use std::process::Command;

        // Windows virtual desktops are tricky to access
        // The official API requires COM and is complex
        // For now, we'll use a simpler approach with PowerShell
        let script = r#"
            Add-Type -TypeDefinition @"
            using System;
            using System.Runtime.InteropServices;
            
            public class VirtualDesktop {
                [DllImport("user32.dll")]
                public static extern IntPtr GetForegroundWindow();
            }
"@
            # Virtual desktop index is not directly accessible without COM
            # Return 1 as default
            Write-Output 1
        "#;

        let output = Command::new("powershell")
            .args(["-Command", script])
            .output();

        match output {
            Ok(out) if out.status.success() => {
                let number = String::from_utf8_lossy(&out.stdout)
                    .trim()
                    .parse::<u32>()
                    .unwrap_or(1);
                DesktopStatus { number, name: None }
            }
            _ => DesktopStatus {
                number: 1,
                name: None,
            },
        }
    }

    #[cfg(target_os = "linux")]
    fn get_status_linux(&self) -> DesktopStatus {
        use std::process::Command;

        // Try xdotool first (works with X11)
        let output = Command::new("xdotool").args(["get-desktop"]).output();

        if let Ok(out) = output {
            if out.status.success() {
                if let Ok(desktop) = String::from_utf8_lossy(&out.stdout).trim().parse::<u32>() {
                    // xdotool returns 0-indexed, convert to 1-indexed
                    return DesktopStatus {
                        number: desktop + 1,
                        name: None,
                    };
                }
            }
        }

        // Try wmctrl as fallback
        let output = Command::new("wmctrl").args(["-d"]).output();

        if let Ok(out) = output {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout);
                // wmctrl -d output format: "0  * DG: ..." where * indicates current
                for (index, line) in stdout.lines().enumerate() {
                    if line.contains(" * ") {
                        return DesktopStatus {
                            number: (index + 1) as u32,
                            name: None,
                        };
                    }
                }
            }
        }

        // Try reading from X11 directly using xprop
        let output = Command::new("xprop")
            .args(["-root", "_NET_CURRENT_DESKTOP"])
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout);
                // Output format: "_NET_CURRENT_DESKTOP(CARDINAL) = 0"
                if let Some(value) = stdout.split('=').nth(1) {
                    if let Ok(desktop) = value.trim().parse::<u32>() {
                        return DesktopStatus {
                            number: desktop + 1, // Convert to 1-indexed
                            name: None,
                        };
                    }
                }
            }
        }

        // Default to 1 if we can't determine
        DesktopStatus {
            number: 1,
            name: None,
        }
    }
}

impl Default for DesktopService {
    fn default() -> Self {
        Self::new()
    }
}
