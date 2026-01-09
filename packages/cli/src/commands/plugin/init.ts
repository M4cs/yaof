import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "fs-extra";
import { join } from "node:path";

export type PluginType = "react" | "rust" | "both";

export const initCommand = new Command("init")
  .description("Create a new YAOF plugin")
  .argument("[name]", "Plugin name")
  .option("-t, --type <type>", "Plugin type: react, rust, or both")
  .action(async (name, options) => {
    p.intro(pc.bgCyan(pc.black(" YAOF Plugin Creator ")));

    const pluginName =
      name ||
      (await p.text({
        message: "Name of plugin:",
        placeholder: "my-plugin",
        validate: (v) => {
          if (!v) return "Plugin name is required";
          if (!/^[a-z0-9-]+$/.test(v)) {
            return "Use lowercase letters, numbers, and hyphens only";
          }
        },
      }));

    if (p.isCancel(pluginName)) {
      p.cancel("Plugin creation cancelled");
      process.exit(0);
    }

    const pluginType: PluginType =
      options.type ||
      ((await p.select({
        message: "Select plugin type",
        options: [
          {
            value: "react",
            label: "React",
            hint: "UI overlay only (React + TypeScript)",
          },
          {
            value: "rust",
            label: "Rust",
            hint: "Service/backend only (native Rust plugin)",
          },
          {
            value: "both",
            label: "Both",
            hint: "React UI + Rust service (hybrid plugin)",
          },
        ],
      })) as PluginType);

    if (p.isCancel(pluginType)) {
      p.cancel("Operation cancelled");
      process.exit(0);
    }

    const spinner = p.spinner();
    spinner.start("Creating plugin...");

    try {
      const pluginDir = join(process.cwd(), pluginName as string);

      // Create directory
      await fs.ensureDir(pluginDir);

      switch (pluginType) {
        case "react":
          await createReactPlugin(pluginDir, pluginName as string);
          break;
        case "rust":
          await createRustPlugin(pluginDir, pluginName as string);
          break;
        case "both":
          await createHybridPlugin(pluginDir, pluginName as string);
          break;
      }

      spinner.stop("Plugin created!");

      // Show next steps based on plugin type
      const nextSteps = getNextSteps(pluginType, pluginName as string);
      p.note(nextSteps, "Next steps:");
      p.outro(pc.green("Happy coding! 🎉"));
    } catch (error) {
      spinner.stop("Failed to create plugin");
      p.log.error(String(error));
      process.exit(1);
    }
  });

function getNextSteps(type: PluginType, name: string): string {
  switch (type) {
    case "react":
      return `cd ${name}\nbun install\nbun run dev`;
    case "rust":
      return `cd ${name}\ncargo build --release\nyaof plugin add .`;
    case "both":
      return `cd ${name}\nbun install\ncargo build --release\nbun run dev`;
  }
}

// Convert plugin name to Rust crate name (underscores instead of hyphens)
function toRustCrateName(name: string): string {
  return name.replace(/-/g, "_");
}

// Convert plugin name to Rust struct name (PascalCase)
function toRustStructName(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

async function createReactPlugin(pluginDir: string, pluginName: string) {
  await fs.ensureDir(join(pluginDir, "src"));

  // Create overlay.json manifest
  const manifest = {
    id: pluginName,
    name: pluginName,
    version: "0.1.0",
    entry: "dist/index.html",
    overlays: {
      main: {
        width: 300,
        height: 200,
        defaultPosition: "center",
        clickThrough: false,
        frameless: true,
      },
    },
    provides: [],
    consumes: [],
    permissions: [],
  };

  await fs.writeJson(join(pluginDir, "overlay.json"), manifest, {
    spaces: 2,
  });

  // Create package.json
  const packageJson = {
    name: pluginName,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      watch: "vite build --watch",
      build: "tsc && vite build",
    },
    dependencies: {
      "@tailwindcss/vite": "^4.1.18",
      "@m4cs/yaof-sdk": "latest",
      react: "^19.2.3",
      "react-dom": "^19.2.3",
      tailwindcss: "^4.1.18",
      "tw-animate-css": "^1.4.0",
      zod: "^4.3.4",
    },
    devDependencies: {
      "@types/react": "^19.2.7",
      "@types/react-dom": "^19.2.3",
      "@vitejs/plugin-react": "^5.1.2",
      typescript: "^5.9.3",
      vite: "^7.3.0",
    },
  };

  await fs.writeJson(join(pluginDir, "package.json"), packageJson, {
    spaces: 2,
  });

  // Create main component
  const appContent = `import { useOverlay, usePosition } from "@m4cs/yaof-sdk";

function App() {
  const { setClickThrough, isVisible } = useOverlay();
  const { setPreset } = usePosition();

  return (
    <div className="overlay">
      <h1>Hello from ${pluginName}!</h1>
      <button onClick={() => setPreset("center")}>Center</button>
    </div>
  );
}

export default App;
`;

  await fs.writeFile(join(pluginDir, "src", "App.tsx"), appContent);

  // Create index.html
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${pluginName}</title>
    <style>
      body { margin: 0; background: transparent; }
      .overlay {
        padding: 16px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        border-radius: 8px;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

  await fs.writeFile(join(pluginDir, "index.html"), indexHtml);

  // Create main.tsx
  const mainContent = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OverlayProvider } from "@m4cs/yaof-sdk";
import manifest from "virtual:yaof-manifest";
import App from "./App";
import "./App.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OverlayProvider manifest={manifest} overlayId="${pluginName}-main">
      <App />
    </OverlayProvider>
  </StrictMode>
);
`;

  await fs.writeFile(join(pluginDir, "src", "main.tsx"), mainContent);

  const viteConfigContent = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { yaofPlugin } from "@m4cs/yaof-sdk/vite";

export default defineConfig({
  plugins: [react(), yaofPlugin()],
  build: {
    outDir: "dist",
  },
  clearScreen: false,
});
`;

  await fs.writeFile(join(pluginDir, "vite.config.ts"), viteConfigContent);

  const viteEnvContent = `/// <reference types="vite/client" />

// Declaration for virtual:yaof-manifest
declare module "virtual:yaof-manifest" {
  import type { PluginManifest } from "@m4cs/yaof-sdk";
  const manifest: PluginManifest;
  export default manifest;
}
`;

  await fs.writeFile(join(pluginDir, "src/vite-env.d.ts"), viteEnvContent);

  const tsconfigContent = `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "rootDir": "./src",
    "outDir": "./dist",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}`;

  await fs.writeFile(join(pluginDir, "tsconfig.json"), tsconfigContent);

  const appCssContent = `@import "tailwindcss";
@import "tw-animate-css";

@source "./**/*.{.ts,.tsx,.css,.scss,.sass,.less,.styl}";

@layer base {
  html,
  body {
    @apply bg-transparent;
  }
}`;

  await fs.writeFile(join(pluginDir, "src", "App.css"), appCssContent);

  const pluginConfigContent = `import { z } from "zod";

/**
 * ${pluginName} plugin configuration schema.
 * Uses Zod v4 for type-safe configuration with defaults.
 */
export const ${pluginName.split("-").join("_")}ConfigSchema = z.object({}});

/** Inferred type from the config schema */
export type ${pluginName
    .split("-")
    .join("_")}ConfigSchema = z.infer<typeof ${pluginName
    .split("-")
    .join("_")}ConfigSchema>;
`;

  await fs.writeFile(join(pluginDir, "src", "config.ts"), pluginConfigContent);
}

async function createRustPlugin(pluginDir: string, pluginName: string) {
  await fs.ensureDir(join(pluginDir, "src"));

  const crateName = toRustCrateName(pluginName);
  const structName = toRustStructName(pluginName);

  // Create overlay.json manifest
  const manifest = {
    id: pluginName,
    name: pluginName,
    version: "0.1.0",
    entry: "",
    native: {
      platforms: ["darwin-arm64", "darwin-x64", "linux-x64", "win32-x64"],
      libraries: {
        "darwin-arm64": `target/aarch64-apple-darwin/release/lib${crateName}.dylib`,
        "darwin-x64": `target/x86_64-apple-darwin/release/lib${crateName}.dylib`,
        "linux-x64": `target/x86_64-unknown-linux-gnu/release/lib${crateName}.so`,
        "win32-x64": `target/x86_64-pc-windows-msvc/release/${crateName}.dll`,
      },
    },
    provides: [
      {
        id: pluginName,
        schema: {
          type: "object",
          properties: {
            message: { type: "string" },
          },
          required: ["message"],
        },
      },
    ],
    consumes: [],
    permissions: [],
  };

  await fs.writeJson(join(pluginDir, "overlay.json"), manifest, {
    spaces: 2,
  });

  // Create Cargo.toml
  const cargoToml = `[package]
name = "${crateName}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
yaof-plugin = { git = "https://github.com/M4cs/yaof.git" }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

[profile.release]
opt-level = 3
lto = true
`;

  await fs.writeFile(join(pluginDir, "Cargo.toml"), cargoToml);

  // Create src/lib.rs
  const libRs = `//! ${pluginName} - A YAOF native plugin
//!
//! This plugin provides the "${pluginName}" service.

use yaof_plugin::{declare_plugin, Context, NativePlugin};
use serde_json::json;

/// The main plugin struct
pub struct ${structName} {
    tick_count: u32,
}

impl ${structName} {
    pub fn new() -> Self {
        Self { tick_count: 0 }
    }
}

impl NativePlugin for ${structName} {
    /// Called periodically by the runtime
    fn tick(&mut self, ctx: &Context) -> i32 {
        self.tick_count += 1;
        
        // Emit service data every 10 ticks (10 seconds at default interval)
        if self.tick_count % 10 == 0 {
            let data = json!({
                "message": format!("Hello from ${pluginName}! Tick: {}", self.tick_count)
            });
            
            if let Err(e) = ctx.emit("${pluginName}", &data) {
                ctx.error(&format!("Failed to emit event: {}", e));
                return e;
            }
        }
        
        0
    }

    /// Called when the plugin is being unloaded
    fn shutdown(&mut self, ctx: &Context) {
        ctx.info("${structName} shutting down");
    }

    /// Handle messages from the frontend
    fn handle_message(&mut self, ctx: &Context, msg_type: &str, payload: &[u8]) -> i32 {
        ctx.debug(&format!("Received message: {} ({} bytes)", msg_type, payload.len()));
        
        match msg_type {
            "ping" => {
                ctx.info("Received ping!");
                0
            }
            _ => {
                ctx.warn(&format!("Unknown message type: {}", msg_type));
                -1
            }
        }
    }
}

// Declare the plugin entry point
declare_plugin!(${structName}, |ctx| {
    ctx.info("${structName} initialized!");
    Ok(${structName}::new())
});
`;

  await fs.writeFile(join(pluginDir, "src", "lib.rs"), libRs);

  // Create .gitignore
  const gitignore = `/target
Cargo.lock
`;

  await fs.writeFile(join(pluginDir, ".gitignore"), gitignore);

  // Create README.md
  const readme = `# ${pluginName}

A YAOF native plugin written in Rust.

## Building

### For your current platform

\`\`\`bash
cargo build --release
\`\`\`

### Cross-compilation

To build for other platforms, you'll need the appropriate Rust targets installed:

\`\`\`bash
# macOS ARM64
rustup target add aarch64-apple-darwin
cargo build --release --target aarch64-apple-darwin

# macOS x64
rustup target add x86_64-apple-darwin
cargo build --release --target x86_64-apple-darwin

# Linux x64
rustup target add x86_64-unknown-linux-gnu
cargo build --release --target x86_64-unknown-linux-gnu

# Windows x64
rustup target add x86_64-pc-windows-msvc
cargo build --release --target x86_64-pc-windows-msvc
\`\`\`

## Installing

After building, install the plugin:

\`\`\`bash
yaof plugin add .
\`\`\`

## Service Schema

This plugin provides the \`${pluginName}\` service with the following schema:

\`\`\`json
{
  "type": "object",
  "properties": {
    "message": { "type": "string" }
  },
  "required": ["message"]
}
\`\`\`

## Usage in React

\`\`\`tsx
import { useService } from "@m4cs/yaof-sdk";

function MyComponent() {
  const { data, isConnected } = useService("${pluginName}");
  
  return (
    <div>
      {isConnected ? data?.message : "Connecting..."}
    </div>
  );
}
\`\`\`
`;

  await fs.writeFile(join(pluginDir, "README.md"), readme);
}

async function createHybridPlugin(pluginDir: string, pluginName: string) {
  await fs.ensureDir(join(pluginDir, "src"));
  await fs.ensureDir(join(pluginDir, "native", "src"));

  const crateName = toRustCrateName(pluginName);
  const structName = toRustStructName(pluginName);

  // Create overlay.json manifest
  const manifest = {
    id: pluginName,
    name: pluginName,
    version: "0.1.0",
    entry: "dist/index.html",
    overlays: {
      main: {
        width: 400,
        height: 300,
        defaultPosition: "center",
        clickThrough: false,
        frameless: true,
      },
    },
    native: {
      platforms: ["darwin-arm64", "darwin-x64", "linux-x64", "win32-x64"],
      libraries: {
        "darwin-arm64": `native/target/aarch64-apple-darwin/release/lib${crateName}.dylib`,
        "darwin-x64": `native/target/x86_64-apple-darwin/release/lib${crateName}.dylib`,
        "linux-x64": `native/target/x86_64-unknown-linux-gnu/release/lib${crateName}.so`,
        "win32-x64": `native/target/x86_64-pc-windows-msvc/release/${crateName}.dll`,
      },
    },
    provides: [
      {
        id: pluginName,
        schema: {
          type: "object",
          properties: {
            count: { type: "number" },
            message: { type: "string" },
          },
          required: ["count", "message"],
        },
      },
    ],
    consumes: [],
    permissions: [],
  };

  await fs.writeJson(join(pluginDir, "overlay.json"), manifest, {
    spaces: 2,
  });

  // Create package.json
  const packageJson = {
    name: pluginName,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc && vite build",
      "build:native": "cd native && cargo build --release",
      "build:all": "npm run build:native && npm run build",
    },
    dependencies: {
      "@tailwindcss/vite": "^4.1.18",
      "@m4cs/yaof-sdk": "latest",
      react: "^19.2.3",
      "react-dom": "^19.2.3",
      tailwindcss: "^4.1.18",
      "tw-animate-css": "^1.4.0",
    },
    devDependencies: {
      "@types/react": "^19.2.7",
      "@types/react-dom": "^19.2.3",
      "@vitejs/plugin-react": "^5.1.2",
      typescript: "^5.9.3",
      vite: "^7.3.0",
    },
  };

  await fs.writeJson(join(pluginDir, "package.json"), packageJson, {
    spaces: 2,
  });

  // Create main component that uses the service
  const appContent = `import { useOverlay, usePosition, useService } from "@m4cs/yaof-sdk";

interface ServiceData {
  count: number;
  message: string;
}

function App() {
  const { setClickThrough, isVisible } = useOverlay();
  const { setPreset } = usePosition();
  const { data, isConnected } = useService<ServiceData>("${pluginName}");

  return (
    <div className="overlay p-4 bg-black/80 text-white rounded-lg">
      <h1 className="text-xl font-bold mb-4">${pluginName}</h1>
      
      <div className="mb-4">
        <p className="text-sm text-gray-400">Service Status:</p>
        <p className={isConnected ? "text-green-400" : "text-yellow-400"}>
          {isConnected ? "Connected" : "Connecting..."}
        </p>
      </div>

      {data && (
        <div className="mb-4">
          <p className="text-sm text-gray-400">Service Data:</p>
          <p>Count: {data.count}</p>
          <p>Message: {data.message}</p>
        </div>
      )}

      <button 
        onClick={() => setPreset("center")}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
      >
        Center Window
      </button>
    </div>
  );
}

export default App;
`;

  await fs.writeFile(join(pluginDir, "src", "App.tsx"), appContent);

  // Create index.html
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${pluginName}</title>
  </head>
  <body class="bg-transparent">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

  await fs.writeFile(join(pluginDir, "index.html"), indexHtml);

  // Create main.tsx
  const mainContent = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OverlayProvider } from "@m4cs/yaof-sdk";
import manifest from "virtual:yaof-manifest";
import App from "./App";
import "./App.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OverlayProvider manifest={manifest} overlayId="${pluginName}-main">
      <App />
    </OverlayProvider>
  </StrictMode>
);
`;

  await fs.writeFile(join(pluginDir, "src", "main.tsx"), mainContent);

  const viteConfigContent = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { yaofPlugin } from "@m4cs/yaof-sdk/vite";

export default defineConfig({
  plugins: [react(), yaofPlugin()],
  build: {
    outDir: "dist",
  },
  clearScreen: false,
});
`;

  await fs.writeFile(join(pluginDir, "vite.config.ts"), viteConfigContent);

  const viteEnvContent = `/// <reference types="vite/client" />

// Declaration for virtual:yaof-manifest
declare module "virtual:yaof-manifest" {
  import type { PluginManifest } from "@m4cs/yaof-sdk";
  const manifest: PluginManifest;
  export default manifest;
}
`;

  await fs.writeFile(join(pluginDir, "src/vite-env.d.ts"), viteEnvContent);

  const tsconfigContent = `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "rootDir": "./src",
    "outDir": "./dist",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "native"]
}`;

  await fs.writeFile(join(pluginDir, "tsconfig.json"), tsconfigContent);

  const pluginConfigContent = `import { z } from "zod";

/**
 * ${pluginName} plugin configuration schema.
 * Uses Zod v4 for type-safe configuration with defaults.
 */
export const ${pluginName.split("-").join("_")}ConfigSchema = z.object({}});

/** Inferred type from the config schema */
export type ${pluginName
    .split("-")
    .join("_")}ConfigSchema = z.infer<typeof ${pluginName
    .split("-")
    .join("_")}ConfigSchema>;
`;

  await fs.writeFile(join(pluginDir, "src", "config.ts"), pluginConfigContent);

  const appCssContent = `@import "tailwindcss";
@import "tw-animate-css";

@source "./**/*.{.ts,.tsx,.css,.scss,.sass,.less,.styl}";

@layer base {
  html,
  body {
    @apply bg-transparent;
  }
}`;

  await fs.writeFile(join(pluginDir, "src", "App.css"), appCssContent);

  // Create native/Cargo.toml
  const cargoToml = `[package]
name = "${crateName}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
yaof-plugin = { git = "https://github.com/M4cs/yaof.git" }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

[profile.release]
opt-level = 3
lto = true
`;

  await fs.writeFile(join(pluginDir, "native", "Cargo.toml"), cargoToml);

  // Create native/src/lib.rs
  const libRs = `//! ${pluginName} - Native service for the hybrid plugin
//!
//! This provides the backend service that the React frontend consumes.

use yaof_plugin::{declare_plugin, Context, NativePlugin};
use serde_json::json;

/// The main plugin struct
pub struct ${structName} {
    count: u32,
}

impl ${structName} {
    pub fn new() -> Self {
        Self { count: 0 }
    }
}

impl NativePlugin for ${structName} {
    /// Called periodically by the runtime
    fn tick(&mut self, ctx: &Context) -> i32 {
        self.count += 1;
        
        // Emit service data every tick
        let data = json!({
            "count": self.count,
            "message": format!("Service running for {} seconds", self.count)
        });
        
        if let Err(e) = ctx.emit("${pluginName}", &data) {
            ctx.error(&format!("Failed to emit event: {}", e));
            return e;
        }
        
        0
    }

    /// Called when the plugin is being unloaded
    fn shutdown(&mut self, ctx: &Context) {
        ctx.info("${structName} service shutting down");
    }

    /// Handle messages from the frontend
    fn handle_message(&mut self, ctx: &Context, msg_type: &str, payload: &[u8]) -> i32 {
        ctx.debug(&format!("Received message: {} ({} bytes)", msg_type, payload.len()));
        
        match msg_type {
            "reset" => {
                self.count = 0;
                ctx.info("Counter reset!");
                0
            }
            _ => {
                ctx.warn(&format!("Unknown message type: {}", msg_type));
                -1
            }
        }
    }
}

// Declare the plugin entry point
declare_plugin!(${structName}, |ctx| {
    ctx.info("${structName} service initialized!");
    Ok(${structName}::new())
});
`;

  await fs.writeFile(join(pluginDir, "native", "src", "lib.rs"), libRs);

  // Create .gitignore
  const gitignore = `node_modules/
dist/
native/target/
*.lock
`;

  await fs.writeFile(join(pluginDir, ".gitignore"), gitignore);

  // Create README.md
  const readme = `# ${pluginName}

A hybrid YAOF plugin with React frontend and Rust backend service.

## Project Structure

\`\`\`
${pluginName}/
├── overlay.json      # Plugin manifest
├── package.json      # React frontend dependencies
├── src/              # React frontend source
│   ├── App.tsx
│   ├── main.tsx
│   └── App.css
├── native/           # Rust backend service
│   ├── Cargo.toml
│   └── src/
│       └── lib.rs
└── vite.config.ts
\`\`\`

## Building

### Build everything

\`\`\`bash
bun run build:all
\`\`\`

### Build frontend only

\`\`\`bash
bun run build
\`\`\`

### Build native service only

\`\`\`bash
bun run build:native
# or
cd native && cargo build --release
\`\`\`

### Cross-compilation for native service

\`\`\`bash
cd native

# macOS ARM64
rustup target add aarch64-apple-darwin
cargo build --release --target aarch64-apple-darwin

# macOS x64
rustup target add x86_64-apple-darwin
cargo build --release --target x86_64-apple-darwin

# Linux x64
rustup target add x86_64-unknown-linux-gnu
cargo build --release --target x86_64-unknown-linux-gnu

# Windows x64
rustup target add x86_64-pc-windows-msvc
cargo build --release --target x86_64-pc-windows-msvc
\`\`\`

## Development

\`\`\`bash
# Start the React dev server
bun run dev

# In another terminal, build and install the native service
cd native && cargo build --release
yaof plugin add ..
\`\`\`

## Service Schema

This plugin provides the \`${pluginName}\` service with the following schema:

\`\`\`json
{
  "type": "object",
  "properties": {
    "count": { "type": "number" },
    "message": { "type": "string" }
  },
  "required": ["count", "message"]
}
\`\`\`
`;

  await fs.writeFile(join(pluginDir, "README.md"), readme);
}
