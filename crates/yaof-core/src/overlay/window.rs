use serde::{Deserialize, Serialize};
use tauri::WebviewWindow;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OverlayConfig {
    pub id: String,
    pub plugin_id: String,
    pub entry_point: String,
    pub width: f64,
    pub height: f64,
    pub x: f64,
    pub y: f64,
    pub click_through: bool,
    pub frameless: bool,
}

pub struct OverlayWindow {
    pub window: WebviewWindow,
    pub plugin_id: String,
    pub config: OverlayConfig,
}
