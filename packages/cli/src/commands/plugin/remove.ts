import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "fs-extra";
import { getPluginDir, PLUGINS_DIR } from "../../utils/paths.js";

export const removeCommand = new Command("remove")
  .description("Uninstall a plugin")
  .argument("<id>", "Plugin ID to remove")
  .action(async (id) => {
    p.intro(pc.bgCyan(pc.black(" Remove Plugin ")));

    const pluginDir = getPluginDir(id);

    if (!fs.existsSync(pluginDir)) {
      p.log.error(`Plugin "${id}" not found`);
      process.exit(1);
    }

    const confirmed = await p.confirm({
      message: `Are you sure you want to remove "${id}"?`,
    });

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel("Operation cancelled");
      process.exit(0);
    }

    const spinner = p.spinner();
    spinner.start("Removing plugin...");

    try {
      await fs.remove(pluginDir);
      spinner.stop("Plugin removed");
      p.outro(pc.green(`Removed ${id}`));
    } catch (error) {
      spinner.stop("Failed to remove plugin");
      p.log.error(String(error));
      process.exit(1);
    }
  });
