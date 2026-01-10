const COMMANDS: &[&str] = &[
    "spawn_overlay",
    "close_overlay",
    "overlay_set_click_through",
    "list_overlays",
    "service_register",
    "service_unregister",
    "service_list_providers",
    "service_subscribe",
    "service_unsubscribe",
    "service_broadcast",
    "plugin_list",
    "plugin_get",
    "plugin_install_local",
    "plugin_uninstall",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
