# YAOF - Yet Another Overlay Framework

YAOF is a cross-platform overlay framework that lets you create beautiful, easily configurable overlays for your desktop. It's built on top of [Tauri](https://tauri.app/) and [React](https://reactjs.org/) and provides a simple, intuitive API for building overlays.

## yaof is currently in development. In order to use it, you'll need to build it from source.

### [Preliminary Docs Available Here](https://yaof.gitbook.com/docs)

## Requirements

- Rust toolchain (install via [rustup](https://rustup.rs/))
- Node.js (v18+) OR Bun (recommended)

## Getting Started

Clone the repository and install dependencies:

```bash
git clone https://github.com/M4cs/yaof.git
cd yaof
bun i
bun run build
```

This will build the CLI and the runtime. You will find the binaries in the `target/release` directory. On MacOS, and app installer will most likely show up, the installer can be found in `target/release/bundle`.

## Running the CLI

```bash
# Show help
bun yaof --help

# Create a new plugin
bun yaof plugin init my-plugin

# Install plugin
bun yaof plugin add ./path/to/plugin --symlink

# List installed plugins
bun yaof plugin list

# Remove a plugin
bun yaof plugin remove my-plugin
```

# Contributing

A portion of this codebase has been writen with AI assistance. If there is anything that doesn't make sense, is clearly AI, or could be greatly optimized/improved, especially on the Rust side, please help out and contribute by making PRs with improvements!

Other than that, any and all PRs are welcome and will be reviewed.
