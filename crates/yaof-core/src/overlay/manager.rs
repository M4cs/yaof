use std::collections::HashMap;

use crate::{
    Error, ServiceRegistry,
    overlay::{OverlayConfig, OverlayWindow, configure_overlay, set_unconstrained_position},
};
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder, window::Color};
pub struct OverlayManager {
    app: AppHandle,
    windows: HashMap<String, OverlayWindow>,
    registry: ServiceRegistry,
}

impl OverlayManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            windows: HashMap::new(),
            registry: ServiceRegistry::new(),
        }
    }

    pub fn spawn_overlay(&mut self, config: OverlayConfig) -> Result<String, Error> {
        let id = config.id.clone();

        // Determine the correct URL type based on the entry_point
        // - yaof-plugin:// URLs use the custom protocol for plugin assets
        // - Relative paths use bundled assets (WebviewUrl::App)
        // - Other URLs are passed through as external
        let url = if config.entry_point.starts_with("yaof-plugin://") {
            // Custom protocol for plugin assets
            WebviewUrl::External(
                config
                    .entry_point
                    .parse()
                    .map_err(|e| Error::WindowCreation(format!("Invalid URL: {}", e)))?,
            )
        } else if config.entry_point.starts_with("http://")
            || config.entry_point.starts_with("https://")
        {
            // External HTTP URL (e.g., dev server)
            WebviewUrl::External(
                config
                    .entry_point
                    .parse()
                    .map_err(|e| Error::WindowCreation(format!("Invalid URL: {}", e)))?,
            )
        } else {
            // Bundled asset (relative path like "index.html")
            WebviewUrl::App(config.entry_point.clone().into())
        };

        // Create the window initially hidden to prevent visual glitches
        // The window will be made visible by set_unconstrained_position after
        // it has been positioned correctly (bypassing macOS frame constraining)
        let window = WebviewWindowBuilder::new(&self.app, &id, url)
            .title(&id)
            .inner_size(config.width, config.height)
            // Don't set position here - it will be constrained by macOS
            // Instead, we'll set it via set_unconstrained_position
            .decorations(!config.frameless)
            .transparent(true)
            .background_color(Color(0, 0, 0, 0))
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false) // Start hidden, will be shown after positioning
            .build()
            .map_err(|e| Error::WindowCreation(e.to_string()))?;

        // Apply platform-specific overlay configuration
        // This sets window level, collection behavior (macOS), click-through handling,
        // and ensures the window stays below the menu bar but above normal windows
        configure_overlay(&window, config.click_through)?;

        // Set the window position using unconstrained positioning
        // This bypasses macOS's automatic frame constraining that prevents
        // windows from being placed in the menu bar/notch area
        set_unconstrained_position(&window, config.x, config.y, config.width, config.height)?;

        if config.click_through {
            window.set_ignore_cursor_events(true)?;
            window.set_focusable(false)?;
            window.set_shadow(false)?;
        }

        let overlay = OverlayWindow {
            window,
            plugin_id: config.plugin_id.clone(),
            config,
        };

        self.windows.insert(id.clone(), overlay);
        Ok(id)
    }

    pub fn get_overlay(&self, id: &str) -> Option<&OverlayWindow> {
        self.windows.get(id)
    }

    pub fn get_overlay_mut(&mut self, id: &str) -> Option<&mut OverlayWindow> {
        self.windows.get_mut(id)
    }

    pub fn close_overlay(&mut self, id: &str) -> Result<(), Error> {
        let overlay = self
            .windows
            .remove(id)
            .ok_or_else(|| Error::WindowNotFound(id.to_string()))?;

        overlay
            .window
            .close()
            .map_err(|_e| Error::WindowCreation(id.to_string()))?;

        Ok(())
    }

    pub fn list_overlays(&self) -> Vec<&OverlayWindow> {
        self.windows.values().collect()
    }

    pub fn set_click_through(&self, id: &str, enabled: bool) -> Result<(), Error> {
        let overlay = self
            .windows
            .get(id)
            .ok_or_else(|| Error::WindowNotFound(id.to_string()))?;

        overlay
            .window
            .set_ignore_cursor_events(enabled)
            .map_err(|e| Error::WindowCreation(e.to_string()))?;

        Ok(())
    }

    /// Update the geometry (position and size) of an existing overlay window
    pub fn update_overlay_geometry(
        &mut self,
        id: &str,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    ) -> Result<(), Error> {
        let overlay = self
            .windows
            .get_mut(id)
            .ok_or_else(|| Error::WindowNotFound(id.to_string()))?;

        // Update the stored config
        overlay.config.x = x;
        overlay.config.y = y;
        overlay.config.width = width;
        overlay.config.height = height;

        // Apply the new position using unconstrained positioning (for macOS menu bar area)
        set_unconstrained_position(&overlay.window, x, y, width, height)?;

        Ok(())
    }

    /// Set always-on-top state for an overlay window
    pub fn set_always_on_top(&self, id: &str, enabled: bool) -> Result<(), Error> {
        let overlay = self
            .windows
            .get(id)
            .ok_or_else(|| Error::WindowNotFound(id.to_string()))?;

        overlay
            .window
            .set_always_on_top(enabled)
            .map_err(|e| Error::WindowCreation(e.to_string()))?;

        Ok(())
    }

    /// Check if an overlay with the given ID exists
    pub fn has_overlay(&self, id: &str) -> bool {
        self.windows.contains_key(id)
    }

    /// Set the visibility of an overlay window
    pub fn set_visible(&self, id: &str, visible: bool) -> Result<(), Error> {
        let overlay = self
            .windows
            .get(id)
            .ok_or_else(|| Error::WindowNotFound(id.to_string()))?;

        if visible {
            overlay
                .window
                .show()
                .map_err(|e| Error::WindowCreation(e.to_string()))?;
        } else {
            overlay
                .window
                .hide()
                .map_err(|e| Error::WindowCreation(e.to_string()))?;
        }

        Ok(())
    }

    pub fn registry(&self) -> &ServiceRegistry {
        &self.registry
    }

    pub fn registry_mut(&mut self) -> &mut ServiceRegistry {
        &mut self.registry
    }
}
