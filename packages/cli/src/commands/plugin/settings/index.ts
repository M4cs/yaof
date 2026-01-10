import { Command } from "commander";
import { generateCommand } from "./generate";

export const settingsCommand = new Command("settings")
  .description("Plugin settings management commands")
  .addCommand(generateCommand);
