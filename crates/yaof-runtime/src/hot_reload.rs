//! Hot reload support for development mode.
//!
//! This module watches plugin dist/ directories for changes and automatically
//! reloads the affected overlay webviews when files are modified.
//!
//! Only active when YAOF_DEV=1 environment variable is set.

use notify_debouncer_mini::{DebouncedEventKind, new_debouncer, notify::RecursiveMode};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc::channel;
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};

/// Check if we're running in development mode
pub fn is_dev_mode() -> bool {
    std::env::var("YAOF_DEV").map(|v| v == "1").unwrap_or(false)
}

/// Get the plugins directory path
fn get_plugins_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".yaof").join("plugins"))
}

/// Discover all plugins and resolve their actual paths (following symlinks).
/// Returns a HashMap of resolved_dist_path -> plugin_id
fn discover_plugin_paths(plugins_dir: &std::path::Path) -> HashMap<PathBuf, String> {
    let mut path_to_plugin: HashMap<PathBuf, String> = HashMap::new();

    if let Ok(entries) = std::fs::read_dir(plugins_dir) {
        for entry in entries.flatten() {
            let path = entry.path();

            // Skip non-directories and hidden files
            if !path.is_dir()
                || path
                    .file_name()
                    .map(|n| n.to_string_lossy().starts_with('.'))
                    .unwrap_or(true)
            {
                continue;
            }

            // Get the plugin ID from the directory name
            let plugin_id = match path.file_name() {
                Some(name) => name.to_string_lossy().to_string(),
                None => continue,
            };

            // Resolve the actual path (follows symlinks)
            let resolved_path = match path.canonicalize() {
                Ok(p) => p,
                Err(_) => path.clone(),
            };

            // The dist directory we want to watch
            let dist_path = resolved_path.join("dist");

            // Only add if dist directory exists
            if dist_path.exists() {
                println!(
                    "[HotReload] Discovered plugin '{}': {:?}",
                    plugin_id, dist_path
                );
                path_to_plugin.insert(dist_path, plugin_id);
            } else {
                println!(
                    "[HotReload] Plugin '{}' has no dist/ directory yet, will watch parent",
                    plugin_id
                );
                // Watch the plugin directory itself so we catch when dist/ is created
                path_to_plugin.insert(resolved_path, plugin_id);
            }
        }
    }

    path_to_plugin
}

/// Extract plugin ID from a file path using the path-to-plugin mapping
fn extract_plugin_id_from_path(
    path: &std::path::Path,
    path_to_plugin: &HashMap<PathBuf, String>,
) -> Option<String> {
    // Check if the path starts with any of our watched paths
    for (watched_path, plugin_id) in path_to_plugin {
        if path.starts_with(watched_path) {
            return Some(plugin_id.clone());
        }
    }
    None
}

/// Start the hot reload file watcher.
/// This spawns a background thread that watches for file changes in plugin dist/ directories.
pub fn start_hot_reload_watcher<R: Runtime>(app: AppHandle<R>) {
    if !is_dev_mode() {
        return;
    }

    let plugins_dir = match get_plugins_dir() {
        Some(dir) => dir,
        None => {
            eprintln!("[HotReload] Failed to determine plugins directory");
            return;
        }
    };

    if !plugins_dir.exists() {
        eprintln!(
            "[HotReload] Plugins directory does not exist: {:?}",
            plugins_dir
        );
        return;
    }

    println!("[HotReload] Starting file watcher (dev mode)");

    // Spawn the watcher in a separate thread
    std::thread::spawn(move || {
        let (tx, rx) = channel();

        // Create a debounced watcher with 500ms debounce time
        let mut debouncer = match new_debouncer(Duration::from_millis(500), tx) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[HotReload] Failed to create file watcher: {}", e);
                return;
            }
        };

        // Discover all plugins and their resolved paths
        let path_to_plugin = discover_plugin_paths(&plugins_dir);

        if path_to_plugin.is_empty() {
            println!("[HotReload] No plugins found to watch");
            return;
        }

        // Watch each plugin's resolved dist directory individually
        for (watch_path, plugin_id) in &path_to_plugin {
            match debouncer
                .watcher()
                .watch(watch_path, RecursiveMode::Recursive)
            {
                Ok(_) => {
                    println!(
                        "[HotReload] Watching plugin '{}' at {:?}",
                        plugin_id, watch_path
                    );
                }
                Err(e) => {
                    eprintln!(
                        "[HotReload] Failed to watch plugin '{}' at {:?}: {}",
                        plugin_id, watch_path, e
                    );
                }
            }
        }

        println!(
            "[HotReload] File watcher started, monitoring {} plugin(s)",
            path_to_plugin.len()
        );

        // Process file change events
        loop {
            match rx.recv() {
                Ok(Ok(events)) => {
                    // Collect unique plugin IDs that had changes
                    let mut changed_plugins: std::collections::HashSet<String> =
                        std::collections::HashSet::new();

                    for event in events {
                        // Only process write/create events
                        if event.kind != DebouncedEventKind::Any {
                            continue;
                        }

                        let path = &event.path;

                        // Check if this is a file in a dist/ directory
                        let path_str = path.to_string_lossy();
                        if !path_str.contains("/dist/") && !path_str.ends_with("/dist") {
                            continue;
                        }

                        // Extract the plugin ID using our mapping
                        if let Some(plugin_id) = extract_plugin_id_from_path(path, &path_to_plugin)
                        {
                            changed_plugins.insert(plugin_id);
                        }
                    }

                    // Reload overlays for each changed plugin
                    for plugin_id in changed_plugins {
                        println!("[HotReload] Detected changes in plugin: {}", plugin_id);
                        reload_plugin_overlays(&app, &plugin_id);
                    }
                }
                Ok(Err(e)) => {
                    eprintln!("[HotReload] Watch error: {:?}", e);
                }
                Err(e) => {
                    eprintln!("[HotReload] Channel error: {:?}", e);
                    break;
                }
            }
        }
    });
}

/// Reload all overlay webviews for a specific plugin
fn reload_plugin_overlays<R: Runtime>(app: &AppHandle<R>, plugin_id: &str) {
    // Get all windows and find ones that belong to this plugin
    // Window labels for plugin overlays typically include the plugin ID
    for (label, window) in app.webview_windows() {
        // Check if this window's URL contains the plugin ID
        // The URL format is: yaof-plugin://{plugin-id}/...
        if let Ok(url) = window.url() {
            let url_str = url.to_string();
            if url_str.contains(&format!("yaof-plugin://{}/", plugin_id))
                || url_str.contains(&format!("yaof-plugin://{}", plugin_id))
            {
                println!("[HotReload] Reloading overlay: {}", label);

                // Execute JavaScript to reload the page
                if let Err(e) = window.eval("location.reload()") {
                    eprintln!("[HotReload] Failed to reload {}: {}", label, e);
                }
            }
        }
    }
}
