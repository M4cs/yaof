use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;

fn main() {
    // Tell Cargo to rerun if plugins change
    println!("cargo:rerun-if-changed=../../plugins/core-settings/");

    // Get the manifest directory (where Cargo.toml is)
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let manifest_path = Path::new(&manifest_dir);

    // Define core plugins to embed
    let core_plugins = ["core-settings"];

    // Create embedded-plugins directory in the crate
    let embedded_dir = manifest_path.join("embedded-plugins");
    if embedded_dir.exists() {
        fs::remove_dir_all(&embedded_dir).expect("Failed to clean embedded-plugins directory");
    }
    fs::create_dir_all(&embedded_dir).expect("Failed to create embedded-plugins directory");

    // Build and copy each core plugin
    for plugin in &core_plugins {
        let plugin_path = manifest_path.join("../../plugins").join(plugin);
        let plugin_path = plugin_path
            .canonicalize()
            .expect("Failed to find plugin path");

        println!("cargo:warning=Building core plugin: {}", plugin);

        // Run bun build for the plugin
        let status = Command::new("bun")
            .args(["run", "build"])
            .current_dir(&plugin_path)
            .status()
            .expect("Failed to run bun build");

        if !status.success() {
            panic!("Failed to build plugin: {}", plugin);
        }

        // Create destination directory
        let dest_dir = embedded_dir.join(plugin);
        fs::create_dir_all(&dest_dir).expect("Failed to create plugin destination directory");

        // Copy dist folder
        let dist_src = plugin_path.join("dist");
        let dist_dest = dest_dir.join("dist");
        copy_dir_recursive(&dist_src, &dist_dest).expect("Failed to copy dist folder");

        // Copy overlay.json
        let manifest_src = plugin_path.join("overlay.json");
        let manifest_dest = dest_dir.join("overlay.json");
        fs::copy(&manifest_src, &manifest_dest).expect("Failed to copy overlay.json");

        println!(
            "cargo:warning=Embedded plugin: {} -> {:?}",
            plugin, dest_dir
        );
    }

    tauri_build::build();
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !src.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Source directory does not exist: {:?}", src),
        ));
    }

    fs::create_dir_all(dst)?;

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}
