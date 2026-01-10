//! Custom protocol handler for serving plugin assets.
//!
//! This module registers a `yaof-plugin://` protocol that maps to plugin files
//! in the ~/.yaof/plugins/ directory.
//!
//! URL format: yaof-plugin://{plugin-id}/{path}
//! Example: yaof-plugin://topbar/index.html -> ~/.yaof/plugins/topbar/dist/index.html

use std::path::PathBuf;
use tauri::{
    AppHandle, Runtime,
    http::{Request, Response, StatusCode},
};

/// The custom protocol scheme for plugin assets
pub const PLUGIN_PROTOCOL: &str = "yaof-plugin";

/// Get the plugins directory path
fn get_plugins_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".yaof").join("plugins"))
}

/// Determine MIME type from file extension
fn get_mime_type(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("");
    match ext.to_lowercase().as_str() {
        "html" | "htm" => "text/html",
        "js" | "mjs" => "application/javascript",
        "css" => "text/css",
        "json" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "eot" => "application/vnd.ms-fontobject",
        "wasm" => "application/wasm",
        "map" => "application/json",
        _ => "application/octet-stream",
    }
}

/// Check if a path component is safe (no path traversal)
fn is_safe_path_component(component: &str) -> bool {
    !component.is_empty() && component != "." && component != ".."
}

/// Handle a request to the yaof-plugin:// protocol
pub fn handle_plugin_protocol<R: Runtime>(
    _app: &AppHandle<R>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let uri = request.uri();
    let url_str = uri.to_string();

    // Parse the URL: yaof-plugin://plugin-id/path/to/file
    // The host is the plugin ID, the path is the file path within dist/
    let host = uri.host().unwrap_or("");
    let path = uri.path();

    // Security check: validate plugin ID (host) doesn't contain path traversal
    if !is_safe_path_component(host) {
        return Response::builder()
            .status(StatusCode::FORBIDDEN)
            .header("Content-Type", "text/plain")
            .body("Invalid plugin ID".as_bytes().to_vec())
            .unwrap();
    }

    // Remove leading slash from path
    let file_path = path.strip_prefix('/').unwrap_or(path);

    // Default to index.html if path is empty
    let file_path = if file_path.is_empty() {
        "index.html"
    } else {
        file_path
    };

    // Security check: validate file path doesn't contain path traversal
    // Check each component of the path to prevent "../" attacks
    for component in file_path.split('/') {
        if !component.is_empty() && !is_safe_path_component(component) {
            return Response::builder()
                .status(StatusCode::FORBIDDEN)
                .header("Content-Type", "text/plain")
                .body("Invalid file path".as_bytes().to_vec())
                .unwrap();
        }
    }

    // Build the full filesystem path
    let plugins_dir = match get_plugins_dir() {
        Some(dir) => dir,
        None => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .header("Content-Type", "text/plain")
                .body("Failed to determine plugins directory".as_bytes().to_vec())
                .unwrap();
        }
    };

    // The file is in: ~/.yaof/plugins/{plugin-id}/dist/{file_path}
    // The plugin directory might be a symlink (for development), so we need to
    // check that the plugin exists first, then resolve the full path
    let plugin_dir = plugins_dir.join(host);

    // Check if the plugin directory exists (could be a symlink)
    if !plugin_dir.exists() {
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header("Content-Type", "text/plain")
            .body(format!("Plugin not found: {}", host).as_bytes().to_vec())
            .unwrap();
    }

    let full_path = plugin_dir.join("dist").join(file_path);

    // Canonicalize to resolve symlinks and get the actual file path
    let canonical_file = match full_path.canonicalize() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[Protocol] File not found: {} ({})", full_path.display(), e);
            return Response::builder()
                .status(StatusCode::NOT_FOUND)
                .header("Content-Type", "text/plain")
                .body(format!("File not found: {}", url_str).as_bytes().to_vec())
                .unwrap();
        }
    };

    // For symlinked plugins, we need to verify the file is within the resolved plugin directory
    // This allows symlinks while still preventing path traversal within the plugin
    let canonical_plugin_dist = match plugin_dir.join("dist").canonicalize() {
        Ok(p) => p,
        Err(_) => {
            return Response::builder()
                .status(StatusCode::NOT_FOUND)
                .header("Content-Type", "text/plain")
                .body(
                    format!("Plugin dist directory not found: {}", host)
                        .as_bytes()
                        .to_vec(),
                )
                .unwrap();
        }
    };

    // Ensure the file is within the plugin's dist directory (prevent path traversal)
    if !canonical_file.starts_with(&canonical_plugin_dist) {
        return Response::builder()
            .status(StatusCode::FORBIDDEN)
            .header("Content-Type", "text/plain")
            .body("Access denied".as_bytes().to_vec())
            .unwrap();
    }

    // Read the file
    match std::fs::read(&canonical_file) {
        Ok(content) => {
            let mime_type = get_mime_type(file_path);
            Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", mime_type)
                .header("Access-Control-Allow-Origin", "*")
                .body(content)
                .unwrap()
        }
        Err(e) => {
            eprintln!(
                "[Protocol] Failed to read file: {} ({})",
                canonical_file.display(),
                e
            );
            Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .header("Content-Type", "text/plain")
                .body(format!("Failed to read file: {}", e).as_bytes().to_vec())
                .unwrap()
        }
    }
}
