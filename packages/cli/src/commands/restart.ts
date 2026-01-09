import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { spawn } from "child_process";
import fs from "fs-extra";
import { stopRuntime } from "./stop.js";
import { getRuntimeBinaryPath, PID_FILE, YAOF_DIR } from "../utils/paths.js";
import { buildAllPlugins } from "../utils/build.js";

export const restartCommand = new Command("restart")
  .description("Restart the YAOF runtime service")
  .option("--force", "Force kill the process before restarting")
  .option("--no-build", "Skip building plugins before restarting")
  .action(async (options) => {
    p.intro(pc.bgYellow(pc.black(" YAOF Restart ")));

    // Stop the runtime if running
    p.log.info("Stopping YAOF runtime...");
    const stopped = await stopRuntime(options.force);

    if (!stopped) {
      p.log.error("Failed to stop YAOF runtime");
      process.exit(1);
    }

    p.log.success("YAOF runtime stopped");

    // Small delay to ensure clean shutdown
    await new Promise((resolve) => setTimeout(resolve, 500));

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

    // Ensure YAOF directory exists
    await fs.ensureDir(YAOF_DIR);

    // Build all plugins before starting
    if (options.build !== false) {
      const buildSpinner = p.spinner();
      buildSpinner.start("Building plugins...");

      const buildResult = await buildAllPlugins({ silent: true });

      const totalBuilt = buildResult.success.length;
      const totalFailed = buildResult.failed.length;
      const totalSkipped = buildResult.skipped.length;

      if (totalFailed > 0) {
        buildSpinner.stop(
          pc.yellow(
            `Built ${totalBuilt} plugin(s), ${totalFailed} failed, ${totalSkipped} skipped`
          )
        );
        for (const failed of buildResult.failed) {
          p.log.warn(`  Failed to build: ${pc.red(failed)}`);
        }
      } else if (totalBuilt > 0) {
        buildSpinner.stop(
          pc.green(`Built ${totalBuilt} plugin(s), ${totalSkipped} skipped`)
        );
      } else {
        buildSpinner.stop(pc.dim("No plugins to build"));
      }
    }

    // Start the runtime in background
    p.log.info("Starting YAOF runtime...");

    const child = spawn(runtimePath, [], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });

    child.unref();

    if (child.pid) {
      await fs.writeFile(PID_FILE, child.pid.toString());
      p.log.success(`YAOF runtime restarted with PID: ${pc.cyan(child.pid)}`);
      p.outro(pc.green("YAOF is now running"));
    } else {
      p.log.error("Failed to start YAOF runtime");
      process.exit(1);
    }
  });
