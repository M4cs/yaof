import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { yaofPlugin } from "@m4cs/yaof-sdk/vite";
import tailwindcss from "@tailwindcss/vite";
import { join } from "path";

export default defineConfig({
  plugins: [react(), yaofPlugin(), tailwindcss()],
  build: {
    outDir: "dist",
    commonjsOptions: {
      include: [/node_modules/, /@ogp-monorepo/],
      transformMixedEsModules: true,
      requireReturnsDefault: "auto",
      esmExternals: true,
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": join(__dirname, "./src"),
      "@yaof/ui": join(__dirname, "../../packages/ui/src"),
    },
  },
  optimizeDeps: {
    include: ["@yaof/ui"],
  },
});
