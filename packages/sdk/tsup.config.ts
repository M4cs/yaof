import { defineConfig } from "tsup";

export default defineConfig({
  outDir: "./dist",
  entry: {
    index: "./src/index.ts",
    "vite/plugin": "./src/vite/plugin.ts",
  },
  dts: true,
  format: ["esm"],
  minify: true,
  sourcemap: true,
  external: [
    "react",
    "react-dom",
    "@tauri-apps/core",
    "@tauri-apps/api",
    "vite",
    "fs",
    "path",
  ],
});
