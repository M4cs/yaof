import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "fs-extra";
import { join } from "path";
import { PLUGINS_DIR } from "../../utils/paths.js";

interface PluginManifest {
  id: string;
  name: string;
  version: string;
}

export const listCommand = new Command("list")
  .description("List installed plugins")
  .alias("ls")
  .action(async () => {
    p.intro(pc.bgCyan(pc.black(" Installed Plugins ")));

    if (!fs.existsSync(PLUGINS_DIR)) {
      p.log.info("No plugins installed");
      return;
    }

    try {
      const entries = await fs.readdir(PLUGINS_DIR, { withFileTypes: true });
      const plugins: PluginManifest[] = [];

      for (const entry of entries) {
        // Skip hidden files/dirs
        if (entry.name.startsWith(".")) continue;

        const entryPath = join(PLUGINS_DIR, entry.name);

        // Check if it's a directory OR a symlink pointing to a directory
        let isDir = entry.isDirectory();
        if (entry.isSymbolicLink()) {
          try {
            const stat = await fs.stat(entryPath); // fs.stat follows symlinks
            isDir = stat.isDirectory();
          } catch {
            // Broken symlink, skip it
            continue;
          }
        }
        if (!isDir) continue;

        const manifestPath = join(entryPath, "overlay.json");
        if (fs.existsSync(manifestPath)) {
          const manifest = await fs.readJson(manifestPath);
          plugins.push({
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
          });
        }
      }

      if (plugins.length === 0) {
        p.log.info("No plugins installed");
        return;
      }

      console.log();
      console.log(pc.bold("  ID                  Name                Version"));
      console.log(pc.dim("  " + "─".repeat(60)));

      for (const plugin of plugins) {
        console.log(
          `  ${pc.cyan(plugin.id.padEnd(20))} ${plugin.name.padEnd(
            20
          )} ${pc.dim(plugin.version)}`
        );
      }
      console.log();

      p.outro(`${plugins.length} plugin(s) installed`);
    } catch (error) {
      p.log.error(String(error));
      process.exit(1);
    }
  });
