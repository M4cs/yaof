#!/usr/bin/env bun
/**
 * Publish script for YAOF packages to npm
 *
 * Usage:
 *   bun run scripts/publish.ts           # Publish all packages (dry-run)
 *   bun run scripts/publish.ts --execute # Actually publish to npm
 *   bun run scripts/publish.ts --cli     # Only publish CLI package
 */

import { $ } from "bun";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";

// All packages to publish (in order)
const PACKAGES = [
  // Runtime packages first (they're dependencies of CLI)
  "runtime-darwin-arm64",
  "runtime-darwin-x64",
  "runtime-linux-x64",
  "runtime-win32-x64",
  // Then CLI
  "cli",
  // Then SDK
  "sdk",
];

interface PackageJson {
  name: string;
  version: string;
}

async function publishPackage(
  packageDir: string,
  dryRun: boolean
): Promise<boolean> {
  const packageJsonPath = join(packageDir, "package.json");

  if (!existsSync(packageJsonPath)) {
    console.error(`❌ package.json not found in ${packageDir}`);
    return false;
  }

  const packageJson: PackageJson = JSON.parse(
    readFileSync(packageJsonPath, "utf-8")
  );

  console.log(`\n📦 Publishing ${packageJson.name}@${packageJson.version}...`);

  // Check if bin directory exists for runtime packages
  if (packageDir.includes("runtime-")) {
    const binDir = join(packageDir, "bin");
    if (!existsSync(binDir)) {
      console.error(`❌ bin directory not found in ${packageDir}`);
      console.error("   Run 'bun run scripts/build-runtime.ts' first");
      return false;
    }
  }

  try {
    if (dryRun) {
      console.log(
        "   (dry-run) Would publish with: npm publish --access public"
      );
      await $`npm publish --dry-run --access public`.cwd(packageDir);
    } else {
      await $`npm publish --access public`.cwd(packageDir);
    }
    console.log(`✅ Published ${packageJson.name}@${packageJson.version}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to publish ${packageJson.name}:`, error);
    return false;
  }
}

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      execute: { type: "boolean", default: false },
      cli: { type: "boolean", default: false },
      runtime: { type: "boolean", default: false },
      sdk: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
YAOF Package Publish Script

Usage:
  bun run scripts/publish.ts [options]

Options:
  --execute       Actually publish to npm (default is dry-run)
  --cli           Only publish the CLI package
  --runtime       Only publish runtime packages
  --sdk           Only publish the SDK package
  -h, --help      Show this help message

Examples:
  bun run scripts/publish.ts              # Dry-run all packages
  bun run scripts/publish.ts --execute    # Publish all packages
  bun run scripts/publish.ts --cli        # Dry-run CLI only
`);
    return;
  }

  const projectRoot = join(import.meta.dir, "..");
  const dryRun = !values.execute;

  console.log("🚀 YAOF Package Publish Script");
  console.log(`   Mode: ${dryRun ? "DRY-RUN" : "LIVE PUBLISH"}`);

  if (dryRun) {
    console.log("   (Use --execute to actually publish)");
  }

  // Determine which packages to publish
  let packagesToPublish: string[] = [];

  if (values.cli) {
    packagesToPublish = ["cli"];
  } else if (values.runtime) {
    packagesToPublish = PACKAGES.filter((p) => p.startsWith("runtime-"));
  } else if (values.sdk) {
    packagesToPublish = ["sdk"];
  } else {
    packagesToPublish = PACKAGES;
  }

  const results: Record<string, boolean> = {};

  for (const pkg of packagesToPublish) {
    const packageDir = join(projectRoot, "packages", pkg);
    results[pkg] = await publishPackage(packageDir, dryRun);
  }

  // Summary
  console.log("\n📊 Publish Summary:");
  for (const [pkg, success] of Object.entries(results)) {
    console.log(`   ${success ? "✅" : "❌"} @m4cs/yaof-${pkg}`);
  }

  const allSuccess = Object.values(results).every((v) => v);

  if (dryRun && allSuccess) {
    console.log("\n✨ Dry-run completed successfully!");
    console.log("   Run with --execute to publish for real.");
  }

  process.exit(allSuccess ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
