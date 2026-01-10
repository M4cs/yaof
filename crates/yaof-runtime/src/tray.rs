use tauri::{
    App, Manager, Runtime, WebviewUrl, WebviewWindowBuilder,
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    tray::{TrayIconBuilder, TrayIconEvent},
};

const TRAY_ICON: &[u8] = include_bytes!("../icons/32x32.png");

pub fn setup_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    // Build menu items
    let show_all = MenuItemBuilder::with_id("show_all", "Show All Overlays").build(app)?;
    let hide_all = MenuItemBuilder::with_id("hide_all", "Hide All Overlays").build(app)?;
    let separator1 = PredefinedMenuItem::separator(app)?;

    // Plugins submenu
    let plugins_submenu = SubmenuBuilder::new(app, "Plugins")
        .item(&MenuItemBuilder::with_id("plugins_manage", "Manage Plugins...").build(app)?)
        .build()?;

    let separator2 = PredefinedMenuItem::separator(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings...").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit YAOF").build(app)?;

    // Build the menu
    let menu = MenuBuilder::new(app)
        .item(&show_all)
        .item(&hide_all)
        .item(&separator1)
        .item(&plugins_submenu)
        .item(&separator2)
        .item(&settings)
        .item(&quit)
        .build()?;

    // Load tray icon
    let icon = Image::from_bytes(TRAY_ICON)?;

    // Create tray
    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("YAOF - Yet Another Overlay Framework")
        .on_menu_event(|app, event| {
            handle_menu_event(app, event.id.as_ref());
        })
        .on_tray_icon_event(|tray, event| {
            // Double-click opens settings
            if let TrayIconEvent::DoubleClick { .. } = event {
                let _ = open_settings_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Opens the settings window, or focuses it if already open
pub fn open_settings_window<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), tauri::Error> {
    // Check if settings window already exists
    if let Some(window) = app.get_webview_window("settings") {
        // Window exists - show and focus it
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }

    // Create new settings window
    let _window = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("index.html".into()))
        .title("YAOF Settings")
        .inner_size(900.0, 650.0)
        .min_inner_size(700.0, 500.0)
        .center()
        .decorations(true)
        .resizable(true)
        .visible(true)
        .build()?;

    Ok(())
}

fn handle_menu_event<R: Runtime>(app: &tauri::AppHandle<R>, id: &str) {
    match id {
        "show_all" => {
            // Show all overlay windows (except settings)
            for (label, window) in app.webview_windows() {
                if label != "settings" {
                    let _ = window.show();
                }
            }
        }
        "hide_all" => {
            // Hide all overlay windows (except settings)
            for (label, window) in app.webview_windows() {
                if label != "settings" {
                    let _ = window.hide();
                }
            }
        }
        "plugins_manage" | "settings" => {
            if let Err(e) = open_settings_window(app) {
                eprintln!("Failed to open settings window: {:?}", e);
            }
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
}
