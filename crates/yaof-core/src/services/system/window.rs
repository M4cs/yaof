//! Window focus detection service
//!
//! Provides information about the currently focused window including:
//! - Window title
//! - Application name
//! - Process ID

use super::WindowStatus;

/// Service for monitoring focused window
pub struct WindowService {
    #[cfg(target_os = "macos")]
    _macos_state: (),
    #[cfg(target_os = "windows")]
    _windows_state: (),
    #[cfg(target_os = "linux")]
    _linux_state: (),
}

impl WindowService {
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

    /// Get current focused window status
    pub fn get_status(&self) -> WindowStatus {
        #[cfg(target_os = "macos")]
        return self.get_status_macos();

        #[cfg(target_os = "windows")]
        return self.get_status_windows();

        #[cfg(target_os = "linux")]
        return self.get_status_linux();

        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        return WindowStatus::default();
    }

    #[cfg(target_os = "macos")]
    fn get_status_macos(&self) -> WindowStatus {
        use std::process::Command;

        // Use AppleScript to get the frontmost application and window title
        let script = r#"
            tell application "System Events"
                set frontApp to first application process whose frontmost is true
                set appName to name of frontApp
                set windowTitle to ""
                try
                    set windowTitle to name of front window of frontApp
                end try
                set pid to unix id of frontApp
                return appName & "|" & windowTitle & "|" & pid
            end tell
        "#;

        let output = Command::new("osascript").args(["-e", script]).output();

        match output {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let parts: Vec<&str> = stdout.trim().split('|').collect();

                if parts.len() >= 3 {
                    let app_name = parts[0].to_string();
                    let title = if parts[1].is_empty() {
                        Some(app_name.clone())
                    } else {
                        Some(parts[1].to_string())
                    };
                    let process_id = parts[2].parse::<u32>().ok();

                    WindowStatus {
                        title,
                        app_name: Some(app_name),
                        process_id,
                    }
                } else {
                    WindowStatus::default()
                }
            }
            _ => WindowStatus::default(),
        }
    }

    #[cfg(target_os = "windows")]
    fn get_status_windows(&self) -> WindowStatus {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
        };

        unsafe {
            let hwnd: HWND = GetForegroundWindow();
            if hwnd.0.is_null() {
                return WindowStatus::default();
            }

            // Get window title
            let mut title_buf = [0u16; 512];
            let len = GetWindowTextW(hwnd, &mut title_buf);
            let title = if len > 0 {
                Some(String::from_utf16_lossy(&title_buf[..len as usize]))
            } else {
                None
            };

            // Get process ID
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));

            // Try to get the process name
            let app_name = Self::get_process_name_windows(pid);

            WindowStatus {
                title,
                app_name,
                process_id: Some(pid),
            }
        }
    }

    #[cfg(target_os = "windows")]
    fn get_process_name_windows(pid: u32) -> Option<String> {
        use std::process::Command;

        // Use WMIC to get process name
        let output = Command::new("wmic")
            .args([
                "process",
                "where",
                &format!("ProcessId={}", pid),
                "get",
                "Name",
                "/value",
            ])
            .output()
            .ok()?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.starts_with("Name=") {
                    return Some(line.trim_start_matches("Name=").trim().to_string());
                }
            }
        }

        None
    }

    #[cfg(target_os = "linux")]
    fn get_status_linux(&self) -> WindowStatus {
        use std::process::Command;

        // Try using xdotool first
        let output = Command::new("xdotool")
            .args(["getactivewindow", "getwindowname"])
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                let title = String::from_utf8_lossy(&out.stdout).trim().to_string();

                // Get PID
                let pid_output = Command::new("xdotool")
                    .args(["getactivewindow", "getwindowpid"])
                    .output();

                let process_id = pid_output
                    .ok()
                    .filter(|o| o.status.success())
                    .and_then(|o| {
                        String::from_utf8_lossy(&o.stdout)
                            .trim()
                            .parse::<u32>()
                            .ok()
                    });

                // Try to get app name from WM_CLASS
                let class_output = Command::new("xdotool")
                    .args(["getactivewindow", "getwindowclassname"])
                    .output();

                let app_name = class_output
                    .ok()
                    .filter(|o| o.status.success())
                    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

                return WindowStatus {
                    title: Some(title),
                    app_name,
                    process_id,
                };
            }
        }

        // Fallback: try using wmctrl
        let output = Command::new("wmctrl").args(["-l", "-p"]).output();

        if let Ok(out) = output {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout);
                // wmctrl output format: window_id desktop_id pid host title
                if let Some(line) = stdout.lines().next() {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 5 {
                        let process_id = parts[2].parse::<u32>().ok();
                        let title = parts[4..].join(" ");

                        return WindowStatus {
                            title: Some(title),
                            app_name: None,
                            process_id,
                        };
                    }
                }
            }
        }

        WindowStatus::default()
    }
}

impl Default for WindowService {
    fn default() -> Self {
        Self::new()
    }
}
