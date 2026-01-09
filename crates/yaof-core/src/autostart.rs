use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::{
    OverlayState, PluginState,
    manifest::OverlayDefinition,
    overlay::{OverlayConfig, manager::OverlayManager},
    settings::{
        OverlaySettings, ScreenInfo, calculate_position_from_preset, position_preset_to_string,
    },
};

/// Information about an overlay to be spawned
#[derive(Debug)]
struct OverlaySpawnInfo {
    plugin_id: String,
    overlay_id: String,
    /// Whether this is a valid core plugin (bundled with the app)
    is_core: bool,
    definition: OverlayDefinition,
    settings: Option<OverlaySettings>,
}

/// Autostart manager that handles spawning enabled overlays on startup
pub struct AutostartManager;

impl AutostartManager {
    /// Spawn all enabled overlays from installed plugins.
    /// This should be called after the app is fully initialized.
    pub fn spawn_enabled_overlays(app: &AppHandle) -> Result<Vec<String>, String> {
        println!("[Autostart] Starting spawn_enabled_overlays...");
        let mut spawned_ids = Vec::new();

        // Get app data directory for reading settings
        println!("[Autostart] Getting app data directory...");
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;
        println!("[Autostart] App data dir: {:?}", app_data_dir);

        // Collect all overlays to spawn
        println!("[Autostart] Collecting overlays to spawn...");
        let overlays_to_spawn = Self::collect_overlays_to_spawn(app, &app_data_dir)?;
        println!(
            "[Autostart] Found {} overlays to spawn",
            overlays_to_spawn.len()
        );

        // Get screen info for position calculations
        let screen = Self::get_primary_screen_info(app);
        println!("[Autostart] Screen info: {:?}", screen);

        // Spawn each enabled overlay
        println!("[Autostart] Locking overlay manager...");
        let overlay_state = app.state::<OverlayState>();
        let mut manager = overlay_state
            .0
            .lock()
            .map_err(|e| format!("Failed to lock overlay manager: {}", e))?;
        println!("[Autostart] Overlay manager locked successfully");

        for info in overlays_to_spawn {
            println!(
                "[Autostart] Attempting to spawn overlay: {}/{}",
                info.plugin_id, info.overlay_id
            );
            println!("[Autostart]   - is_core: {}", info.is_core);
            println!("[Autostart]   - definition: {:?}", info.definition);
            println!("[Autostart]   - settings: {:?}", info.settings);

            match Self::spawn_overlay(&mut manager, &info, &screen) {
                Ok(id) => {
                    println!("[Autostart] Successfully spawned overlay: {}", id);
                    spawned_ids.push(id);
                }
                Err(e) => {
                    eprintln!(
                        "[Autostart] Failed to spawn overlay {}/{}: {}",
                        info.plugin_id, info.overlay_id, e
                    );
                }
            }
        }

        println!(
            "[Autostart] Finished spawning overlays. Total spawned: {}",
            spawned_ids.len()
        );
        Ok(spawned_ids)
    }

    /// Collect all overlays that should be spawned based on settings
    fn collect_overlays_to_spawn(
        app: &AppHandle,
        app_data_dir: &Path,
    ) -> Result<Vec<OverlaySpawnInfo>, String> {
        let plugin_state = app.state::<PluginState>();
        let mut loader = plugin_state
            .0
            .lock()
            .map_err(|e| format!("Failed to lock plugin loader: {}", e))?;

        // Scan for installed plugins
        let manifests = loader
            .scan_plugins()
            .map_err(|e| format!("Failed to scan plugins: {}", e))?;

        let mut overlays_to_spawn = Vec::new();

        for manifest in manifests {
            // Verify the plugin exists
            if loader.get_plugin(&manifest.id).is_none() {
                continue;
            }

            if manifest.core {
                continue;
            }

            // Iterate through each overlay defined in the manifest
            for (overlay_id, definition) in &manifest.overlays {
                // Load persisted settings if they exist, using manifest definition as fallback for defaults
                let settings =
                    OverlaySettings::load(app_data_dir, &manifest.id, overlay_id, definition);

                // Determine if this overlay should be spawned
                let should_spawn = match &settings {
                    Some(s) => s.enabled,
                    None => true, // Default to enabled if no settings exist (manifest default)
                };

                if should_spawn {
                    overlays_to_spawn.push(OverlaySpawnInfo {
                        plugin_id: manifest.id.clone(),
                        overlay_id: overlay_id.clone(),
                        is_core: manifest.is_valid_core_plugin(),
                        definition: definition.clone(),
                        settings,
                    });
                }
            }
        }

        Ok(overlays_to_spawn)
    }

    /// Spawn a single overlay with the given configuration
    fn spawn_overlay(
        manager: &mut OverlayManager,
        info: &OverlaySpawnInfo,
        screen: &Option<ScreenInfo>,
    ) -> Result<String, String> {
        // Determine dimensions - use settings if available, otherwise manifest defaults
        let width = info
            .settings
            .as_ref()
            .and_then(|s| s.width)
            .unwrap_or(info.definition.width);

        let height = info
            .settings
            .as_ref()
            .and_then(|s| s.height)
            .unwrap_or(info.definition.height);

        // Determine position
        let (x, y) = Self::calculate_position(info, screen, width, height);

        // Determine click-through setting
        let click_through = info
            .settings
            .as_ref()
            .map(|s| s.click_through)
            .unwrap_or(info.definition.click_through);

        // Build the entry point URL with route hash for HashRouter support
        // - Core plugins (validated via is_valid_core_plugin) use bundled assets (WebviewUrl::App)
        // - Other plugins use the custom yaof-plugin:// protocol for dynamic loading
        // - Route is appended as hash fragment for client-side routing
        let route = info.definition.route.as_deref().unwrap_or("/");
        let entry_point = if info.is_core {
            format!("index.html#{}", route) // Uses WebviewUrl::App (bundled via frontendDist)
        } else {
            format!("yaof-plugin://{}/index.html#{}", info.plugin_id, route) // Custom protocol
        };

        // Create overlay ID
        let overlay_id = format!("{}-{}", info.plugin_id, info.overlay_id);

        let config = OverlayConfig {
            id: overlay_id,
            plugin_id: info.plugin_id.clone(),
            entry_point,
            width,
            height,
            x,
            y,
            click_through,
            frameless: info.definition.frameless,
        };

        println!("{:?}", config);

        manager.spawn_overlay(config).map_err(|e| e.to_string())
    }

    /// Calculate the position for an overlay based on settings or manifest defaults
    ///
    /// Priority order:
    /// 1. Stored x/y settings (if they exist) - user explicitly set these
    /// 2. Stored position preset - calculate position from preset
    /// 3. Manifest's explicit x/y values - from overlay.json
    /// 4. Manifest's default position preset - calculate with padding
    /// 5. Ultimate fallback - (100, 100)
    fn calculate_position(
        info: &OverlaySpawnInfo,
        screen: &Option<ScreenInfo>,
        width: f64,
        height: f64,
    ) -> (f64, f64) {
        // First check if we have explicit x/y coordinates in stored settings
        // If user has saved specific coordinates, use them directly
        if let Some(settings) = &info.settings {
            if let (Some(x), Some(y)) = (settings.x, settings.y) {
                // User has explicitly set x/y coordinates - use them directly
                return (x, y);
            }

            // Check for position preset in settings (no explicit x/y stored)
            if let Some(preset) = &settings.position_preset {
                if let Some(screen_info) = screen {
                    return calculate_position_from_preset(
                        preset,
                        screen_info,
                        width,
                        height,
                        20.0,
                    );
                }
            }
        }

        // Fall back to manifest values - check explicit x/y first
        if let (Some(x), Some(y)) = (info.definition.x, info.definition.y) {
            return (x, y);
        }

        // Then use manifest's default position preset
        if let Some(screen_info) = screen {
            let preset_str = position_preset_to_string(&info.definition.default_position);
            return calculate_position_from_preset(&preset_str, screen_info, width, height, 20.0);
        }

        // Ultimate fallback - center of a typical screen
        (100.0, 100.0)
    }

    /// Get primary screen information for position calculations
    fn get_primary_screen_info(_app: &AppHandle) -> Option<ScreenInfo> {
        // Try to get monitor info from Tauri
        // Note: This is a simplified approach - in production you might want to
        // use the actual monitor API when available

        // For now, we'll use reasonable defaults that work for most screens
        // The overlay will adjust itself via the SDK's usePosition hook after loading
        Some(ScreenInfo {
            width: 1920.0,
            height: 1080.0,
        })
    }
}
