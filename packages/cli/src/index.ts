import { Command } from "commander";
import { pluginCommand } from "./commands/plugin";
import { devCommand } from "./commands/dev";
import { startCommand } from "./commands/start";
import { stopCommand } from "./commands/stop";
import { restartCommand } from "./commands/restart";

const program = new Command();

program
  .name("yaof")
  .description("YAOF - Yet Another Overlay Framework")
  .version("0.1.0")
  // Runtime management commands
  .addCommand(startCommand)
  .addCommand(stopCommand)
  .addCommand(restartCommand)
  .addCommand(devCommand)
  // Plugin management commands
  .addCommand(pluginCommand);

program.parse();
