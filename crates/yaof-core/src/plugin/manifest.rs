use indexmap::IndexMap;

use crate::Error;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum PositionPreset {
    TopLeft,
    TopCenter,
    TopRight,
    CenterLeft,
    #[default]
    Center,
    CenterRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayDefinition {
    pub width: f64,
    pub height: f64,
    /// Optional X position. If not set, will be calculated from default_position.
    #[serde(default)]
    pub x: Option<f64>,
    /// Optional Y position. If not set, will be calculated from default_position.
    #[serde(default)]
    pub y: Option<f64>,
    #[serde(default)]
    pub default_position: PositionPreset,
    #[serde(default)]
    pub click_through: bool,
    #[serde(default = "default_true")]
    pub frameless: bool,
    /// Optional route path for this overlay (used with HashRouter).
    /// Defaults to "/" if not specified. Allows multiple overlays from the same
    /// plugin to render different components based on the route.
    #[serde(default)]
    pub route: Option<String>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceDefinition {
    pub id: String,
    pub schema: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevConfig {
    pub port: u16,
}

/// Supported platform identifiers
pub type Platform = String; // e.g., "darwin-arm64", "darwin-x64", "linux-x64", "win32-x64"

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeConfig {
    /// List of platforms this native plugin supports
    #[serde(default)]
    pub platforms: Vec<Platform>,
    /// Platform-specific library paths
    #[serde(default)]
    pub libraries: std::collections::HashMap<Platform, String>,
    /// Legacy single library path (for backwards compatibility)
    #[serde(default)]
    pub library: Option<String>,
    /// Tick interval in milliseconds for the plugin's update loop
    /// Default is 1000ms (1 second)
    #[serde(default)]
    pub tick_interval_ms: Option<u64>,
}

impl NativeConfig {
    /// Get the library path for the current platform
    pub fn library_for_current_platform(&self) -> Option<&str> {
        let current_platform = Self::current_platform();

        // First check platform-specific libraries
        if let Some(lib) = self.libraries.get(&current_platform) {
            return Some(lib.as_str());
        }

        // Fall back to legacy single library path
        self.library.as_deref()
    }

    /// Check if the current platform is supported
    pub fn supports_current_platform(&self) -> bool {
        let current_platform = Self::current_platform();

        // If platforms list is empty, assume all platforms are supported (legacy behavior)
        if self.platforms.is_empty() {
            return self.library.is_some() || !self.libraries.is_empty();
        }

        self.platforms.contains(&current_platform)
    }

    /// Get the current platform identifier
    pub fn current_platform() -> Platform {
        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        return "darwin-arm64".to_string();

        #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
        return "darwin-x64".to_string();

        #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
        return "linux-x64".to_string();

        #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
        return "win32-x64".to_string();

        #[cfg(not(any(
            all(target_os = "macos", target_arch = "aarch64"),
            all(target_os = "macos", target_arch = "x86_64"),
            all(target_os = "linux", target_arch = "x86_64"),
            all(target_os = "windows", target_arch = "x86_64"),
        )))]
        return "unknown".to_string();
    }
}

/// A single setting field definition for plugin settings schema
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum SettingField {
    /// String input field
    #[serde(rename = "string")]
    String {
        label: String,
        #[serde(default)]
        description: Option<String>,
        #[serde(default)]
        default: Option<String>,
        #[serde(default)]
        placeholder: Option<String>,
    },
    /// Number input field
    #[serde(rename = "number")]
    Number {
        label: String,
        #[serde(default)]
        description: Option<String>,
        #[serde(default)]
        default: Option<f64>,
        #[serde(default)]
        min: Option<f64>,
        #[serde(default)]
        max: Option<f64>,
        #[serde(default)]
        step: Option<f64>,
    },
    /// Boolean toggle field
    #[serde(rename = "boolean")]
    Boolean {
        label: String,
        #[serde(default)]
        description: Option<String>,
        #[serde(default)]
        default: Option<bool>,
    },
    /// Select dropdown field
    #[serde(rename = "select")]
    Select {
        label: String,
        #[serde(default)]
        description: Option<String>,
        #[serde(default)]
        default: Option<String>,
        options: Vec<SelectOption>,
    },
    /// Color picker field
    #[serde(rename = "color")]
    Color {
        label: String,
        #[serde(default)]
        description: Option<String>,
        #[serde(default)]
        default: Option<String>,
    },
    /// Slider field
    #[serde(rename = "slider")]
    Slider {
        label: String,
        #[serde(default)]
        description: Option<String>,
        min: f64,
        max: f64,
        #[serde(default)]
        step: Option<f64>,
        #[serde(default)]
        default: Option<f64>,
    },
    /// Keybind field
    #[serde(rename = "keybind")]
    Keybind {
        label: String,
        #[serde(default)]
        description: Option<String>,
        #[serde(default)]
        default: Option<String>,
    },
    /// Ordered list field - for reorderable selection from options
    #[serde(rename = "orderedList")]
    OrderedList {
        label: String,
        #[serde(default)]
        description: Option<String>,
        #[serde(default)]
        default: Option<Vec<serde_json::Value>>,
        #[serde(default)]
        options: Vec<SelectOption>,
    },
    /// Multi-choice field - for selecting multiple items
    #[serde(rename = "multiChoice")]
    MultiChoice {
        label: String,
        #[serde(default)]
        description: Option<String>,
        #[serde(default)]
        default: Option<Vec<String>>,
        #[serde(default)]
        options: Vec<SelectOption>,
    },
    /// Category field - for grouping related settings
    #[serde(rename = "category")]
    Category {
        label: String,
        #[serde(default)]
        description: Option<String>,
        #[serde(default)]
        fields: IndexMap<String, Box<SettingField>>,
    },
}

/// Option for select fields
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectOption {
    pub value: String,
    pub label: String,
}

/// Plugin settings configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginSettingsConfig {
    /// Settings schema - map of field name to field definition
    #[serde(default)]
    pub schema: IndexMap<String, SettingField>,
    /// Optional path to custom settings component (relative to plugin root)
    #[serde(default)]
    pub component: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub entry: String,
    /// Whether this is a core plugin bundled with the app.
    /// Only trusted plugins (in ALLOWED_CORE_PLUGINS) can use this flag.
    #[serde(default)]
    pub core: bool,
    #[serde(default)]
    pub overlays: IndexMap<String, OverlayDefinition>,
    #[serde(default)]
    pub provides: Vec<ServiceDefinition>,
    #[serde(default)]
    pub consumes: Vec<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub native: Option<NativeConfig>,
    #[serde(default)]
    pub dev: Option<DevConfig>,
    /// Plugin settings configuration
    #[serde(default)]
    pub settings: Option<PluginSettingsConfig>,
}

/// List of plugin IDs that are allowed to be loaded as core plugins.
/// This prevents third-party plugins from claiming to be core plugins.
pub const ALLOWED_CORE_PLUGINS: &[&str] = &[
    "yaof-core-settings",
    // Add other official core plugins here as needed
];

impl PluginManifest {
    /// Check if this plugin is a valid core plugin.
    /// Returns true only if both the `core` flag is set AND the plugin ID is in the allowlist.
    pub fn is_valid_core_plugin(&self) -> bool {
        self.core && ALLOWED_CORE_PLUGINS.contains(&self.id.as_str())
    }
}

impl PluginManifest {
    pub fn from_json(json: &str) -> Result<Self, Error> {
        serde_json::from_str(json).map_err(|e| Error::ManifestParse(e.to_string()))
    }

    /// Validate the manifest
    pub fn validate(&self) -> Result<(), Error> {
        if self.id.is_empty() {
            return Err(Error::ManifestParse("id is required".to_string()));
        }
        if self.name.is_empty() {
            return Err(Error::ManifestParse("name is required".to_string()));
        }
        if self.version.is_empty() {
            return Err(Error::ManifestParse("version is required".to_string()));
        }
        // Entry is required unless this is a native-only plugin
        if self.entry.is_empty() && self.native.is_none() {
            return Err(Error::ManifestParse(
                "entry is required for non-native plugins".to_string(),
            ));
        }
        // Validate native config if present
        if let Some(ref native) = self.native {
            if !native.supports_current_platform() {
                // This is a warning, not an error - the plugin just won't load on this platform
                eprintln!(
                    "[YAOF] Warning: Plugin {} does not support current platform ({})",
                    self.id,
                    NativeConfig::current_platform()
                );
            }
        }
        Ok(())
    }

    /// Check if this plugin has a native component
    pub fn has_native(&self) -> bool {
        self.native.is_some()
    }

    /// Check if this plugin is native-only (no UI)
    pub fn is_native_only(&self) -> bool {
        self.entry.is_empty() && self.native.is_some()
    }
}
