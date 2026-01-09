import { Command } from "commander";
import { addCommand } from "./add";
import { removeCommand } from "./remove";
import { listCommand } from "./list";
import { initCommand } from "./init";
import { buildCommand } from "./build";
import { settingsCommand } from "./settings";

export const pluginCommand = new Command("plugin")
  .description("Plugin management commands")
  .addCommand(addCommand)
  .addCommand(removeCommand)
  .addCommand(listCommand)
  .addCommand(initCommand)
  .addCommand(buildCommand)
  .addCommand(settingsCommand);
