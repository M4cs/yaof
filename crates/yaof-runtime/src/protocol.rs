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

    println!("[Protocol] Handling request: {}", url_str);

    // Parse the URL: yaof-plugin://plugin-id/path/to/file
    // The host is the plugin ID, the path is the file path within dist/
    let host = uri.host().unwrap_or("");
    let path = uri.path();

    println!(
        "[Protocol] Parsed - host (plugin_id): '{}', path: '{}'",
        host, path
    );

    // Security check: validate plugin ID (host) doesn't contain path traversal
    if !is_safe_path_component(host) {
        println!("[Protocol] ERROR: Invalid plugin ID (path traversal detected)");
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

    println!("[Protocol] Resolved file_path: '{}'", file_path);

    // Security check: validate file path doesn't contain path traversal
    // Check each component of the path to prevent "../" attacks
    for component in file_path.split('/') {
        if !component.is_empty() && !is_safe_path_component(component) {
            println!(
                "[Protocol] ERROR: Invalid file path component: '{}'",
                component
            );
            return Response::builder()
                .status(StatusCode::FORBIDDEN)
                .header("Content-Type", "text/plain")
                .body("Invalid file path".as_bytes().to_vec())
                .unwrap();
        }
    }

    // Build the full filesystem path
    let plugins_dir = match get_plugins_dir() {
        Some(dir) => {
            println!("[Protocol] Plugins directory: {:?}", dir);
            dir
        }
        None => {
            println!("[Protocol] ERROR: Failed to determine plugins directory");
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
    println!("[Protocol] Plugin directory: {:?}", plugin_dir);

    // Check if the plugin directory exists (could be a symlink)
    if !plugin_dir.exists() {
        println!(
            "[Protocol] ERROR: Plugin directory does not exist: {:?}",
            plugin_dir
        );
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header("Content-Type", "text/plain")
            .body(format!("Plugin not found: {}", host).as_bytes().to_vec())
            .unwrap();
    }
    println!("[Protocol] Plugin directory exists: true");

    let full_path = plugin_dir.join("dist").join(file_path);
    println!("[Protocol] Full file path: {:?}", full_path);
    println!("[Protocol] Full file path exists: {}", full_path.exists());

    // Canonicalize to resolve symlinks and get the actual file path
    let canonical_file = match full_path.canonicalize() {
        Ok(p) => {
            println!("[Protocol] Canonical file path: {:?}", p);
            p
        }
        Err(e) => {
            println!(
                "[Protocol] ERROR: Failed to canonicalize file path: {} ({})",
                full_path.display(),
                e
            );
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
    let dist_path = plugin_dir.join("dist");
    println!("[Protocol] Dist directory: {:?}", dist_path);
    println!("[Protocol] Dist directory exists: {}", dist_path.exists());

    let canonical_plugin_dist = match dist_path.canonicalize() {
        Ok(p) => {
            println!("[Protocol] Canonical dist path: {:?}", p);
            p
        }
        Err(e) => {
            println!(
                "[Protocol] ERROR: Plugin dist directory not found: {:?} ({})",
                dist_path, e
            );
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
        println!(
            "[Protocol] ERROR: File is outside plugin dist directory (path traversal attempt)"
        );
        return Response::builder()
            .status(StatusCode::FORBIDDEN)
            .header("Content-Type", "text/plain")
            .body("Access denied".as_bytes().to_vec())
            .unwrap();
    }

    // Read the file
    println!("[Protocol] Reading file: {:?}", canonical_file);
    match std::fs::read(&canonical_file) {
        Ok(content) => {
            let mime_type = get_mime_type(file_path);
            println!(
                "[Protocol] SUCCESS: Serving file ({} bytes, mime: {})",
                content.len(),
                mime_type
            );
            Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", mime_type)
                .header("Access-Control-Allow-Origin", "*")
                .body(content)
                .unwrap()
        }
        Err(e) => {
            println!(
                "[Protocol] ERROR: Failed to read file: {:?} ({})",
                canonical_file, e
            );
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
