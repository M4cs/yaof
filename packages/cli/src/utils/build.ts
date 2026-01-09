import fs from "fs-extra";
import { execSync, spawn } from "child_process";
import { join } from "path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { PLUGINS_DIR } from "./paths.js";

interface NativeConfig {
  platforms?: string[];
  libraries?: Record<string, string>;
  library?: string;
}

interface PluginManifest {
  id: string;
  name: string;
  version: string;
  entry: string;
  native?: NativeConfig;
}

// Platform to Rust target mapping
const PLATFORM_TARGETS: Record<string, string> = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "win32-x64": "x86_64-pc-windows-msvc",
};

// Get current platform identifier
function getCurrentPlatform(): string {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "darwin" && arch === "x64") return "darwin-x64";
  if (platform === "linux" && arch === "x64") return "linux-x64";
  if (platform === "win32" && arch === "x64") return "win32-x64";

  return "unknown";
}

// Get platform-specific library name
function getLibraryName(crateName: string, platform: string): string {
  if (platform.startsWith("darwin")) {
    return `lib${crateName}.dylib`;
  } else if (platform.startsWith("linux")) {
    return `lib${crateName}.so`;
  } else if (platform.startsWith("win32")) {
    return `${crateName}.dll`;
  }
  return crateName;
}

/**
 * Check if a plugin needs to be built (has package.json with build script)
 */
export function needsBuild(pluginPath: string): boolean {
  const packageJsonPath = join(pluginPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const packageJson = fs.readJsonSync(packageJsonPath);
    return !!(packageJson.scripts && packageJson.scripts.build);
  } catch {
    return false;
  }
}

/**
 * Check if dependencies need to be installed
 */
export function needsInstall(pluginPath: string): boolean {
  const packageJsonPath = join(pluginPath, "package.json");
  const nodeModulesPath = join(pluginPath, "node_modules");

  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  return !fs.existsSync(nodeModulesPath);
}

/**
 * Resolve the actual path for a plugin (follows symlinks)
 */
export function resolvePluginPath(pluginPath: string): string {
  try {
    const stats = fs.lstatSync(pluginPath);
    if (stats.isSymbolicLink()) {
      return fs.realpathSync(pluginPath);
    }
  } catch {
    // Ignore errors
  }
  return pluginPath;
}

/**
 * Build a single plugin
 */
export async function buildPlugin(
  pluginPath: string,
  options: { silent?: boolean } = {}
): Promise<boolean> {
  // Resolve symlinks to build in the original location
  const actualPath = resolvePluginPath(pluginPath);

  if (!needsBuild(actualPath)) {
    return true; // No build needed, consider it successful
  }

  try {
    // Install dependencies if needed
    if (needsInstall(actualPath)) {
      if (!options.silent) {
        p.log.info(`Installing dependencies...`);
      }
      execSync("bun install", {
        cwd: actualPath,
        stdio: options.silent ? "pipe" : "inherit",
      });
    }

    // Run build
    if (!options.silent) {
      p.log.info(`Building plugin...`);
    }
    execSync("bun run build", {
      cwd: actualPath,
      stdio: options.silent ? "pipe" : "inherit",
    });

    return true;
  } catch (error) {
    if (!options.silent) {
      p.log.error(`Build failed: ${error}`);
    }
    return false;
  }
}

/**
 * Build all installed plugins
 */
export async function buildAllPlugins(
  options: { silent?: boolean } = {}
): Promise<{
  success: string[];
  failed: string[];
  skipped: string[];
}> {
  const result = {
    success: [] as string[],
    failed: [] as string[],
    skipped: [] as string[],
  };

  if (!fs.existsSync(PLUGINS_DIR)) {
    return result;
  }

  const entries = await fs.readdir(PLUGINS_DIR);

  for (const entry of entries) {
    const pluginPath = join(PLUGINS_DIR, entry);
    const stats = await fs.stat(pluginPath);

    if (!stats.isDirectory()) {
      continue;
    }

    // Skip temp directories
    if (entry.startsWith(".temp-")) {
      continue;
    }

    // Get plugin name from manifest if available
    let pluginName = entry;
    const manifestPath = join(pluginPath, "overlay.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest: PluginManifest = await fs.readJson(manifestPath);
        pluginName = manifest.name || entry;
      } catch {
        // Use directory name as fallback
      }
    }

    const actualPath = resolvePluginPath(pluginPath);

    if (!needsBuild(actualPath)) {
      result.skipped.push(pluginName);
      continue;
    }

    if (!options.silent) {
      p.log.info(`Building ${pc.cyan(pluginName)}...`);
    }

    const success = await buildPlugin(pluginPath, { silent: true });

    if (success) {
      result.success.push(pluginName);
    } else {
      result.failed.push(pluginName);
    }
  }

  return result;
}

/**
 * Get list of installed plugin paths
 */
export async function getInstalledPluginPaths(): Promise<string[]> {
  if (!fs.existsSync(PLUGINS_DIR)) {
    return [];
  }

  const entries = await fs.readdir(PLUGINS_DIR);
  const paths: string[] = [];

  for (const entry of entries) {
    const pluginPath = join(PLUGINS_DIR, entry);
    const stats = await fs.stat(pluginPath);

    if (stats.isDirectory() && !entry.startsWith(".temp-")) {
      paths.push(pluginPath);
    }
  }

  return paths;
}

/**
 * Check if a plugin has a native (Rust) component
 */
export function hasNativeComponent(pluginPath: string): boolean {
  const manifestPath = join(pluginPath, "overlay.json");
  if (!fs.existsSync(manifestPath)) {
    return false;
  }

  try {
    const manifest: PluginManifest = fs.readJsonSync(manifestPath);
    return manifest.native !== undefined;
  } catch {
    return false;
  }
}

/**
 * Check if native component needs to be built (library doesn't exist for current platform)
 */
export function needsNativeBuild(pluginPath: string): boolean {
  const manifestPath = join(pluginPath, "overlay.json");
  if (!fs.existsSync(manifestPath)) {
    return false;
  }

  try {
    const manifest: PluginManifest = fs.readJsonSync(manifestPath);
    if (!manifest.native) {
      return false;
    }

    const currentPlatform = getCurrentPlatform();

    // Check if library exists for current platform
    if (
      manifest.native.libraries &&
      manifest.native.libraries[currentPlatform]
    ) {
      const libPath = join(
        pluginPath,
        manifest.native.libraries[currentPlatform]
      );
      return !fs.existsSync(libPath);
    }

    // Check legacy single library path
    if (manifest.native.library) {
      const libPath = join(pluginPath, manifest.native.library);
      return !fs.existsSync(libPath);
    }

    // Has native config but no library paths - needs build
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the Cargo directory for a plugin
 */
function getCargoDir(pluginPath: string): string | null {
  // Check for native/ subdirectory first (hybrid plugins)
  const nativeDir = join(pluginPath, "native");
  if (fs.existsSync(join(nativeDir, "Cargo.toml"))) {
    return nativeDir;
  }

  // Check root directory (native-only plugins)
  if (fs.existsSync(join(pluginPath, "Cargo.toml"))) {
    return pluginPath;
  }

  return null;
}

/**
 * Get crate name from Cargo.toml
 */
async function getCrateName(cargoDir: string): Promise<string> {
  const cargoToml = await fs.readFile(join(cargoDir, "Cargo.toml"), "utf-8");
  const match = cargoToml.match(/name\s*=\s*"([^"]+)"/);
  return match && match[1] ? match[1] : "plugin";
}

/**
 * Build native (Rust) component of a plugin
 */
export async function buildNativePlugin(
  pluginPath: string,
  options: { silent?: boolean; release?: boolean } = {}
): Promise<boolean> {
  const actualPath = resolvePluginPath(pluginPath);
  const cargoDir = getCargoDir(actualPath);

  if (!cargoDir) {
    if (!options.silent) {
      p.log.error("No Cargo.toml found for native build");
    }
    return false;
  }

  const currentPlatform = getCurrentPlatform();
  const rustTarget = PLATFORM_TARGETS[currentPlatform];

  if (!rustTarget) {
    if (!options.silent) {
      p.log.error(`Unsupported platform: ${currentPlatform}`);
    }
    return false;
  }

  const release = options.release !== false; // Default to release
  const buildMode = release ? "release" : "debug";

  try {
    // Build the native component
    const args = ["build"];
    if (release) args.push("--release");
    args.push("--target", rustTarget);

    if (!options.silent) {
      p.log.info(`Building native component for ${currentPlatform}...`);
    }

    execSync(`cargo ${args.join(" ")}`, {
      cwd: cargoDir,
      stdio: options.silent ? "pipe" : "inherit",
    });

    // Update manifest with library path
    const manifestPath = join(actualPath, "overlay.json");
    const manifest: PluginManifest = await fs.readJson(manifestPath);

    if (manifest.native) {
      const crateName = await getCrateName(cargoDir);
      const libName = getLibraryName(crateName, currentPlatform);
      const libPath = join("native", "target", rustTarget, buildMode, libName);

      // Initialize libraries object if needed
      if (!manifest.native.libraries) {
        manifest.native.libraries = {};
      }

      // Update library path for current platform
      manifest.native.libraries[currentPlatform] = libPath;

      // Update platforms list
      if (!manifest.native.platforms) {
        manifest.native.platforms = [];
      }
      if (!manifest.native.platforms.includes(currentPlatform)) {
        manifest.native.platforms.push(currentPlatform);
      }

      await fs.writeJson(manifestPath, manifest, { spaces: 2 });
    }

    return true;
  } catch (error) {
    if (!options.silent) {
      p.log.error(`Native build failed: ${error}`);
    }
    return false;
  }
}

/**
 * Build all installed plugins (both UI and native components)
 */
export async function buildAllPluginsWithNative(
  options: { silent?: boolean } = {}
): Promise<{
  ui: { success: string[]; failed: string[]; skipped: string[] };
  native: { success: string[]; failed: string[]; skipped: string[] };
}> {
  const result = {
    ui: {
      success: [] as string[],
      failed: [] as string[],
      skipped: [] as string[],
    },
    native: {
      success: [] as string[],
      failed: [] as string[],
      skipped: [] as string[],
    },
  };

  if (!fs.existsSync(PLUGINS_DIR)) {
    return result;
  }

  const entries = await fs.readdir(PLUGINS_DIR);

  for (const entry of entries) {
    const pluginPath = join(PLUGINS_DIR, entry);
    const stats = await fs.stat(pluginPath);

    if (!stats.isDirectory()) {
      continue;
    }

    // Skip temp directories
    if (entry.startsWith(".temp-")) {
      continue;
    }

    // Get plugin name from manifest if available
    let pluginName = entry;
    const manifestPath = join(pluginPath, "overlay.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest: PluginManifest = await fs.readJson(manifestPath);
        pluginName = manifest.name || entry;
      } catch {
        // Use directory name as fallback
      }
    }

    const actualPath = resolvePluginPath(pluginPath);

    // Build UI component
    if (needsBuild(actualPath)) {
      if (!options.silent) {
        p.log.info(`Building UI for ${pc.cyan(pluginName)}...`);
      }

      const success = await buildPlugin(pluginPath, { silent: true });

      if (success) {
        result.ui.success.push(pluginName);
      } else {
        result.ui.failed.push(pluginName);
      }
    } else {
      result.ui.skipped.push(pluginName);
    }

    // Build native component
    if (hasNativeComponent(actualPath)) {
      if (needsNativeBuild(actualPath)) {
        if (!options.silent) {
          p.log.info(`Building native for ${pc.cyan(pluginName)}...`);
        }

        const success = await buildNativePlugin(pluginPath, {
          silent: true,
          release: true,
        });

        if (success) {
          result.native.success.push(pluginName);
        } else {
          result.native.failed.push(pluginName);
        }
      } else {
        result.native.skipped.push(pluginName);
      }
    }
  }

  return result;
}
