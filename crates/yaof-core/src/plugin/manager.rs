//! Native plugin manager for discovering, loading, and running native plugins

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use tauri::AppHandle;
use tokio::sync::RwLock;
use tokio::time::interval;

use super::loader::PluginLoader;
use super::native::NativePluginHost;
use crate::error::Error;

/// Information about a loaded native plugin
#[derive(Debug, Clone)]
pub struct NativePluginInfo {
    pub id: String,
    pub path: PathBuf,
    pub tick_interval_ms: u64,
}

/// Manages native plugins - discovery, loading, tick loop
pub struct NativePluginManager {
    plugins_dir: PathBuf,
    plugins: HashMap<String, NativePluginHost>,
    plugin_info: HashMap<String, NativePluginInfo>,
    app_handle: AppHandle,
}

impl NativePluginManager {
    /// Create a new native plugin manager
    pub fn new(app_handle: AppHandle) -> Result<Self, Error> {
        let home = dirs::home_dir().ok_or_else(|| {
            Error::IoError(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Could not find home directory",
            ))
        })?;
        let plugins_dir = home.join(".yaof").join("native-plugins");

        // Create the directory if it doesn't exist
        fs::create_dir_all(&plugins_dir)?;

        Ok(Self {
            plugins_dir,
            plugins: HashMap::new(),
            plugin_info: HashMap::new(),
            app_handle,
        })
    }

    /// Get the native plugins directory path
    pub fn plugins_dir(&self) -> &Path {
        &self.plugins_dir
    }

    /// Discover and load all native plugins from the plugins directory
    pub fn discover_and_load(&mut self) -> Result<Vec<String>, Error> {
        let mut loaded = Vec::new();

        if !self.plugins_dir.exists() {
            return Ok(loaded);
        }

        // Get the appropriate library extension for the platform
        let lib_extension = if cfg!(target_os = "macos") {
            "dylib"
        } else if cfg!(target_os = "windows") {
            "dll"
        } else {
            "so"
        };

        for entry in fs::read_dir(&self.plugins_dir)? {
            let entry = entry?;
            let path = entry.path();

            // Check if it's a library file
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == lib_extension {
                        match self.load_plugin(&path) {
                            Ok(id) => {
                                println!("[YAOF] Loaded native plugin: {}", id);
                                loaded.push(id);
                            }
                            Err(e) => {
                                eprintln!("[YAOF] Failed to load native plugin {:?}: {}", path, e);
                            }
                        }
                    }
                }
            }
        }

        Ok(loaded)
    }

    /// Load a single native plugin from a path
    pub fn load_plugin(&mut self, path: &Path) -> Result<String, Error> {
        // Derive plugin ID from filename
        // e.g., "libtopbar_service.dylib" -> "topbar-service"
        let plugin_id = derive_plugin_id(path)?;

        // Check if already loaded
        if self.plugins.contains_key(&plugin_id) {
            return Err(Error::PluginNotFound(format!(
                "Plugin {} is already loaded",
                plugin_id
            )));
        }

        // Load the plugin
        let host = NativePluginHost::load(path, plugin_id.clone(), self.app_handle.clone())?;

        // Store plugin info
        let info = NativePluginInfo {
            id: plugin_id.clone(),
            path: path.to_path_buf(),
            tick_interval_ms: 1000, // Default 1 second
        };

        self.plugins.insert(plugin_id.clone(), host);
        self.plugin_info.insert(plugin_id.clone(), info);

        Ok(plugin_id)
    }

    /// Unload a plugin by ID
    pub fn unload_plugin(&mut self, plugin_id: &str) -> Result<(), Error> {
        self.plugins
            .remove(plugin_id)
            .ok_or_else(|| Error::PluginNotFound(plugin_id.to_string()))?;
        self.plugin_info.remove(plugin_id);
        Ok(())
    }

    /// Call tick on all loaded plugins
    pub fn tick_all(&mut self) {
        for (id, plugin) in self.plugins.iter_mut() {
            let result = plugin.tick();
            if result != 0 {
                eprintln!("[YAOF] Plugin {} tick returned error: {}", id, result);
            }
        }
    }

    /// Send a message to a specific plugin
    pub fn send_message(
        &mut self,
        plugin_id: &str,
        msg_type: &str,
        payload: &[u8],
    ) -> Result<i32, Error> {
        let plugin = self
            .plugins
            .get_mut(plugin_id)
            .ok_or_else(|| Error::PluginNotFound(plugin_id.to_string()))?;
        Ok(plugin.send_message(msg_type, payload))
    }

    /// List all loaded plugins
    pub fn list_plugins(&self) -> Vec<&NativePluginInfo> {
        self.plugin_info.values().collect()
    }

    /// Check if a plugin is loaded
    pub fn is_loaded(&self, plugin_id: &str) -> bool {
        self.plugins.contains_key(plugin_id)
    }

    /// Shutdown all plugins (called on drop, but can be called explicitly)
    pub fn shutdown_all(&mut self) {
        // Plugins are dropped when removed from the HashMap
        // The Drop impl on NativePluginHost calls shutdown
        self.plugins.clear();
        self.plugin_info.clear();
    }

    /// Load native plugins from installed plugins (in ~/.yaof/plugins/)
    /// This scans all installed plugins and loads their native components if available
    pub fn load_from_installed_plugins(
        &mut self,
        plugin_loader: &mut PluginLoader,
    ) -> Result<Vec<String>, Error> {
        let mut loaded = Vec::new();

        // Scan for installed plugins
        let manifests = plugin_loader.scan_plugins()?;

        for manifest in manifests {
            // Get the installed plugin
            let installed = match plugin_loader.get_plugin(&manifest.id) {
                Some(p) => p,
                None => continue,
            };

            // Check if this plugin has a native component that can be loaded
            if !installed.can_load_native() {
                continue;
            }

            // Get the native library path
            let lib_path = match installed.native_library_path() {
                Some(p) => p,
                None => {
                    eprintln!(
                        "[YAOF] Plugin {} has native config but no library found",
                        manifest.id
                    );
                    continue;
                }
            };

            // Check if already loaded
            if self.plugins.contains_key(&manifest.id) {
                println!(
                    "[YAOF] Native plugin {} already loaded, skipping",
                    manifest.id
                );
                continue;
            }

            // Load the plugin
            match NativePluginHost::load(&lib_path, manifest.id.clone(), self.app_handle.clone()) {
                Ok(host) => {
                    // Get tick interval from manifest if specified
                    let tick_interval_ms = manifest
                        .native
                        .as_ref()
                        .and_then(|n| n.tick_interval_ms)
                        .unwrap_or(1000);

                    let info = NativePluginInfo {
                        id: manifest.id.clone(),
                        path: lib_path,
                        tick_interval_ms,
                    };

                    self.plugins.insert(manifest.id.clone(), host);
                    self.plugin_info.insert(manifest.id.clone(), info);

                    println!(
                        "[YAOF] Loaded native plugin from installed: {}",
                        manifest.id
                    );
                    loaded.push(manifest.id);
                }
                Err(e) => {
                    eprintln!("[YAOF] Failed to load native plugin {}: {}", manifest.id, e);
                }
            }
        }

        Ok(loaded)
    }

    /// Load a native plugin by its plugin ID (from installed plugins)
    pub fn load_plugin_by_id(
        &mut self,
        plugin_id: &str,
        plugin_loader: &PluginLoader,
    ) -> Result<(), Error> {
        // Get the installed plugin
        let installed = plugin_loader
            .get_plugin(plugin_id)
            .ok_or_else(|| Error::PluginNotFound(plugin_id.to_string()))?;

        // Check if this plugin has a native component
        if !installed.can_load_native() {
            return Err(Error::PluginNotFound(format!(
                "Plugin {} does not have a native component for this platform",
                plugin_id
            )));
        }

        // Get the native library path
        let lib_path = installed.native_library_path().ok_or_else(|| {
            Error::PluginNotFound(format!("Plugin {} native library not found", plugin_id))
        })?;

        // Check if already loaded
        if self.plugins.contains_key(plugin_id) {
            return Err(Error::PluginNotFound(format!(
                "Plugin {} is already loaded",
                plugin_id
            )));
        }

        // Load the plugin
        let host =
            NativePluginHost::load(&lib_path, plugin_id.to_string(), self.app_handle.clone())?;

        // Get tick interval from manifest if specified
        let tick_interval_ms = installed
            .manifest
            .native
            .as_ref()
            .and_then(|n| n.tick_interval_ms)
            .unwrap_or(1000);

        let info = NativePluginInfo {
            id: plugin_id.to_string(),
            path: lib_path,
            tick_interval_ms,
        };

        self.plugins.insert(plugin_id.to_string(), host);
        self.plugin_info.insert(plugin_id.to_string(), info);

        Ok(())
    }
}

impl Drop for NativePluginManager {
    fn drop(&mut self) {
        self.shutdown_all();
    }
}

/// Derive a plugin ID from a library path
/// e.g., "libtopbar_service.dylib" -> "topbar-service"
fn derive_plugin_id(path: &Path) -> Result<String, Error> {
    let filename = path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| Error::PluginNotFound("Invalid plugin filename".to_string()))?;

    // Remove "lib" prefix if present (common on Unix)
    let name = filename.strip_prefix("lib").unwrap_or(filename);

    // Convert underscores to hyphens for consistency
    let id = name.replace('_', "-");

    Ok(id)
}

/// Thread-safe wrapper for NativePluginManager
pub struct NativePluginManagerHandle {
    inner: Arc<RwLock<NativePluginManager>>,
}

impl NativePluginManagerHandle {
    pub fn new(manager: NativePluginManager) -> Self {
        Self {
            inner: Arc::new(RwLock::new(manager)),
        }
    }

    /// Start the tick loop in a background task
    pub fn start_tick_loop(self: Arc<Self>, tick_interval_ms: u64) {
        let handle = self.clone();
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_millis(tick_interval_ms));
            loop {
                interval.tick().await;
                let mut manager = handle.inner.write().await;
                manager.tick_all();
            }
        });
    }

    /// Get read access to the manager
    pub async fn read(&self) -> tokio::sync::RwLockReadGuard<'_, NativePluginManager> {
        self.inner.read().await
    }

    /// Get write access to the manager
    pub async fn write(&self) -> tokio::sync::RwLockWriteGuard<'_, NativePluginManager> {
        self.inner.write().await
    }
}

impl Clone for NativePluginManagerHandle {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
        }
    }
}
