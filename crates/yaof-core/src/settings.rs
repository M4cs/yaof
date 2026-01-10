use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::manifest::{OverlayDefinition, PositionPreset};

/// Overlay settings that are persisted per-overlay.
/// These match the TypeScript OverlaySettings interface in the SDK.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlaySettings {
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    #[serde(default)]
    pub position_preset: Option<String>,
    #[serde(default = "default_opacity")]
    pub opacity: f64,
    #[serde(default)]
    pub click_through: bool,
    #[serde(default = "default_true")]
    pub always_on_top: bool,
}

fn default_true() -> bool {
    true
}

fn default_opacity() -> f64 {
    100.0
}

impl Default for OverlaySettings {
    fn default() -> Self {
        Self {
            enabled: true,
            width: None,
            height: None,
            x: None,
            y: None,
            position_preset: None,
            opacity: 100.0,
            click_through: false,
            always_on_top: true,
        }
    }
}

/// Screen dimensions for position calculations
#[derive(Debug, Clone)]
pub struct ScreenInfo {
    pub width: f64,
    pub height: f64,
}

impl OverlaySettings {
    /// Load overlay settings from the tauri-plugin-store JSON file.
    /// Uses the manifest definition as fallback for default values.
    /// Returns None if the file doesn't exist or can't be parsed.
    pub fn load(
        app_data_dir: &Path,
        plugin_id: &str,
        overlay_id: &str,
        manifest_definition: &OverlayDefinition,
    ) -> Option<Self> {
        let store_path = app_data_dir.join(format!("{}-{}-overlay.json", plugin_id, overlay_id));

        if !store_path.exists() {
            return None;
        }

        let content = fs::read_to_string(&store_path).ok()?;

        // The tauri-plugin-store format stores values directly as key-value pairs
        let store_data: serde_json::Value = serde_json::from_str(&content).ok()?;

        // Extract individual fields from the store
        // Use manifest definition values as fallbacks instead of hardcoded defaults
        let enabled = store_data
            .get("enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        let width = store_data.get("width").and_then(|v| v.as_f64());

        let height = store_data.get("height").and_then(|v| v.as_f64());

        let x = store_data.get("x").and_then(|v| v.as_f64());

        let y = store_data.get("y").and_then(|v| v.as_f64());

        let position_preset = store_data
            .get("positionPreset")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let opacity = store_data
            .get("opacity")
            .and_then(|v| v.as_f64())
            .unwrap_or(100.0);

        // Use manifest's click_through value as the default fallback
        let click_through = store_data
            .get("clickThrough")
            .and_then(|v| v.as_bool())
            .unwrap_or(manifest_definition.click_through);

        let always_on_top = store_data
            .get("alwaysOnTop")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        Some(Self {
            enabled,
            width,
            height,
            x,
            y,
            position_preset,
            opacity,
            click_through,
            always_on_top,
        })
    }
}

/// Calculate position from a preset string and screen/window dimensions.
/// Returns (x, y) coordinates.
pub fn calculate_position_from_preset(
    preset: &str,
    screen: &ScreenInfo,
    window_width: f64,
    window_height: f64,
    padding: f64,
) -> (f64, f64) {
    let x = if preset.contains("left") {
        padding
    } else if preset.contains("right") {
        screen.width - window_width - padding
    } else {
        (screen.width - window_width) / 2.0
    };

    let y = if preset.contains("top") {
        padding
    } else if preset.contains("bottom") {
        screen.height - window_height - padding
    } else {
        (screen.height - window_height) / 2.0
    };

    (x, y)
}

/// Convert manifest PositionPreset to string format used in settings
pub fn position_preset_to_string(preset: &PositionPreset) -> String {
    match preset {
        PositionPreset::TopLeft => "top-left".to_string(),
        PositionPreset::TopCenter => "top-center".to_string(),
        PositionPreset::TopRight => "top-right".to_string(),
        PositionPreset::CenterLeft => "center-left".to_string(),
        PositionPreset::Center => "center".to_string(),
        PositionPreset::CenterRight => "center-right".to_string(),
        PositionPreset::BottomLeft => "bottom-left".to_string(),
        PositionPreset::BottomCenter => "bottom-center".to_string(),
        PositionPreset::BottomRight => "bottom-right".to_string(),
    }
}
