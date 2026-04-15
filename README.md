# UI5 CLI on Bun

This repository is the standalone validation app for the custom Bun and UI5 CLI work.
It keeps the demo and test assets outside the two forks while verifying the important end-to-end paths: `ui5 build --all`, custom task execution, and `ui5 serve --h2` with custom middleware over HTTP/2.

Sibling forks used by this repo:

- Bun fork: [ui5red/bun](https://github.com/ui5red/bun)
- UI5 CLI fork: [ui5red/cli](https://github.com/ui5red/cli)

## Latest Comparison

Latest local runtime comparison (`npm run compare:fixtures`, 2026-04-15):

| Metric | Node | Bun | Delta |
| --- | ---: | ---: | ---: |
| Overall wall time | 33.50 s | 31.83 s | Bun faster by 1.67 s |
| Build total | 31.68 s | 30.03 s | Bun faster by 1.65 s |
| Build prepare | 10.49 s | 10.38 s | Bun faster by 0.11 s |
| Build `ui5` | 20.73 s | 19.22 s | Bun faster by 1.52 s |
| Serve | 1.09 s | 1.13 s | Node faster by 0.05 s |
| Parity | 0.64 s | 0.58 s | Bun faster by 0.06 s |

## Installation

Prerequisites:

- Node.js `^22.20.0 || >=24.0.0`
- `npm >= 8`
- Bun available on your `PATH`

If Bun is not installed yet:

```sh
curl -fsSL https://bun.sh/install | bash
```

From the `ui5-cli-on-bun` repository root, run:

```sh
git clone https://github.com/ui5red/ui5-cli-on-bun.git
cd ui5-cli-on-bun
npm install
npm run setup:forks
npm run bun:build:fork
```

`npm run setup:forks` clones the sibling `bun` and `cli` forks automatically if they are missing and installs the dependencies they need.

`npm run bun:build:fork` builds the custom Bun release binary used by this validation app.

These setup steps still require a Bun executable on your `PATH`, but only to bootstrap the Bun fork itself. The Bun repository uses `bun install` and `bun run build:release` before its own custom binary exists.

## Run

Start with the side-by-side runtime comparison:

```sh
npm run compare:fixtures
```

For a quick end-to-end sanity check, keep the smoke run:

```sh
npm run smoke
```


Useful commands:

- `npm run bun:build:fork:debug` builds a Bun debug binary when you explicitly need a debug executable
- `npm run bun:rebuild:fork` cleans Bun build artifacts and rebuilds the release binary
- `npm run test:fixtures` runs the fixture suite on the Bun fork against the CLI fork and prints per-step timings
- `npm run test:fixtures:node` runs the same fixture suite on Node against the CLI fork
- `npm run compare:fixtures` runs both runtimes back to back, prints wall-clock timing, phase totals, build subphase totals, and the biggest per-fixture deltas
- `npm run profile:fixture:bun -- --only project/application.h --repeat 3` reruns a selected Bun fixture step from a clean test state and prints min/avg/max timings plus build prep versus ui5 timing when applicable
- `npm run smoke:build` checks the build path and verifies `dist/custom-task-marker.txt`
- `npm run smoke:serve:h2` checks the HTTP/2 serve path and verifies the middleware response header
- `npm run serve:h2` starts the sample app manually over HTTP/2
- `npm run ui5 -- --version` runs the UI5 CLI through the sibling Bun fork

Target a subset of the suite with `--only` when you want to focus on a specific fixture step, for example `npm run test:fixtures -- --only project/application.h` or `npm run test:fixtures:node -- --only parity:fs/glob`.
