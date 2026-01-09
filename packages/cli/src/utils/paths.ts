import { homedir, platform, arch } from "node:os";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

export const YAOF_DIR = join(homedir(), ".yaof");
export const PLUGINS_DIR = join(YAOF_DIR, "plugins");
export const CONFIG_FILE = join(YAOF_DIR, "config.json");
export const PID_FILE = join(YAOF_DIR, "runtime.pid");

export function getPluginDir(pluginId: string): string {
  return join(PLUGINS_DIR, pluginId);
}

/**
 * Get the npm package name for the current platform's runtime
 */
function getRuntimePackageName(): string {
  const os = platform();
  const cpuArch = arch();

  if (os === "darwin" && cpuArch === "arm64") {
    return "@m4cs/yaof-runtime-darwin-arm64";
  } else if (os === "darwin" && cpuArch === "x64") {
    return "@m4cs/yaof-runtime-darwin-x64";
  } else if (os === "linux" && cpuArch === "x64") {
    return "@m4cs/yaof-runtime-linux-x64";
  } else if (os === "win32" && cpuArch === "x64") {
    return "@m4cs/yaof-runtime-win32-x64";
  }

  throw new Error(`Unsupported platform: ${os}-${cpuArch}`);
}

/**
 * Try to find the runtime binary from the npm package
 */
function findNpmInstalledRuntime(): string | null {
  try {
    const packageName = getRuntimePackageName();

    // Try to require the package to get its path
    const require = createRequire(import.meta.url);

    try {
      const runtimeModule = require(packageName);
      if (runtimeModule && typeof runtimeModule.getBinaryPath === "function") {
        const binaryPath = runtimeModule.getBinaryPath();
        if (existsSync(binaryPath)) {
          return binaryPath;
        }
      }
    } catch {
      // Package not installed, try to find it manually
    }

    // Try common node_modules locations
    const possibleNodeModulesPaths = [
      // Local node_modules (when running from project)
      join(process.cwd(), "node_modules", packageName, "bin"),
      // Global npm
      join(homedir(), ".npm", "lib", "node_modules", packageName, "bin"),
      // Global yarn
      join(homedir(), ".yarn", "global", "node_modules", packageName, "bin"),
      // pnpm global
      join(
        homedir(),
        ".local",
        "share",
        "pnpm",
        "global",
        "5",
        "node_modules",
        packageName,
        "bin"
      ),
    ];

    const binaryName =
      platform() === "win32" ? "yaof-runtime.exe" : "yaof-runtime";

    for (const modulePath of possibleNodeModulesPaths) {
      const binaryPath = join(modulePath, binaryName);
      if (existsSync(binaryPath)) {
        return binaryPath;
      }
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Get the path to the YAOF runtime binary.
 * Checks multiple locations based on the platform.
 */
export function getRuntimeBinaryPath(): string | null {
  const os = platform();

  // First, check for npm-installed runtime package
  const npmRuntime = findNpmInstalledRuntime();
  if (npmRuntime) {
    return npmRuntime;
  }

  // Possible locations for the runtime binary
  const possiblePaths: string[] = [];

  // Check environment variable override first
  if (process.env.YAOF_RUNTIME_PATH) {
    possiblePaths.push(process.env.YAOF_RUNTIME_PATH);
  }

  if (os === "darwin") {
    // macOS: Check for app bundle first, then standalone binary
    possiblePaths.push(
      "/Applications/YAOF.app/Contents/MacOS/yaof-runtime",
      join(homedir(), "Applications/YAOF.app/Contents/MacOS/yaof-runtime"),
      join(YAOF_DIR, "bin", "yaof-runtime"),
      "/usr/local/bin/yaof-runtime"
    );
  } else if (os === "win32") {
    // Windows
    possiblePaths.push(
      join(
        process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
        "YAOF",
        "yaof-runtime.exe"
      ),
      join(YAOF_DIR, "bin", "yaof-runtime.exe")
    );
  } else {
    // Linux and others
    possiblePaths.push(
      join(YAOF_DIR, "bin", "yaof-runtime"),
      "/usr/local/bin/yaof-runtime",
      join(homedir(), ".local", "bin", "yaof-runtime")
    );
  }

  // Return the first path that exists
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Get the path to the YAOF project root (for development)
 */
export function getProjectRoot(): string | null {
  // Check if we're in the yaof project directory
  const cwd = process.cwd();

  // Look for Cargo.toml with yaof-runtime
  const cargoPath = join(cwd, "Cargo.toml");
  if (existsSync(cargoPath)) {
    return cwd;
  }

  // Check parent directories
  let dir = cwd;
  for (let i = 0; i < 5; i++) {
    const parentCargoPath = join(dir, "Cargo.toml");
    if (existsSync(parentCargoPath)) {
      return dir;
    }
    dir = join(dir, "..");
  }

  return null;
}
