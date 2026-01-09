use rust_embed::RustEmbed;

/// Embedded core plugins that are bundled with the YAOF runtime.
/// These are built during the cargo build process and embedded into the binary.
#[derive(RustEmbed)]
#[folder = "embedded-plugins"]
pub struct EmbeddedPlugins;

impl EmbeddedPlugins {
    /// Get a list of all embedded plugin IDs
    pub fn list_plugins() -> Vec<String> {
        let mut plugins = std::collections::HashSet::new();

        for file in Self::iter() {
            // Extract plugin ID from path like "core-settings/overlay.json"
            if let Some(plugin_id) = file.split('/').next() {
                plugins.insert(plugin_id.to_string());
            }
        }

        plugins.into_iter().collect()
    }
}
