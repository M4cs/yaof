import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "fs-extra";
import { join } from "node:path";
import { execSync, spawn } from "node:child_process";

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

// Check if a Rust target is installed
function isTargetInstalled(target: string): boolean {
  try {
    const output = execSync("rustup target list --installed", {
      encoding: "utf-8",
    });
    return output.includes(target);
  } catch {
    return false;
  }
}

// Install a Rust target
async function installTarget(target: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("rustup", ["target", "add", target], {
      stdio: "inherit",
    });
    proc.on("close", (code) => resolve(code === 0));
  });
}

// Build for a specific target
async function buildForTarget(
  cargoDir: string,
  target: string,
  release: boolean
): Promise<boolean> {
  return new Promise((resolve) => {
    const args = ["build"];
    if (release) args.push("--release");
    args.push("--target", target);

    const proc = spawn("cargo", args, {
      cwd: cargoDir,
      stdio: "inherit",
    });
    proc.on("close", (code) => resolve(code === 0));
  });
}

export const buildCommand = new Command("build")
  .description("Build a YAOF plugin")
  .option("-r, --release", "Build in release mode", true)
  .option("-d, --debug", "Build in debug mode")
  .option(
    "-t, --target <targets>",
    "Comma-separated list of target platforms (e.g., darwin-arm64,darwin-x64)"
  )
  .option("--all-targets", "Build for all supported platforms")
  .option("--native-only", "Only build native (Rust) component")
  .option("--ui-only", "Only build UI (React) component")
  .action(async (options) => {
    p.intro(pc.bgCyan(pc.black(" YAOF Plugin Builder ")));

    const pluginDir = process.cwd();
    const manifestPath = join(pluginDir, "overlay.json");

    // Check if we're in a plugin directory
    if (!(await fs.pathExists(manifestPath))) {
      p.log.error("No overlay.json found. Are you in a plugin directory?");
      process.exit(1);
    }

    const manifest = await fs.readJson(manifestPath);
    const hasNative = manifest.native !== undefined;
    const hasUI = manifest.entry && manifest.entry !== "";

    // Determine what to build
    const buildNative = hasNative && !options.uiOnly;
    const buildUI = hasUI && !options.nativeOnly;

    if (!buildNative && !buildUI) {
      p.log.error("Nothing to build!");
      process.exit(1);
    }

    const release = !options.debug;
    const buildMode = release ? "release" : "debug";

    // Build native component
    if (buildNative) {
      p.log.step(pc.blue("Building native component..."));

      // Determine cargo directory
      let cargoDir = pluginDir;
      if (await fs.pathExists(join(pluginDir, "native", "Cargo.toml"))) {
        cargoDir = join(pluginDir, "native");
      } else if (!(await fs.pathExists(join(pluginDir, "Cargo.toml")))) {
        p.log.error("No Cargo.toml found for native build");
        process.exit(1);
      }

      // Determine targets to build
      let targets: string[] = [];

      if (options.allTargets) {
        // Build for all platforms in manifest
        targets = manifest.native.platforms || [];
      } else if (options.target) {
        // Build for specified targets
        targets = options.target.split(",").map((t: string) => t.trim());
      } else {
        // Build for current platform only
        targets = [getCurrentPlatform()];
      }

      if (targets.length === 0) {
        p.log.error("No target platforms specified");
        process.exit(1);
      }

      const spinner = p.spinner();

      for (const platform of targets) {
        const rustTarget = PLATFORM_TARGETS[platform];
        if (!rustTarget) {
          p.log.warn(`Unknown platform: ${platform}, skipping`);
          continue;
        }

        spinner.start(`Building for ${platform} (${rustTarget})...`);

        // Check if target is installed
        if (!isTargetInstalled(rustTarget)) {
          spinner.message(`Installing target ${rustTarget}...`);
          const installed = await installTarget(rustTarget);
          if (!installed) {
            spinner.stop(`Failed to install target ${rustTarget}`);
            continue;
          }
        }

        // Build
        const success = await buildForTarget(cargoDir, rustTarget, release);
        if (success) {
          spinner.stop(pc.green(`✓ Built for ${platform}`));
        } else {
          spinner.stop(pc.red(`✗ Failed to build for ${platform}`));
        }
      }

      // Update manifest with library paths if needed
      if (manifest.native && !manifest.native.libraries) {
        p.log.step("Updating manifest with library paths...");

        const crateName = await getCrateName(cargoDir);
        const libraries: Record<string, string> = {};

        for (const platform of targets) {
          const rustTarget = PLATFORM_TARGETS[platform];
          if (!rustTarget) continue;

          const libPath = getNativeLibraryPath(
            cargoDir,
            crateName,
            rustTarget,
            platform,
            buildMode
          );
          const relativePath = libPath.replace(pluginDir + "/", "");
          libraries[platform] = relativePath;
        }

        manifest.native.libraries = libraries;
        manifest.native.platforms = targets;

        await fs.writeJson(manifestPath, manifest, { spaces: 2 });
        p.log.success("Updated overlay.json with library paths");
      }
    }

    // Build UI component
    if (buildUI) {
      p.log.step(pc.blue("Building UI component..."));

      const spinner = p.spinner();
      spinner.start("Running vite build...");

      try {
        execSync("bun run build", {
          cwd: pluginDir,
          stdio: "pipe",
        });
        spinner.stop(pc.green("✓ UI built successfully"));
      } catch (error) {
        spinner.stop(pc.red("✗ UI build failed"));
        if (error instanceof Error) {
          p.log.error(error.message);
        }
        process.exit(1);
      }
    }

    p.outro(pc.green("Build complete! 🎉"));
  });

// Get crate name from Cargo.toml
async function getCrateName(cargoDir: string): Promise<string> {
  const cargoToml = await fs.readFile(join(cargoDir, "Cargo.toml"), "utf-8");
  const match = cargoToml.match(/name\s*=\s*"([^"]+)"/);
  return match && match[1] ? match[1] : "plugin";
}

// Get the expected library path for a platform
function getNativeLibraryPath(
  cargoDir: string,
  crateName: string,
  rustTarget: string,
  platform: string,
  buildMode: string
): string {
  const libName = getLibraryName(crateName, platform);
  return join(cargoDir, "target", rustTarget, buildMode, libName);
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
