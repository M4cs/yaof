import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { spawn, ChildProcess } from "child_process";
import { join } from "path";
import fs from "fs-extra";
import { getProjectRoot, PID_FILE, YAOF_DIR } from "../utils/paths";

export const devCommand = new Command("dev")
  .description(
    "Start YAOF runtime in development mode with hot reload for all packages and plugins"
  )
  .option("--no-runtime", "Only start watch mode, not the runtime")
  .option("--no-watch", "Only start the runtime, not watch mode")
  .action(async (options) => {
    p.intro(pc.bgCyan(pc.black(" YAOF Dev Mode ")));

    const projectRoot = getProjectRoot();

    if (!projectRoot) {
      p.log.error("Not in YAOF project directory.");
      p.log.info(
        pc.dim("Run this command from the YAOF project root directory")
      );
      process.exit(1);
    }

    // Ensure YAOF directory exists
    await fs.ensureDir(YAOF_DIR);

    const processes: ChildProcess[] = [];

    // Start Turbo watch for all packages and plugins
    if (options.watch !== false) {
      p.log.step("Starting watch mode for all packages and plugins...");

      const turboWatch = spawn(
        "bunx",
        [
          "turbo",
          "run",
          "watch",
          "--filter=./packages/*",
          "--filter=./plugins/*",
        ],
        {
          cwd: projectRoot,
          stdio: "inherit",
          env: { ...process.env, YAOF_DEV: "1" },
        }
      );

      processes.push(turboWatch);

      turboWatch.on("error", (err) => {
        p.log.error(`Turbo watch error: ${err.message}`);
      });
    }

    // Start the runtime in dev mode
    if (options.runtime !== false) {
      p.log.step("Starting YAOF runtime in dev mode...");

      // Use cargo tauri dev for full hot reload support
      const runtimeDev = spawn("bunx", ["tauri", "dev"], {
        cwd: projectRoot,
        stdio: "inherit",
        env: {
          ...process.env,
          YAOF_DEV: "1",
        },
      });

      processes.push(runtimeDev);

      // Write PID file for the cargo process
      if (runtimeDev.pid) {
        await fs.writeFile(PID_FILE, runtimeDev.pid.toString());
      }

      runtimeDev.on("error", (err) => {
        p.log.error(`Runtime dev error: ${err.message}`);
      });

      runtimeDev.on("exit", async (code) => {
        await fs.remove(PID_FILE);
        if (code !== 0 && code !== null) {
          p.log.error(`Runtime exited with code ${code}`);
        }
      });
    }

    if (processes.length === 0) {
      p.log.error("No dev servers to start");
      p.log.info(pc.dim("Use --runtime or --watch to enable at least one"));
      process.exit(1);
    }

    p.log.success("Dev mode started");
    p.log.info(pc.dim("Watching: packages/*, plugins/*"));
    p.log.info(pc.dim("Press Ctrl+C to stop all dev servers"));

    // Handle cleanup on exit
    const cleanup = async () => {
      p.log.info("\nStopping dev servers...");

      for (const proc of processes) {
        if (proc.pid) {
          try {
            process.kill(proc.pid, "SIGTERM");
          } catch {
            // Process may have already exited
          }
        }
      }

      await fs.remove(PID_FILE);
      p.outro(pc.yellow("Dev mode stopped"));
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    // Keep the process running
    await new Promise(() => {});
  });
