import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { spawn } from "child_process";
import fs from "fs-extra";
import { getRuntimeBinaryPath, PID_FILE, YAOF_DIR } from "../utils/paths.js";
import { buildAllPluginsWithNative } from "../utils/build.js";

export const startCommand = new Command("start")
  .description("Start the YAOF runtime as a background service")
  .option("-f, --foreground", "Run in foreground (blocking) mode")
  .option("--no-build", "Skip building plugins before starting")
  .action(async (options) => {
    p.intro(pc.bgGreen(pc.black(" YAOF Start ")));

    // Check if already running
    if (await isRunning()) {
      p.log.warn("YAOF runtime is already running");
      p.log.info(`PID file: ${pc.dim(PID_FILE)}`);
      p.outro(pc.yellow("Use 'yaof restart' to restart the service"));
      return;
    }

    // Find the runtime binary
    const runtimePath = getRuntimeBinaryPath();

    if (!runtimePath) {
      p.log.error("Could not find YAOF runtime binary");
      p.log.info(
        pc.dim(
          "Make sure YAOF is installed, or set YAOF_RUNTIME_PATH environment variable"
        )
      );
      process.exit(1);
    }

    p.log.info(`Found runtime at: ${pc.cyan(runtimePath)}`);

    // Ensure YAOF directory exists
    await fs.ensureDir(YAOF_DIR);

    // Build all plugins before starting (both UI and native)
    if (options.build !== false) {
      const buildSpinner = p.spinner();
      buildSpinner.start("Building plugins...");

      const buildResult = await buildAllPluginsWithNative({ silent: true });

      const uiBuilt = buildResult.ui.success.length;
      const uiFailed = buildResult.ui.failed.length;
      const nativeBuilt = buildResult.native.success.length;
      const nativeFailed = buildResult.native.failed.length;

      const totalBuilt = uiBuilt + nativeBuilt;
      const totalFailed = uiFailed + nativeFailed;

      if (totalFailed > 0) {
        buildSpinner.stop(
          pc.yellow(`Built ${totalBuilt} component(s), ${totalFailed} failed`)
        );
        for (const failed of buildResult.ui.failed) {
          p.log.warn(`  UI build failed: ${pc.red(failed)}`);
        }
        for (const failed of buildResult.native.failed) {
          p.log.warn(`  Native build failed: ${pc.red(failed)}`);
        }
      } else if (totalBuilt > 0) {
        const parts = [];
        if (uiBuilt > 0) parts.push(`${uiBuilt} UI`);
        if (nativeBuilt > 0) parts.push(`${nativeBuilt} native`);
        buildSpinner.stop(pc.green(`Built ${parts.join(", ")} component(s)`));
      } else {
        buildSpinner.stop(pc.dim("No plugins to build"));
      }
    }

    if (options.foreground) {
      // Run in foreground (blocking) mode
      p.log.info("Starting YAOF runtime in foreground mode...");
      p.log.info(pc.dim("Press Ctrl+C to stop"));

      const child = spawn(runtimePath, [], {
        stdio: "inherit",
        env: { ...process.env },
      });

      // Write PID file
      await fs.writeFile(PID_FILE, child.pid?.toString() || "");

      child.on("exit", async (code) => {
        await fs.remove(PID_FILE);
        p.outro(
          code === 0
            ? pc.green("YAOF runtime stopped")
            : pc.red(`YAOF runtime exited with code ${code}`)
        );
        process.exit(code || 0);
      });

      // Handle Ctrl+C
      process.on("SIGINT", () => {
        child.kill("SIGTERM");
      });

      process.on("SIGTERM", () => {
        child.kill("SIGTERM");
      });
    } else {
      // Run in background (detached) mode
      p.log.info("Starting YAOF runtime in background...");

      const child = spawn(runtimePath, [], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env },
      });

      // Unref to allow parent to exit
      child.unref();

      // Write PID file
      if (child.pid) {
        await fs.writeFile(PID_FILE, child.pid.toString());
        p.log.success(`YAOF runtime started with PID: ${pc.cyan(child.pid)}`);
        p.log.info(`PID file: ${pc.dim(PID_FILE)}`);
        p.outro(pc.green("YAOF is now running in the background"));
      } else {
        p.log.error("Failed to start YAOF runtime");
        process.exit(1);
      }
    }
  });

/**
 * Check if the YAOF runtime is currently running
 */
async function isRunning(): Promise<boolean> {
  if (!(await fs.pathExists(PID_FILE))) {
    return false;
  }

  try {
    const pid = parseInt(await fs.readFile(PID_FILE, "utf-8"), 10);

    if (isNaN(pid)) {
      return false;
    }

    // Check if process is running by sending signal 0
    process.kill(pid, 0);
    return true;
  } catch {
    // Process not running, clean up stale PID file
    await fs.remove(PID_FILE);
    return false;
  }
}
