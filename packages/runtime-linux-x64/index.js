const path = require("path");
const fs = require("fs");

const BINARY_NAME =
  process.platform === "win32" ? "yaof-runtime.exe" : "yaof-runtime";
const binaryPath = path.join(__dirname, "bin", BINARY_NAME);

/**
 * Get the path to the YAOF runtime binary
 */
function getBinaryPath() {
  return binaryPath;
}

/**
 * Check if the binary exists and is executable
 */
function checkBinary() {
  if (!fs.existsSync(binaryPath)) {
    console.error(`YAOF runtime binary not found at: ${binaryPath}`);
    console.error("This package may not be compatible with your platform.");
    process.exit(1);
  }

  // On Unix, check if executable
  if (process.platform !== "win32") {
    try {
      fs.accessSync(binaryPath, fs.constants.X_OK);
    } catch {
      console.error(`YAOF runtime binary is not executable: ${binaryPath}`);
      console.error("Try running: chmod +x " + binaryPath);
      process.exit(1);
    }
  }

  console.log(`YAOF runtime binary found at: ${binaryPath}`);
}

// If run directly with --check flag, verify the binary
if (require.main === module && process.argv.includes("--check")) {
  checkBinary();
}

module.exports = { getBinaryPath, checkBinary };
