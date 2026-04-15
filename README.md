# UI5 CLI on Bun

This repository is the standalone validation app for the Bun-enabled UI5 CLI work.
It consumes the sibling `cli` and `bun` forks from the surrounding `bunnify` directory and keeps all demo-only assets here so those forks only contain the runtime and CLI changes that are required for Bun support.

## Can this repo auto-download the other two forks?

Not via a symlink.

Git symlinks only store a path string. They do not clone other repositories, GitHub does not resolve them into remote checkouts, and a cloned repo would just contain a symlink that points to a path that probably does not exist on the recipient machine.

The practical options are:

- explicit bootstrap script: recommended here, because one shared repo can clone the sibling `bun` and `cli` forks on demand
- git submodules: possible, but users still need `--recurse-submodules` or a follow-up submodule command, and the repo becomes pinned to exact commits of both forks

This repo now provides a bootstrap script for the first option:

```sh
npm run setup:forks
```

That script clones the default `ui5red/bun` and `ui5red/cli` forks as siblings of this repository if they are missing.

## Repositories used together

- Bun fork: <https://github.com/ui5red/bun>
- UI5 CLI fork: <https://github.com/ui5red/cli>
- Validation app: <https://github.com/ui5red/ui5-cli-on-bun>

## Expected layout

```text
bunnify/
  bun/
  cli/
  ui5-cli-on-bun/
```

The scripts default to `../bun` and `../cli`, but you can override them with these environment variables:

- `BUN_FORK_BINARY`: explicit path to a built Bun executable
- `BUN_REPO`: explicit path to the Bun fork checkout
- `UI5_CLI_REPO`: explicit path to the UI5 CLI fork checkout

## What this sample verifies

- `ui5 serve --h2` running through the sibling Bun fork
- custom middleware executed on the HTTP/2 response path
- custom build task executed during `ui5 build --all`

The middleware sets `x-bun-validation-middleware: active`.
The build task writes `custom-task-marker.txt` into the build output.

## Prerequisites

- macOS or Linux with a working C/C++ toolchain suitable for building the Bun fork
- Node.js `^22.20.0 || >=24.0.0`
- npm `>= 8`
- `openssl` available on the command line for local test certificates

This repo does not replace the Bun fork build instructions. It only assumes that you can produce a runnable Bun binary from the sibling Bun checkout.

## Installation

### Fast path: clone only this repo first

If you want to share only this repository link, users can start here:

```sh
git clone https://github.com/ui5red/ui5-cli-on-bun.git
cd ui5-cli-on-bun
npm run setup:forks
```

That creates sibling `../bun` and `../cli` checkouts automatically when they are not already present.

After that, continue with the dependency installation steps below.

### Manual path: clone all three repos yourself

1. Create a common parent directory and clone all three repositories as siblings:

```sh
mkdir -p ~/projects/bunnify
cd ~/projects/bunnify
git clone https://github.com/ui5red/bun.git
git clone https://github.com/ui5red/cli.git
git clone https://github.com/ui5red/ui5-cli-on-bun.git
```

1. Install dependencies in the UI5 CLI fork:

```sh
cd ~/projects/bunnify/cli
npm install
```

1. Build the sibling Bun fork.

The UI5 CLI fork already contains a helper script that builds the sibling Bun checkout from the expected layout:

```sh
cd ~/projects/bunnify/cli
npm run bun:build:fork
```

If you already have a specific Bun binary you want to test, you can skip that helper and set `BUN_FORK_BINARY` later.

1. Install dependencies in this validation app:

```sh
cd ~/projects/bunnify/ui5-cli-on-bun
npm install
```

If you used `npm run setup:forks`, adapt the paths above to wherever you cloned `ui5-cli-on-bun`.

## Running the validation app

Run the full validation suite:

```sh
cd ~/projects/bunnify/ui5-cli-on-bun
npm run smoke
```

That command runs both checks below:

- `npm run smoke:build`
  Verifies that `ui5 build --all` runs through the sibling Bun fork and that the custom task creates `dist/custom-task-marker.txt`.
- `npm run smoke:serve:h2`
  Starts `ui5 serve --h2` through the sibling Bun fork, performs an external Node HTTP/2 request against `/index.html`, and verifies the middleware response header.

Run only the build validation:

```sh
npm run smoke:build
```

Run only the HTTP/2 validation:

```sh
npm run smoke:serve:h2
```

Start the validation app manually over HTTP/2:

```sh
npm run serve:h2
```

Run arbitrary UI5 CLI commands through the sibling Bun fork:

```sh
npm run ui5 -- --version
npm run ui5 -- build --all --dest ./dist
npm run ui5 -- serve --h2 --key ./certs/server.key --cert ./certs/server.crt
```

## Overriding the sibling paths

If your repositories are not laid out exactly as siblings, set one or more of these variables before running the scripts:

- `UI5_CLI_REPO`: absolute path to the UI5 CLI fork checkout
- `BUN_REPO`: absolute path to the Bun fork checkout
- `BUN_FORK_BINARY`: absolute path to a prebuilt Bun executable
- `UI5_CLI_GIT_URL`: alternate git URL for the CLI fork used by `npm run setup:forks`
- `BUN_GIT_URL`: alternate git URL for the Bun fork used by `npm run setup:forks`

Example:

```sh
export UI5_CLI_REPO=/somewhere/cli
export BUN_REPO=/somewhere/bun
export BUN_FORK_BINARY=/somewhere/bun/build/debug/bun-debug
npm run smoke
```

## Files of interest

- `ui5.yaml`: validation app configuration with the custom middleware and custom task hooks
- `extensions/middleware`: middleware extension package used by the HTTP/2 smoke test
- `extensions/task`: task extension package used by the build smoke test
- `scripts/run-ui5-with-local-bun.mjs`: launches the UI5 CLI entrypoint through the sibling Bun binary
- `scripts/build-smoke.mjs`: verifies the build path and custom task output
- `scripts/serve-h2-smoke.mjs`: verifies the HTTP/2 serve path and middleware header
