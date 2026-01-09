use std::sync::Mutex;
use tauri::{AppHandle, State, WebviewWindow, command};

use crate::{
    loader::PluginLoader,
    manifest::PluginManifest,
    overlay::{OverlayConfig, manager::OverlayManager},
};

pub struct OverlayState(pub Mutex<OverlayManager>);
pub struct PluginState(pub Mutex<PluginLoader>);

#[command]
pub fn spawn_overlay(
    state: State<'_, OverlayState>,
    config: OverlayConfig,
) -> Result<String, String> {
    let mut manager = state.0.lock().map_err(|e| e.to_string())?;
    manager.spawn_overlay(config).map_err(|e| e.to_string())
}

#[command]
pub fn close_overlay(state: State<'_, OverlayState>, id: String) -> Result<(), String> {
    let mut manager = state.0.lock().map_err(|e| e.to_string())?;
    manager.close_overlay(&id).map_err(|e| e.to_string())
}

#[command]
pub fn overlay_set_click_through(
    state: State<'_, OverlayState>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    let manager = state.0.lock().map_err(|e| e.to_string())?;
    manager
        .set_click_through(&id, enabled)
        .map_err(|e| e.to_string())
}

#[command]
pub fn overlay_update_geometry(
    state: State<'_, OverlayState>,
    id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let mut manager = state.0.lock().map_err(|e| e.to_string())?;
    manager
        .update_overlay_geometry(&id, x, y, width, height)
        .map_err(|e| e.to_string())
}

#[command]
pub fn overlay_set_always_on_top(
    state: State<'_, OverlayState>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    let manager = state.0.lock().map_err(|e| e.to_string())?;
    manager
        .set_always_on_top(&id, enabled)
        .map_err(|e| e.to_string())
}

#[command]
pub fn overlay_exists(state: State<'_, OverlayState>, id: String) -> Result<bool, String> {
    let manager = state.0.lock().map_err(|e| e.to_string())?;
    Ok(manager.has_overlay(&id))
}

#[command]
pub fn overlay_set_visible(
    state: State<'_, OverlayState>,
    id: String,
    visible: bool,
) -> Result<(), String> {
    let manager = state.0.lock().map_err(|e| e.to_string())?;
    manager.set_visible(&id, visible).map_err(|e| e.to_string())
}

#[command]
pub fn list_overlays(state: State<'_, OverlayState>) -> Result<Vec<String>, String> {
    let manager = state.0.lock().map_err(|e| e.to_string())?;
    Ok(manager
        .list_overlays()
        .iter()
        .map(|o| o.config.id.clone())
        .collect())
}

#[command]
pub fn service_register(
    state: State<'_, OverlayState>,
    service_id: String,
    plugin_id: String,
    schema: serde_json::Value,
) -> Result<(), String> {
    let mut manager = state.0.lock().map_err(|e| e.to_string())?;
    manager
        .registry_mut()
        .register_provider(service_id, plugin_id, schema)
}

#[command]
pub fn service_list_providers(
    state: State<'_, OverlayState>,
) -> Result<Vec<crate::ProviderInfo>, String> {
    let manager = state.0.lock().map_err(|e| e.to_string())?;
    Ok(manager.registry().list_providers())
}

#[command]
pub fn plugin_list(state: State<'_, PluginState>) -> Result<Vec<PluginManifest>, String> {
    let mut loader = state.0.lock().map_err(|e| e.to_string())?;
    loader.scan_plugins().map_err(|e| e.to_string())
}

#[command]
pub fn plugin_get(
    state: State<'_, PluginState>,
    id: String,
) -> Result<Option<PluginManifest>, String> {
    let loader = state.0.lock().map_err(|e| e.to_string())?;
    Ok(loader.get_plugin(&id).map(|p| p.manifest.clone()))
}

#[command]
pub fn plugin_install_local(
    state: State<'_, PluginState>,
    path: String,
    symlink: bool,
) -> Result<PluginManifest, String> {
    let mut loader = state.0.lock().map_err(|e| e.to_string())?;
    loader
        .install_local(std::path::Path::new(&path), symlink)
        .map_err(|e| e.to_string())
}

#[command]
pub fn plugin_uninstall(state: State<'_, PluginState>, id: String) -> Result<(), String> {
    let mut loader = state.0.lock().map_err(|e| e.to_string())?;
    loader.uninstall(&id).map_err(|e| e.to_string())
}

#[command]
pub fn service_subscribe(
    state: State<'_, OverlayState>,
    window: WebviewWindow,
    provider_id: String,
) -> Result<(), String> {
    let mut manager = state.0.lock().map_err(|e| e.to_string())?;
    manager
        .registry_mut()
        .subscribe(&provider_id, window.label())
}

#[command]
pub fn service_unsubscribe(
    state: State<'_, OverlayState>,
    window: WebviewWindow,
    provider_id: String,
) -> Result<(), String> {
    let mut manager = state.0.lock().map_err(|e| e.to_string())?;
    manager
        .registry_mut()
        .unsubscribe(&provider_id, window.label());
    Ok(())
}

#[command]
pub fn service_unregister(
    state: State<'_, OverlayState>,
    service_id: String,
) -> Result<(), String> {
    let mut manager = state.0.lock().map_err(|e| e.to_string())?;
    manager.registry_mut().unregister_provider(&service_id);
    Ok(())
}

#[command]
pub fn service_broadcast(
    state: State<'_, OverlayState>,
    app: AppHandle,
    service_id: String,
    data: serde_json::Value,
) -> Result<(), String> {
    let manager = state.0.lock().map_err(|e| e.to_string())?;
    manager.registry().broadcast(&service_id, data, &app)
}

// ============================================
// Plugin Settings Commands
// ============================================

#[command]
pub fn plugin_settings_get(
    app: AppHandle,
    plugin_id: String,
    key: String,
) -> Result<Option<serde_json::Value>, String> {
    use tauri_plugin_store::StoreExt;

    let store_path = format!("{}-settings.json", plugin_id);
    let store = app.store(&store_path).map_err(|e| e.to_string())?;

    Ok(store.get(&key))
}

#[command]
pub fn plugin_settings_set(
    app: AppHandle,
    plugin_id: String,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;

    let store_path = format!("{}-settings.json", plugin_id);
    let store = app.store(&store_path).map_err(|e| e.to_string())?;

    store.set(&key, value);
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub fn plugin_settings_get_all(
    app: AppHandle,
    plugin_id: String,
) -> Result<serde_json::Value, String> {
    use tauri_plugin_store::StoreExt;

    let store_path = format!("{}-settings.json", plugin_id);
    let store = app.store(&store_path).map_err(|e| e.to_string())?;

    // Get all keys and values
    let mut result = serde_json::Map::new();
    for key in store.keys() {
        if let Some(value) = store.get(&key) {
            result.insert(key.clone(), value);
        }
    }

    Ok(serde_json::Value::Object(result))
}

#[command]
pub fn plugin_settings_set_all(
    app: AppHandle,
    plugin_id: String,
    values: serde_json::Value,
) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;

    let store_path = format!("{}-settings.json", plugin_id);
    let store = app.store(&store_path).map_err(|e| e.to_string())?;

    if let serde_json::Value::Object(map) = values {
        for (key, value) in map {
            store.set(&key, value);
        }
        store.save().map_err(|e| e.to_string())?;
    } else {
        return Err("values must be an object".to_string());
    }

    Ok(())
}

#[command]
pub fn plugin_settings_delete(
    app: AppHandle,
    plugin_id: String,
    key: String,
) -> Result<bool, String> {
    use tauri_plugin_store::StoreExt;

    let store_path = format!("{}-settings.json", plugin_id);
    let store = app.store(&store_path).map_err(|e| e.to_string())?;

    let existed = store.delete(&key);
    store.save().map_err(|e| e.to_string())?;

    Ok(existed)
}

#[command]
pub fn plugin_settings_clear(app: AppHandle, plugin_id: String) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;

    let store_path = format!("{}-settings.json", plugin_id);
    let store = app.store(&store_path).map_err(|e| e.to_string())?;

    store.clear();
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}

// ============================================
// Native Plugin Commands
// ============================================

use crate::NativePluginState;

/// Serializable native plugin info for frontend
#[derive(serde::Serialize)]
pub struct NativePluginInfoResponse {
    pub id: String,
    pub path: String,
    pub tick_interval_ms: u64,
}

#[command]
pub async fn native_plugin_list(
    state: State<'_, NativePluginState>,
) -> Result<Vec<NativePluginInfoResponse>, String> {
    let manager = state.0.read().await;
    let plugins = manager
        .list_plugins()
        .iter()
        .map(|p| NativePluginInfoResponse {
            id: p.id.clone(),
            path: p.path.to_string_lossy().to_string(),
            tick_interval_ms: p.tick_interval_ms,
        })
        .collect();
    Ok(plugins)
}

#[command]
pub async fn native_plugin_load(
    state: State<'_, NativePluginState>,
    path: String,
) -> Result<String, String> {
    let mut manager = state.0.write().await;
    manager
        .load_plugin(std::path::Path::new(&path))
        .map_err(|e| e.to_string())
}

#[command]
pub async fn native_plugin_unload(
    state: State<'_, NativePluginState>,
    plugin_id: String,
) -> Result<(), String> {
    let mut manager = state.0.write().await;
    manager.unload_plugin(&plugin_id).map_err(|e| e.to_string())
}
