mod embedded;
mod hot_reload;
mod protocol;
mod tray;

use std::path::Path;
use std::{fs, io};

use tauri::{Manager, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use tauri::AppHandle;

pub use embedded::EmbeddedPlugins;
pub use protocol::PLUGIN_PROTOCOL;

/// Helper function to spawn enabled overlays
async fn spawn_overlays(app_handle: &AppHandle) {
    println!("[YAOF] Spawning enabled overlays...");
    match yaof_core::AutostartManager::spawn_enabled_overlays(app_handle) {
        Ok(spawned) => {
            if !spawned.is_empty() {
                println!("[YAOF] Auto-started {} overlay(s)", spawned.len());
            }
        }
        Err(e) => {
            eprintln!("[YAOF] Failed to auto-start overlays: {}", e);
        }
    }
}

/// Extract embedded core plugins to the plugins directory.
/// This is called on first run or when plugins need to be updated.
pub fn extract_embedded_plugins(plugins_dir: &Path) -> io::Result<()> {
    // Ensure plugins directory exists
    fs::create_dir_all(plugins_dir)?;

    for file_path in EmbeddedPlugins::iter() {
        let file_path_str = file_path.as_ref();

        // Get the embedded file content
        if let Some(content) = EmbeddedPlugins::get(file_path_str) {
            let dest_path = plugins_dir.join(file_path_str);

            // Create parent directories if needed
            if let Some(parent) = dest_path.parent() {
                fs::create_dir_all(parent)?;
            }

            // Write the file
            fs::write(&dest_path, content.data.as_ref())?;
        }
    }

    Ok(())
}

/// Check if embedded plugins need to be extracted (first run or version mismatch)
pub fn should_extract_plugins(plugins_dir: &Path) -> bool {
    // For now, always extract if the core-settings plugin doesn't exist
    // In the future, we could check version numbers
    !plugins_dir
        .join("core-settings")
        .join("overlay.json")
        .exists()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Extract embedded plugins on startup if needed
    if let Some(home) = dirs::home_dir() {
        let plugins_dir = home.join(".yaof").join("plugins");

        if should_extract_plugins(&plugins_dir) {
            println!("Extracting embedded plugins to {:?}", plugins_dir);
            if let Err(e) = extract_embedded_plugins(&plugins_dir) {
                eprintln!("Warning: Failed to extract embedded plugins: {}", e);
            } else {
                println!("Successfully extracted embedded plugins");
            }
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .register_asynchronous_uri_scheme_protocol(
            protocol::PLUGIN_PROTOCOL,
            |ctx, request, responder| {
                let response = protocol::handle_plugin_protocol(ctx.app_handle(), request);
                responder.respond(response);
            },
        )
        .plugin(yaof_core::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            tray::setup_tray(app)?;

            // Start hot reload watcher in dev mode
            hot_reload::start_hot_reload_watcher(app.handle().clone());

            // Initialize and start services, then spawn overlays
            // The yaof_core plugin already initializes the native plugin manager and system services
            // We just need to:
            // 1. Load native plugins from installed plugins (in addition to standalone ones)
            // 2. Wait for services to be ready
            // 3. Spawn overlays
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Step 1: Load native plugins from installed plugins
                // This supplements the standalone native plugins already loaded by yaof_core
                println!("[YAOF] Loading native plugins from installed plugins...");

                let native_state = app_handle.state::<yaof_core::NativePluginState>();
                let plugin_state = app_handle.state::<yaof_core::PluginState>();

                // Load native components from installed plugins
                // Note: We need to be careful not to hold the MutexGuard across await points
                let load_result = {
                    let mut native_manager = native_state.0.write().await;

                    // Try to lock the plugin loader - if it fails, we'll skip native loading
                    match plugin_state.0.lock() {
                        Ok(mut plugin_loader) => {
                            // Do all the synchronous work here, before any await
                            native_manager.load_from_installed_plugins(&mut plugin_loader)
                        }
                        Err(e) => {
                            eprintln!("[YAOF] Failed to lock plugin loader: {}", e);
                            Ok(vec![]) // Return empty vec to continue
                        }
                    }
                    // MutexGuard is dropped here when the block ends
                };

                // Now we can safely await - no locks are held
                match load_result {
                    Ok(loaded) => {
                        if !loaded.is_empty() {
                            println!(
                                "[YAOF] Loaded {} native plugin(s) from installed: {:?}",
                                loaded.len(),
                                loaded
                            );
                        }
                    }
                    Err(e) => {
                        eprintln!("[YAOF] Failed to load native plugins from installed: {}", e);
                    }
                }

                // Step 2: Wait for services to initialize
                // Give native plugins time to start and emit initial data
                tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

                // Step 3: Spawn enabled overlays
                spawn_overlays(&app_handle).await;
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Only intercept close for the settings window
                if window.label() == "settings" {
                    api.prevent_close();

                    let window_clone = window.clone();
                    window
                        .dialog()
                        .message("What would you like to do?")
                        .title("Close Settings")
                        .kind(MessageDialogKind::Info)
                        .buttons(MessageDialogButtons::OkCancelCustom(
                            "Minimize to Tray".to_string(),
                            "Quit App".to_string(),
                        ))
                        .show(move |result| {
                            match result {
                                true => {
                                    // "Minimize to Tray" was clicked - hide the window
                                    let _ = window_clone.hide();
                                }
                                false => {
                                    // "Quit App" was clicked - exit the application
                                    window_clone.app_handle().exit(0);
                                }
                            }
                        });
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error running YAOF")
}
