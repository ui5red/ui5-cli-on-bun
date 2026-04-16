# UI5 CLI on Bun

This repository is the standalone validation app for the custom Bun and UI5 CLI work.
It keeps the demo and test assets outside the two forks while verifying the important end-to-end paths: `ui5 build --all`, custom task execution, and `ui5 serve --h2` with custom middleware over HTTP/2.

Sibling forks used by this repo:

- Bun fork: [ui5red/bun](https://github.com/ui5red/bun)
- UI5 CLI fork: [ui5red/cli](https://github.com/ui5red/cli)

## Latest Comparison

Latest local runtime comparison (`npm run compare:fixtures`, 2026-04-16):

| Metric | Node | Bun | Delta |
| --- | ---: | ---: | ---: |
| Overall wall time | 49.40 s | 38.25 s | Bun faster by 11.15 s |
| Build total | 45.86 s | 36.03 s | Bun faster by 9.83 s |
| Build prepare | 15.83 s | 12.14 s | Bun faster by 3.69 s |
| Build `ui5` | 29.44 s | 23.39 s | Bun faster by 6.05 s |
| Serve | 2.56 s | 1.46 s | Bun faster by 1.10 s |
| Parity | 0.86 s | 0.66 s | Bun faster by 0.20 s |

## Installation

Prerequisites:

- Node.js `^22.20.0 || >=24.0.0`
- `npm >= 8`
- Bun available on your `PATH`

If Bun is not installed yet:

```sh
curl -fsSL https://bun.sh/install | bash
```

Then clone this repository and run the setup commands:

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

## Experiment Summary

This repository validates coordinated changes across the sibling UI5 CLI fork, the sibling Bun fork, and this standalone app.

UI5 CLI fork:

- Added a Bun-native HTTP/1 serve path so `ui5 serve` can use Bun's server stack while preserving the existing middleware contract.
- Restored Bun-specific non-worker execution for `minify` and `buildThemes` after profiling showed the worker-based path was the main source of Bun build regressions.
- Kept the graph-driven build and the existing UI5 LBT bundling pipeline in place. We evaluated whether Bun-native bundling could replace that path and did not take it forward as the main plan.

Bun fork:

- The validation flow now targets Bun release binaries for fair comparisons instead of accidentally picking debug builds.
- Serve-side evaluation showed Bun is a good fit for the HTTP server path, especially for the native HTTP/1 experiment that is now covered by smoke tests.

Validation app:

- Added copied fixture coverage, runtime comparison commands, focused profiling commands, smoke checks for build, theme, workspace, and native serve behavior, plus a theme-heavy builder fixture.
- Added a narrow self-contained bundler spike with `npm run spike:self-contained-bundler` to compare a real UI5 self-contained build against a dedicated Bun.build HTML+ESM bundle.

Observations:

- Switching the serve path to Bun was worth pursuing because it improved the Bun-native serve path without changing the UI5 middleware model used by this repo.
- Native Bun build is not the general build direction for this experiment. UI5's main build path is graph- and resource-driven, and preload/custom bundles rely on UI5-specific semantics that do not map cleanly to `Bun.build`.
- The self-contained spike is intentionally narrow: Bun.build handled the dedicated ESM example naturally, while the current UI5 self-contained bundler logged parse errors for ESM `import` and `export` and emitted only a minimal preload-oriented bundle. That makes it useful as a boundary check, not as a drop-in replacement plan.

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
- `npm run profile:build-variant:bun -- --fixture builder/theme.heavy.library --repeat 3 --css-variables` profiles one build fixture repeatedly, supports task filtering like `--include-task` or `--exclude-task`, and can switch to self-contained mode with `--self-contained`
- `npm run spike:self-contained-bundler` compares a UI5 self-contained build against a narrow Bun.build HTML+ESM spike and prints the structural difference
- `npm run smoke:build` checks the build path and verifies `dist/custom-task-marker.txt`
- `npm run smoke:theme` checks a theme-heavy library build and verifies CSS variable output
- `npm run smoke:workspace` builds and serves the local workspace example to verify cross-project resolution
- `npm run smoke:serve:native` checks the native Bun HTTP/1 serve path and verifies the middleware response header
- `npm run smoke:serve:h2` checks the HTTP/2 serve path and verifies the middleware response header
- `npm run serve:h2` starts the sample app manually over HTTP/2
- `npm run ui5 -- --version` runs the UI5 CLI through the sibling Bun fork

Target a subset of the suite with `--only` when you want to focus on a specific fixture step, for example `npm run test:fixtures -- --only project/application.h` or `npm run test:fixtures:node -- --only parity:fs/glob`.

## Controlled Examples

This repository now includes example projects under `examples/` that are fully under local control and run through the sibling Bun fork plus the sibling UI5 CLI fork.

### Example 1: Custom App

`examples/custom-app` is a small application that uses the local validation middleware and task packages.

- `npm run example:custom-app:serve` serves the app and exposes the `X-Bun-Validation-Middleware: active` response header
- `npm run example:custom-app:build` runs a full build and emits `dist/custom-task-marker.txt`

### Example 2: Library Workspace

`examples/library-workspace` contains a library plus an application that resolves that library through `ui5-workspace.yaml`.

- `npm run example:library:build` builds the standalone library example
- `npm run example:workspace-app:serve` serves the application and resolves `/resources/ui5bun/example/library/message.txt` from the sibling library
- `npm run example:workspace-app:build` builds the application together with the local library dependency

### Example 3: Sample TypeScript App

`examples/sample.ts.app` is a generated OpenUI5 TypeScript application that is kept under local control and exercised through the sibling Bun fork plus the sibling UI5 CLI fork.

- `npm run example:sample-ts-app:serve` serves the app from the local forks and opens the sample UI
- `npm run example:sample-ts-app:build` runs a full dependency-inclusive build and keeps the real `buildThemes` path active for the framework libraries and theme library

To compare the same controlled example against Node while still using the same forked UI5 CLI, reuse the same scripts with `UI5_RUNTIME_MODE=node`, for example:

```sh
UI5_RUNTIME_MODE=node npm run example:custom-app:build
UI5_RUNTIME_MODE=node npm run example:workspace-app:serve
```

These examples are the recommended way to verify that the forked Bun runtime and forked UI5 CLI can build and serve both application and library-style projects without changing an external application under test.

### Example 4: Self-Contained Bundler Spike

`examples/self-contained-bundler-spike` is a deliberately small HTML+ESM app used only to compare a UI5 self-contained build against `Bun.build` on a source shape that Bun can bundle natively.

- `npm run spike:self-contained-bundler` runs both paths and prints the emitted bundle locations, sizes, timings, and the key observation
- This example is intentionally not part of the main fixture suite because it is an architecture spike, not a compatibility target for the broader UI5 validation matrix
