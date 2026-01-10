import type { Plugin, UserConfig } from "vite";
import { readFileSync } from "fs";
import { resolve } from "path";

const VIRTUAL_MANIFEST_ID = "virtual:yaof-manifest";
const RESOLVED_VIRTUAL_ID = "\0" + VIRTUAL_MANIFEST_ID;

export interface YaofPluginOptions {
  /** Path to overlay.json relative to project root. Default: "overlay.json" */
  manifestPath?: string;
}

export function yaofPlugin(options: YaofPluginOptions = {}): Plugin {
  const manifestPath = options.manifestPath ?? "overlay.json";

  return {
    name: "yaof-plugin",

    // Set base to relative path so assets work with custom protocols
    config(config): UserConfig {
      return {
        base: config.base ?? "./",
        build: {
          ...config.build,
          // Ensure assets use relative paths
          assetsDir: config.build?.assetsDir ?? "assets",
        },
      };
    },

    resolveId(id) {
      if (id === VIRTUAL_MANIFEST_ID) {
        return RESOLVED_VIRTUAL_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) {
        const fullPath = resolve(process.cwd(), manifestPath);
        const content = readFileSync(fullPath, "utf-8");
        const manifest = JSON.parse(content);

        return `export default ${JSON.stringify(manifest, null, 2)};`;
      }
    },
  };
}

export default yaofPlugin;
