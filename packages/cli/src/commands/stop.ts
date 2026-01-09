import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "fs-extra";
import { PID_FILE } from "../utils/paths";

export const stopCommand = new Command("stop")
  .description("Stop the YAOF runtime service")
  .option("--force", "Force kill the process (SIGKILL)")
  .action(async (options) => {
    p.intro(pc.bgRed(pc.white(" YAOF Stop ")));

    // Check if PID file exists
    if (!(await fs.pathExists(PID_FILE))) {
      p.log.warn("YAOF runtime is not running (no PID file found)");
      p.outro(pc.yellow("Nothing to stop"));
      return;
    }

    try {
      const pidStr = await fs.readFile(PID_FILE, "utf-8");
      const pid = parseInt(pidStr.trim(), 10);

      if (isNaN(pid)) {
        p.log.error("Invalid PID file");
        await fs.remove(PID_FILE);
        process.exit(1);
      }

      // Check if process is running
      try {
        process.kill(pid, 0);
      } catch {
        p.log.warn(`Process ${pid} is not running (stale PID file)`);
        await fs.remove(PID_FILE);
        p.outro(pc.yellow("Cleaned up stale PID file"));
        return;
      }

      p.log.info(`Stopping YAOF runtime (PID: ${pc.cyan(pid)})...`);

      // Send signal to stop the process
      const signal = options.force ? "SIGKILL" : "SIGTERM";
      process.kill(pid, signal);

      // Wait for process to exit
      const maxWait = options.force ? 1000 : 5000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        try {
          process.kill(pid, 0);
          // Process still running, wait a bit
          await sleep(100);
        } catch {
          // Process has exited
          await fs.remove(PID_FILE);
          p.log.success("YAOF runtime stopped successfully");
          p.outro(pc.green("Goodbye!"));
          return;
        }
      }

      // Process didn't exit in time
      if (!options.force) {
        p.log.warn("Process did not exit gracefully, force killing...");
        process.kill(pid, "SIGKILL");
        await sleep(500);
      }

      // Final check
      try {
        process.kill(pid, 0);
        p.log.error("Failed to stop YAOF runtime");
        process.exit(1);
      } catch {
        await fs.remove(PID_FILE);
        p.log.success("YAOF runtime stopped");
        p.outro(pc.green("Goodbye!"));
      }
    } catch (error) {
      p.log.error(`Failed to stop YAOF runtime: ${error}`);
      process.exit(1);
    }
  });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stop the runtime programmatically (for use by restart command)
 */
export async function stopRuntime(force = false): Promise<boolean> {
  if (!(await fs.pathExists(PID_FILE))) {
    return true; // Not running
  }

  try {
    const pidStr = await fs.readFile(PID_FILE, "utf-8");
    const pid = parseInt(pidStr.trim(), 10);

    if (isNaN(pid)) {
      await fs.remove(PID_FILE);
      return true;
    }

    // Check if process is running
    try {
      process.kill(pid, 0);
    } catch {
      await fs.remove(PID_FILE);
      return true;
    }

    // Send signal to stop
    const signal = force ? "SIGKILL" : "SIGTERM";
    process.kill(pid, signal);

    // Wait for process to exit
    const maxWait = force ? 1000 : 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      try {
        process.kill(pid, 0);
        await sleep(100);
      } catch {
        await fs.remove(PID_FILE);
        return true;
      }
    }

    // Force kill if needed
    if (!force) {
      process.kill(pid, "SIGKILL");
      await sleep(500);
    }

    try {
      process.kill(pid, 0);
      return false; // Still running
    } catch {
      await fs.remove(PID_FILE);
      return true;
    }
  } catch {
    return false;
  }
}
