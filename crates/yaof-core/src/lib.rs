pub mod autostart;
pub mod commands;
pub mod error;
pub mod overlay;
pub mod plugin;
pub mod services;
pub mod settings;

pub use autostart::*;
pub use commands::*;
pub use error::*;
pub use overlay::*;
pub use plugin::*;
pub use services::*;
pub use settings::*;

use std::sync::{Arc, Mutex};
use tauri::{
    Manager, Wry,
    plugin::{Builder, TauriPlugin},
};

use services::system::{SystemServiceHandle, SystemServiceManager};

/// State wrapper for native plugin manager
pub struct NativePluginState(pub Arc<NativePluginManagerHandle>);

/// State wrapper for system services
pub struct SystemServiceState(pub Arc<SystemServiceHandle>);

pub fn init() -> TauriPlugin<Wry> {
    Builder::<Wry, ()>::new("yaof")
        .invoke_handler(tauri::generate_handler![
            commands::spawn_overlay,
            commands::close_overlay,
            commands::overlay_set_click_through,
            commands::overlay_update_geometry,
            commands::overlay_set_always_on_top,
            commands::overlay_exists,
            commands::overlay_set_visible,
            commands::list_overlays,
            // Service Commands
            commands::service_register,
            commands::service_unregister,
            commands::service_list_providers,
            commands::service_subscribe,
            commands::service_unsubscribe,
            commands::service_broadcast,
            // Plugin Commands
            commands::plugin_list,
            commands::plugin_get,
            commands::plugin_install_local,
            commands::plugin_uninstall,
            // Native Plugin Commands
            commands::native_plugin_list,
            commands::native_plugin_load,
            commands::native_plugin_unload,
            // Plugin Settings Commands
            commands::plugin_settings_get,
            commands::plugin_settings_set,
            commands::plugin_settings_get_all,
            commands::plugin_settings_set_all,
            commands::plugin_settings_delete,
            commands::plugin_settings_clear
        ])
        .setup(|app, _api| {
            let manager = overlay::manager::OverlayManager::new(app.app_handle().clone());
            app.manage(OverlayState(Mutex::new(manager)));

            let loader = PluginLoader::with_default_dir().expect("Failed to create plugin loader");
            app.manage(PluginState(Mutex::new(loader)));

            // Initialize native plugin manager
            let native_manager = NativePluginManager::new(app.app_handle().clone())
                .expect("Failed to create native plugin manager");
            let native_handle = Arc::new(NativePluginManagerHandle::new(native_manager));
            app.manage(NativePluginState(native_handle.clone()));

            // Initialize system services
            let system_manager = SystemServiceManager::new();
            let system_handle = Arc::new(SystemServiceHandle::new(system_manager));
            app.manage(SystemServiceState(system_handle.clone()));

            // Start background tasks
            let app_handle = app.app_handle().clone();
            let app_handle_for_system = app.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                // Small delay to ensure everything is initialized
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                // Discover and load native plugins
                {
                    let mut manager = native_handle.write().await;
                    match manager.discover_and_load() {
                        Ok(loaded) => {
                            if !loaded.is_empty() {
                                println!(
                                    "[YAOF] Loaded {} native plugin(s): {:?}",
                                    loaded.len(),
                                    loaded
                                );
                            }
                        }
                        Err(e) => {
                            eprintln!("[YAOF] Failed to discover native plugins: {}", e);
                        }
                    }
                }

                // Start the native plugin tick loop (1 second interval)
                native_handle.start_tick_loop(1000);
            });

            // Start system services tick loop
            tauri::async_runtime::spawn(async move {
                // Small delay to ensure everything is initialized
                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

                println!("[YAOF] Starting system services...");

                // Start the system services tick loop (1 second interval)
                system_handle.start_tick_loop(app_handle_for_system, 1000);
            });

            Ok(())
        })
        .build()
}
