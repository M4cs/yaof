#!/usr/bin/env bun
/**
 * Build script for YAOF runtime binaries
 *
 * Usage:
 *   bun run scripts/build-runtime.ts           # Build for current platform
 *   bun run scripts/build-runtime.ts --all     # Build for all platforms
 *   bun run scripts/build-runtime.ts --target aarch64-apple-darwin
 */

import { $ } from "bun";
import { existsSync, mkdirSync, cpSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";

// Platform configurations
const PLATFORMS = {
  "darwin-arm64": {
    target: "aarch64-apple-darwin",
    binaryName: "yaof-runtime",
    packageDir: "runtime-darwin-arm64",
    bundleType: "macos",
  },
  "darwin-x64": {
    target: "x86_64-apple-darwin",
    binaryName: "yaof-runtime",
    packageDir: "runtime-darwin-x64",
    bundleType: "macos",
  },
  "linux-x64": {
    target: "x86_64-unknown-linux-gnu",
    binaryName: "yaof-runtime",
    packageDir: "runtime-linux-x64",
    bundleType: "deb",
  },
  "win32-x64": {
    target: "x86_64-pc-windows-msvc",
    binaryName: "yaof-runtime.exe",
    packageDir: "runtime-win32-x64",
    bundleType: "msi",
  },
} as const;

type PlatformKey = keyof typeof PLATFORMS;

// Get current platform
function getCurrentPlatform(): PlatformKey | null {
  const os = process.platform;
  const arch = process.arch;

  if (os === "darwin" && arch === "arm64") return "darwin-arm64";
  if (os === "darwin" && arch === "x64") return "darwin-x64";
  if (os === "linux" && arch === "x64") return "linux-x64";
  if (os === "win32" && arch === "x64") return "win32-x64";

  return null;
}

// Build for a specific target
async function buildForTarget(platformKey: PlatformKey): Promise<boolean> {
  const platform = PLATFORMS[platformKey];
  const projectRoot = join(import.meta.dir, "..");

  console.log(`\n🔨 Building for ${platformKey} (${platform.target})...`);

  try {
    // Use bunx to run the Tauri CLI from npm
    // The -c flag specifies the tauri.conf.json location
    await $`bunx tauri build --target ${platform.target} -c ./crates/yaof-runtime/tauri.conf.json`.cwd(
      projectRoot
    );

    console.log(`✅ Build completed for ${platformKey}`);
    return true;
  } catch (error) {
    console.error(`❌ Build failed for ${platformKey}:`, error);
    return false;
  }
}

// Copy built binary to the package directory
function copyBinaryToPackage(platformKey: PlatformKey): boolean {
  const platform = PLATFORMS[platformKey];
  const projectRoot = join(import.meta.dir, "..");

  // Tauri outputs to different locations based on platform
  // For macOS: target/{target}/release/bundle/macos/YAOF.app/Contents/MacOS/YAOF
  // For Linux: target/{target}/release/yaof-runtime
  // For Windows: target/{target}/release/yaof-runtime.exe
  const possiblePaths: string[] = [];

  if (platformKey.startsWith("darwin")) {
    // macOS app bundle
    possiblePaths.push(
      join(
        projectRoot,
        "target",
        platform.target,
        "release",
        "bundle",
        "macos",
        "YAOF.app",
        "Contents",
        "MacOS",
        "YAOF"
      ),
      // Also check for the raw binary
      join(projectRoot, "target", platform.target, "release", "yaof-runtime")
    );
  } else if (platformKey === "win32-x64") {
    possiblePaths.push(
      join(
        projectRoot,
        "target",
        platform.target,
        "release",
        "yaof-runtime.exe"
      ),
      join(
        projectRoot,
        "target",
        platform.target,
        "release",
        "bundle",
        "msi",
        "YAOF.exe"
      )
    );
  } else {
    // Linux
    possiblePaths.push(
      join(projectRoot, "target", platform.target, "release", "yaof-runtime")
    );
  }

  let sourcePath: string | null = null;
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      sourcePath = path;
      break;
    }
  }

  if (!sourcePath) {
    console.error(`❌ Could not find built binary for ${platformKey}`);
    console.error("  Checked paths:", possiblePaths);
    return false;
  }

  const destDir = join(projectRoot, "packages", platform.packageDir, "bin");
  const destPath = join(destDir, platform.binaryName);

  // Create bin directory if it doesn't exist
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  // Copy the binary
  cpSync(sourcePath, destPath);
  console.log(`📦 Copied binary to ${destPath}`);

  return true;
}

// Main function
async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      all: { type: "boolean", default: false },
      target: { type: "string" },
      "copy-only": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
YAOF Runtime Build Script

Usage:
  bun run scripts/build-runtime.ts [options]

Options:
  --all           Build for all platforms (requires cross-compilation setup)
  --target <t>    Build for a specific Rust target
  --copy-only     Only copy existing binaries to packages (skip build)
  -h, --help      Show this help message

Supported platforms:
  darwin-arm64    macOS ARM64 (Apple Silicon)
  darwin-x64      macOS x64 (Intel)
  linux-x64       Linux x64
  win32-x64       Windows x64

Note: Cross-compilation requires appropriate toolchains to be installed.
      For macOS, you can build both arm64 and x64 natively.
      For Linux/Windows, you may need Docker or cross-compilation tools.
`);
    return;
  }

  const projectRoot = join(import.meta.dir, "..");
  console.log("🚀 YAOF Runtime Build Script");
  console.log(`   Project root: ${projectRoot}`);

  let platformsToBuild: PlatformKey[] = [];

  if (values.all) {
    platformsToBuild = Object.keys(PLATFORMS) as PlatformKey[];
    console.log("   Building for all platforms");
  } else if (values.target) {
    // Find platform by target
    const entry = Object.entries(PLATFORMS).find(
      ([_, p]) => p.target === values.target
    );
    if (!entry) {
      console.error(`❌ Unknown target: ${values.target}`);
      process.exit(1);
    }
    platformsToBuild = [entry[0] as PlatformKey];
  } else {
    // Build for current platform
    const current = getCurrentPlatform();
    if (!current) {
      console.error("❌ Could not detect current platform");
      process.exit(1);
    }
    platformsToBuild = [current];
    console.log(`   Building for current platform: ${current}`);
  }

  const results: Record<string, boolean> = {};

  for (const platformKey of platformsToBuild) {
    if (!values["copy-only"]) {
      const buildSuccess = await buildForTarget(platformKey);
      if (!buildSuccess) {
        results[platformKey] = false;
        continue;
      }
    }

    const copySuccess = copyBinaryToPackage(platformKey);
    results[platformKey] = copySuccess;
  }

  // Summary
  console.log("\n📊 Build Summary:");
  for (const [platform, success] of Object.entries(results)) {
    console.log(`   ${success ? "✅" : "❌"} ${platform}`);
  }

  const allSuccess = Object.values(results).every((v) => v);
  process.exit(allSuccess ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
