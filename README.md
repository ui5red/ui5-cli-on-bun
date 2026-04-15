# UI5 CLI on Bun

This repository is the standalone validation app for the custom Bun and UI5 CLI work.
It keeps the demo and test assets outside the two forks while verifying the important end-to-end paths: `ui5 build --all`, custom task execution, and `ui5 serve --h2` with custom middleware over HTTP/2.

## Installation

Run everything from this repository only:

```sh
git clone https://github.com/ui5red/ui5-cli-on-bun.git
cd ui5-cli-on-bun
npm install
npm run setup:forks
npm run bun:build:fork
```

`npm run setup:forks` clones the sibling `bun` and `cli` forks automatically if they are missing and installs the dependencies they need.

`npm run bun:build:fork` builds the custom Bun debug binary used by this validation app.

These setup steps require a Bun executable on your `PATH` to bootstrap the custom Bun fork build.
If you want to use a specific bootstrap Bun executable, set `BOOTSTRAP_BUN` before running the setup commands.

If you already have a Bun binary you want to test, set `BUN_FORK_BINARY` before running the commands below.

## Run

Run the full validation:

```sh
npm run smoke
```

Useful commands:

- `npm run smoke:build` checks the build path and verifies `dist/custom-task-marker.txt`
- `npm run smoke:serve:h2` checks the HTTP/2 serve path and verifies the middleware response header
- `npm run serve:h2` starts the sample app manually over HTTP/2
- `npm run ui5 -- --version` runs the UI5 CLI through the sibling Bun fork
