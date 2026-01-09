import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { yaofPlugin } from "@m4cs/yaof-sdk/vite";
import tailwindcss from "@tailwindcss/vite";
import { join } from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // ts-expect-error
    yaofPlugin(),
  ],
  build: {
    outDir: "dist",
  },
  clearScreen: false,
  resolve: {
    alias: {
      "@": join(__dirname, "src"),
    },
  },
});
