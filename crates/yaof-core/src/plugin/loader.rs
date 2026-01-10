use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use crate::{Error, manifest::PluginManifest};

#[derive(Debug, Clone)]
pub enum PluginSource {
    Local(PathBuf),
    Git {
        url: String,
        ref_: Option<String>,
    },
    Npm {
        package: String,
        version: Option<String>,
    },
}

#[derive(Debug, Clone)]
pub struct InstalledPlugin {
    pub manifest: PluginManifest,
    pub path: PathBuf,
    pub source: PluginSource,
}

impl InstalledPlugin {
    /// Get the absolute path to the native library for the current platform
    pub fn native_library_path(&self) -> Option<PathBuf> {
        let native_config = self.manifest.native.as_ref()?;

        // Get the relative library path for the current platform
        let relative_path = native_config.library_for_current_platform()?;

        // Resolve to absolute path relative to plugin directory
        let absolute_path = self.path.join(relative_path);

        // Check if the library exists
        if absolute_path.exists() {
            Some(absolute_path)
        } else {
            eprintln!(
                "[YAOF] Warning: Native library not found at {:?} for plugin {}",
                absolute_path, self.manifest.id
            );
            None
        }
    }

    /// Check if this plugin has a native component that can be loaded on this platform
    pub fn can_load_native(&self) -> bool {
        self.manifest.native.as_ref().map_or(false, |native| {
            native.supports_current_platform() && self.native_library_path().is_some()
        })
    }

    /// Check if this plugin is native-only (no UI)
    pub fn is_native_only(&self) -> bool {
        self.manifest.is_native_only()
    }

    /// Check if this plugin has a UI component
    pub fn has_ui(&self) -> bool {
        !self.manifest.entry.is_empty()
    }
}

pub struct PluginLoader {
    plugins_dir: PathBuf,
    installed: HashMap<String, InstalledPlugin>,
}

impl PluginLoader {
    pub fn new(plugins_dir: PathBuf) -> Self {
        Self {
            plugins_dir,
            installed: HashMap::new(),
        }
    }

    pub fn with_default_dir() -> Result<Self, Error> {
        let home = dirs::home_dir().ok_or_else(|| {
            Error::IoError(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Could not find home directory",
            ))
        })?;
        let plugins_dir = home.join(".yaof").join("plugins");

        // Create the directory if it doesn't exist
        fs::create_dir_all(&plugins_dir)?;

        Ok(Self::new(plugins_dir))
    }

    pub fn scan_plugins(&mut self) -> Result<Vec<PluginManifest>, Error> {
        let mut manifests = Vec::new();
        self.installed.clear();

        if !self.plugins_dir.exists() {
            return Ok(manifests);
        }

        for entry in fs::read_dir(&self.plugins_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_dir() {
                match self.load_manifest(&path) {
                    Ok(manifest) => {
                        let id = manifest.id.clone();
                        self.installed.insert(
                            id,
                            InstalledPlugin {
                                manifest: manifest.clone(),
                                path: path.clone(),
                                source: PluginSource::Local(path),
                            },
                        );
                        manifests.push(manifest);
                    }
                    Err(e) => {
                        eprintln!("Warning: Failed to load plugin at {:?}: {}", path, e);
                    }
                }
            }
        }

        Ok(manifests)
    }

    pub fn load_manifest(&self, plugin_dir: &Path) -> Result<PluginManifest, Error> {
        let manifest_path = plugin_dir.join("overlay.json");
        let content = fs::read_to_string(&manifest_path)?;
        let manifest = PluginManifest::from_json(&content)?;
        manifest.validate()?;
        Ok(manifest)
    }

    pub fn get_plugin(&self, id: &str) -> Option<&InstalledPlugin> {
        self.installed.get(id)
    }

    pub fn list_plugins(&self) -> Vec<&InstalledPlugin> {
        self.installed.values().collect()
    }

    pub fn install_local(
        &mut self,
        source_path: &Path,
        symlink: bool,
    ) -> Result<PluginManifest, Error> {
        // Load and validate manifest from source
        let manifest = self.load_manifest(source_path)?;
        let dest_path = self.plugins_dir.join(&manifest.id);

        // Remove existing installation if present
        if dest_path.exists() {
            fs::remove_dir_all(&dest_path)?;
        }

        if symlink {
            // Create symlink for development
            #[cfg(unix)]
            std::os::unix::fs::symlink(source_path, &dest_path)?;
            #[cfg(windows)]
            std::os::windows::fs::symlink_dir(source_path, &dest_path)?;
        } else {
            // Copy files for production install
            copy_dir_recursive(source_path, &dest_path)?;
        }

        // Add to installed map
        self.installed.insert(
            manifest.id.clone(),
            InstalledPlugin {
                manifest: manifest.clone(),
                path: dest_path,
                source: PluginSource::Local(source_path.to_path_buf()),
            },
        );

        Ok(manifest)
    }

    pub fn uninstall(&mut self, plugin_id: &str) -> Result<(), Error> {
        let plugin = self
            .installed
            .remove(plugin_id)
            .ok_or_else(|| Error::PluginNotFound(plugin_id.to_string()))?;

        if plugin.path.exists() {
            fs::remove_dir_all(&plugin.path)?;
        }

        Ok(())
    }

    /// Get the plugins directory path
    pub fn plugins_dir(&self) -> &Path {
        &self.plugins_dir
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), Error> {
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
