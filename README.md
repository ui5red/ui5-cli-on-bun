# UI5 CLI on Bun

This repository is the standalone validation app for the custom Bun and UI5 CLI work.
It keeps the demo and test assets outside the two forks while verifying the important end-to-end paths: `ui5 build --all`, custom task execution, and `ui5 serve --h2` with custom middleware over HTTP/2.

Sibling forks used by this repo:

- Bun fork: [ui5red/bun](https://github.com/ui5red/bun)
- UI5 CLI fork: [ui5red/cli](https://github.com/ui5red/cli)

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

If `.env.local` does not exist yet, `npm run setup:forks` also creates it automatically with a repo-local `BOOTSTRAP_BUN` entry that points to the Bun executable currently available on your `PATH`.

`npm run bun:build:fork` builds the custom Bun release binary used by this validation app.

These setup steps require a Bun executable to bootstrap the custom Bun fork build.

If you want to keep that bootstrap Bun path local to this validation app only, you can also create or edit `.env.local` yourself with:

```sh
BOOTSTRAP_BUN=/absolute/path/to/your/existing/bun
```

The scripts in `ui5-cli-on-bun` read `.env.local` automatically. The file is gitignored, it affects only this repository, and it does not modify your global shell environment or any other Bun setup.

If `BOOTSTRAP_BUN` is not set in `.env.local` or in the command environment, the scripts fall back to `bun` from your `PATH`.

If you already have a Bun binary you want to test, set `BUN_FORK_BINARY` before running the commands below.

## Run

Run the full validation:

```sh
npm run smoke
```

Useful commands:

- `npm run bun:build:fork:debug` builds a Bun debug binary when you explicitly need a debug executable
- `npm run bun:rebuild:fork` cleans Bun build artifacts and rebuilds the release binary
- `npm run test:fixtures` runs the fixture suite on the Bun fork against the CLI fork and prints per-step timings
- `npm run test:fixtures:node` runs the same fixture suite on Node against the CLI fork
- `npm run compare:fixtures` runs both runtimes back to back, prints wall-clock timing, phase totals, and the biggest per-fixture deltas
- `npm run profile:fixture:bun -- --only project/application.h --repeat 3` reruns a selected Bun fixture step from a clean test state and prints min/avg/max timings
- `npm run smoke:build` checks the build path and verifies `dist/custom-task-marker.txt`
- `npm run smoke:serve:h2` checks the HTTP/2 serve path and verifies the middleware response header
- `npm run serve:h2` starts the sample app manually over HTTP/2
- `npm run ui5 -- --version` runs the UI5 CLI through the sibling Bun fork

Target a subset of the suite with `--only` when you want to focus on a specific fixture step, for example `npm run test:fixtures -- --only project/application.h` or `npm run test:fixtures:node -- --only parity:fs/glob`.
