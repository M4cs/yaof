//! Built-in system services for yaof
//!
//! These services provide system information that any plugin can subscribe to:
//! - CPU usage
//! - Network status
//! - Focused window
//! - Active desktop
//! - Now playing media

mod cpu;
mod desktop;
mod media;
mod network;
mod window;

use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use tokio::time::interval;

pub use cpu::CpuService;
pub use desktop::DesktopService;
pub use media::MediaService;
pub use network::NetworkService;
pub use window::WindowService;

/// Trait for system services that emit periodic updates
pub trait SystemService: Send + Sync {
    /// The name of this service (used in event names)
    fn name(&self) -> &'static str;

    /// Called periodically to collect and return current data
    fn tick(&mut self) -> serde_json::Value;
}

/// Combined system status emitted as a single event
#[derive(Debug, Clone, Serialize)]
pub struct SystemStatus {
    pub cpu: CpuStatus,
    pub network: NetworkStatus,
    pub window: WindowStatus,
    pub desktop: DesktopStatus,
    pub media: MediaStatus,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct CpuStatus {
    pub usage: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct NetworkStatus {
    pub connected: bool,
    pub connection_type: String,
    pub strength: Option<u8>,
}

impl Default for NetworkStatus {
    fn default() -> Self {
        Self {
            connected: false,
            connection_type: "disconnected".to_string(),
            strength: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct WindowStatus {
    pub title: Option<String>,
    pub app_name: Option<String>,
    pub process_id: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct DesktopStatus {
    pub number: u32,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct MediaStatus {
    pub playing: bool,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration_ms: Option<u64>,
    pub position_ms: Option<u64>,
    pub app_name: Option<String>,
}

/// Manager for all system services
pub struct SystemServiceManager {
    cpu_service: CpuService,
    network_service: NetworkService,
    window_service: WindowService,
    desktop_service: DesktopService,
    media_service: MediaService,
}

impl SystemServiceManager {
    pub fn new() -> Self {
        Self {
            cpu_service: CpuService::new(),
            network_service: NetworkService::new(),
            window_service: WindowService::new(),
            desktop_service: DesktopService::new(),
            media_service: MediaService::new(),
        }
    }

    /// Collect status from all services
    pub fn collect_status(&mut self) -> SystemStatus {
        SystemStatus {
            cpu: self.cpu_service.get_status(),
            network: self.network_service.get_status(),
            window: self.window_service.get_status(),
            desktop: self.desktop_service.get_status(),
            media: self.media_service.get_status(),
        }
    }
}

impl Default for SystemServiceManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Thread-safe handle for the system service manager
pub struct SystemServiceHandle {
    inner: Arc<RwLock<SystemServiceManager>>,
}

impl SystemServiceHandle {
    pub fn new(manager: SystemServiceManager) -> Self {
        Self {
            inner: Arc::new(RwLock::new(manager)),
        }
    }

    /// Start the tick loop that emits system status events
    pub fn start_tick_loop(self: Arc<Self>, app: AppHandle, tick_interval_ms: u64) {
        let handle = self.clone();
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_millis(tick_interval_ms));
            loop {
                interval.tick().await;

                // Collect status from all services
                let status = {
                    let mut manager = handle.inner.write().await;
                    manager.collect_status()
                };

                // Emit the combined status event
                if let Err(e) = app.emit("yaof:system:status", &status) {
                    eprintln!("[YAOF] Failed to emit system status: {}", e);
                }

                // Also emit individual service events for granular subscriptions
                let _ = app.emit("yaof:system:cpu", &status.cpu);
                let _ = app.emit("yaof:system:network", &status.network);
                let _ = app.emit("yaof:system:window", &status.window);
                let _ = app.emit("yaof:system:desktop", &status.desktop);
                let _ = app.emit("yaof:system:media", &status.media);
            }
        });
    }

    /// Get read access to the manager
    pub async fn read(&self) -> tokio::sync::RwLockReadGuard<'_, SystemServiceManager> {
        self.inner.read().await
    }

    /// Get write access to the manager
    pub async fn write(&self) -> tokio::sync::RwLockWriteGuard<'_, SystemServiceManager> {
        self.inner.write().await
    }
}

impl Clone for SystemServiceHandle {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
        }
    }
}
