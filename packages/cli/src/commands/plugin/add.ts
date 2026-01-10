import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "fs-extra";
import { execSync } from "child_process";
import { join, resolve } from "path";
import { PLUGINS_DIR, getPluginDir } from "../../utils/paths.js";
import { buildPlugin, needsBuild } from "../../utils/build.js";

export const addCommand = new Command("add")
  .description("Install a plugin")
  .argument("<source>", "Plugin source (local path, npm package, or git URL)")
  .option("-s, --symlink", "Create symlink instead of copying (for local dev)")
  .option("--no-build", "Skip building the plugin after installation")
  .action(async (source, options) => {
    p.intro(pc.bgCyan(pc.black(" Install Plugin ")));

    const spinner = p.spinner();
    spinner.start("Installing plugin...");

    try {
      await fs.ensureDir(PLUGINS_DIR);

      let destDir: string;
      let manifestName: string;
      let sourcePath: string | null = null;

      // Detect source type
      if (
        source.startsWith("git@") ||
        source.startsWith("https://") ||
        source.includes("github.com")
      ) {
        // Git source
        spinner.message("Cloning from git...");
        const tempDir = join(PLUGINS_DIR, ".temp-" + Date.now());
        execSync(`git clone ${source} ${tempDir}`, { stdio: "pipe" });

        const manifest = await fs.readJson(join(tempDir, "overlay.json"));
        destDir = getPluginDir(manifest.id);
        manifestName = manifest.name;
        sourcePath = tempDir;

        await fs.move(tempDir, destDir, { overwrite: true });
        spinner.stop(`Cloned ${manifestName} from git`);
      } else if (fs.existsSync(source)) {
        // Local path
        const absoluteSource = resolve(source);
        const manifest = await fs.readJson(
          join(absoluteSource, "overlay.json")
        );
        destDir = getPluginDir(manifest.id);
        manifestName = manifest.name;

        if (options.symlink) {
          spinner.message("Creating symlink...");
          // Remove existing if present
          if (fs.existsSync(destDir)) {
            await fs.remove(destDir);
          }
          await fs.ensureSymlink(absoluteSource, destDir);
          sourcePath = absoluteSource;
          spinner.stop(`Linked ${manifestName} (dev mode)`);
        } else {
          spinner.message("Copying files...");
          await fs.copy(absoluteSource, destDir, { overwrite: true });
          sourcePath = destDir;
          spinner.stop(`Copied ${manifestName} from local path`);
        }
      } else {
        // Assume npm package
        spinner.message("Downloading from npm...");
        const tempDir = join(PLUGINS_DIR, ".temp-" + Date.now());
        await fs.ensureDir(tempDir);

        execSync(`npm pack ${source} --pack-destination ${tempDir}`, {
          stdio: "pipe",
        });

        // Extract and find manifest
        const tarballs = await fs.readdir(tempDir);
        const tarball = tarballs.find((f) => f.endsWith(".tgz"));
        if (!tarball) throw new Error("Failed to download package");

        execSync(`tar -xzf ${join(tempDir, tarball)} -C ${tempDir}`, {
          stdio: "pipe",
        });

        const manifest = await fs.readJson(
          join(tempDir, "package", "overlay.json")
        );
        destDir = getPluginDir(manifest.id);
        manifestName = manifest.name;

        await fs.move(join(tempDir, "package"), destDir, { overwrite: true });
        await fs.remove(tempDir);
        sourcePath = destDir;

        spinner.stop(`Downloaded ${manifestName} from npm`);
      }

      // Build the plugin if needed
      const buildPath = options.symlink ? sourcePath : destDir;
      if (options.build !== false && buildPath && needsBuild(buildPath)) {
        const buildSpinner = p.spinner();
        buildSpinner.start(`Building ${pc.cyan(manifestName)}...`);

        const success = await buildPlugin(buildPath, { silent: true });

        if (success) {
          buildSpinner.stop(`Built ${pc.cyan(manifestName)} successfully`);
        } else {
          buildSpinner.stop(pc.yellow(`Build failed for ${manifestName}`));
          p.log.warn(
            "Plugin installed but build failed. You may need to build it manually."
          );
        }
      }

      p.outro(pc.green("Plugin installed successfully!"));
    } catch (error) {
      spinner.stop("Installation failed");
      p.log.error(String(error));
      process.exit(1);
    }
  });
