use std::io;

use thiserror::Error;

#[derive(Error, Debug)]
pub enum Error {
    #[error("Failed to create window {0}")]
    WindowCreation(String),
    #[error("Window {0} not found")]
    WindowNotFound(String),
    #[error("Plugin not found")]
    PluginNotFound(String),
    #[error("Failed to parse manifest: {0}")]
    ManifestParse(String),
    #[error("Tauri error: {0}")]
    TauriError(#[from] tauri::Error),
    #[error("IO error: {0}")]
    IoError(#[from] io::Error),
}
