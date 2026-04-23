# UI5 CLI on Bun

This repository is the standalone validation app for the custom Bun and UI5 CLI work.
It keeps the demo and test assets outside the two forks while verifying the important end-to-end paths: `ui5 build --all`, custom task execution, and `ui5 serve --h2` with custom middleware over HTTP/2.

Sibling forks used by this repo:

- Bun fork: [ui5red/bun](https://github.com/ui5red/bun)
- UI5 CLI fork: [ui5red/cli](https://github.com/ui5red/cli)

## Latest Comparison

Latest local runtime comparison (`npm run compare:fixtures`, 2026-04-23, Bun `1.3.13`):

| Metric | Node | Bun | Delta |
| --- | ---: | ---: | ---: |
| Overall wall time | 40.30 s | 30.73 s | Bun faster by 9.57 s |
| Build total | 36.77 s | 28.99 s | Bun faster by 7.78 s |
| Build prepare | 10.54 s | 9.66 s | Bun faster by 0.88 s |
| Build `ui5` | 25.79 s | 18.93 s | Bun faster by 6.86 s |
| Serve | 2.74 s | 1.13 s | Bun faster by 1.61 s |
| Parity | 0.68 s | 0.53 s | Bun faster by 0.15 s |

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

- Serve path uses Express on Bun for both HTTP/1 and HTTP/2 modes. An earlier experiment with a custom `BunNativeApp` (Bun.serve()-based Express reimplementation) was replaced in favour of standard Express, which works correctly on Bun out of the box. The BunNativeApp approach is preserved on the `experiment/bun-native-serve` branch for future Bun.serve() experimentation.
- Worker-based theme building (`buildThemes`) remains disabled on Bun because the MessageChannel/MessagePort worker path still crashes real framework builds under Bun. The `minify` task still uses single-threaded execution on Bun because workerpool cleanup remains fragile there as well.
- The ongoing `experimental-source-esm` investigation now stays under `esm-migration-poc/` and is intentionally excluded from the copied `test/` fixture matrix so the main comparison stays focused on the core runtime validation suite.
- Kept the graph-driven build and the existing UI5 LBT bundling pipeline in place. We evaluated whether Bun-native bundling could replace that path and did not take it forward as the main plan.

Bun fork:

- Improved `process.binding("stream_wrap")` shim to return a `Uint8Array` for `streamBaseState`, matching Node.js behaviour.
- Added keep-in-sync comments to the HTTP/2 SETTINGS frame serialisation helpers in `h2_frame_parser.zig`.
- The validation flow now targets Bun release binaries for fair comparisons instead of accidentally picking debug builds.

Validation app:

- Added copied fixture coverage, runtime comparison commands, focused profiling commands, smoke checks for build, theme, workspace, and native serve behavior, plus a theme-heavy builder fixture.
- Added a narrow self-contained bundler spike with `npm run spike:self-contained-bundler` to compare a real UI5 self-contained build against a dedicated Bun.build HTML+ESM bundle.
- Added `npm run spike:esm-bundlers` to compare Bun.build, esbuild, and Rollup directly against the `esm-overlay/` ESM inputs of the shopping-cart migration PoCs without going through the UI5 asset assembly path.
- Added ESM migration PoCs under `esm-migration-poc/`; see that folder's README for the architecture, commands, results, and current limitations.

Result: With `builder/application.experimental.esm` removed from the active fixture matrix, the latest cold `npm run compare:fixtures` rerun has Bun **9.57 s faster** than Node on the main fixture comparison (30.73 s Bun vs 40.30 s Node). Bun now leads in every reported phase total: overall wall time, build total, build preparation, `ui5` execution, serve, and parity. See [Performance Story](#performance-story) for the before-versus-after context.

Observations:

- Express works reliably on Bun for both HTTP/1 and HTTP/2. The custom BunNativeApp approach was removed from the main path because Express already handles all the middleware, routing, and streaming needs correctly, reducing maintenance surface.
- Bun still uses in-process theme building instead of the worker-based `buildThemes` path because the MessageChannel/MessagePort worker variant is still unstable on Bun during real framework builds.
- The earlier post-rebase Bun regression was partly caused by `minify` workers being re-enabled on Bun. Restoring the Bun single-threaded `minify` path materially improved the next full `compare:fixtures` rerun.
- With the experimental ESM fixture removed from the suite, the largest remaining Bun regressions in the current run are still small (`project/application.d` at +0.31 s and `project/application.e` at +0.20 s), while the biggest Bun wins are `builder/application.a` (-2.88 s) and `serve server/application.a` (-1.61 s).
- The bridge-free/source-native ESM work now continues under [`esm-migration-poc/`](./esm-migration-poc/) instead of the copied benchmark fixture matrix.
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
- `npm run spike:esm-bundlers -- --app ui5.v1.shopping.cart` compares Bun.build, esbuild, and Rollup directly against one PoC app's `esm-overlay/` source graph and writes JSON plus Markdown summaries under a temp directory
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
- `npm run smoke:sample:source-esm` runs the sibling CLI `experimental-source-esm` flow for the sample app, serves the generated source-root and release outputs, and uses headless Chrome page evaluation to wait for a mounted component container plus the rendered `Say Hello` button text instead of scraping `--dump-dom` output

Set `UI5_CHROME_BINARY` if Google Chrome is not installed at the default macOS path used by that smoke script.

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

## Proof-of-Concept Work

The [`esm-migration-poc/`](./esm-migration-poc/) directory contains standalone UI5 ESM migration experiments that sit outside the main validation matrix.

It includes the two migrated shopping-cart applications, the shared `build:esm` assembler, and the direct bundler comparison work. See [`esm-migration-poc/README.md`](./esm-migration-poc/README.md) for the full summary, commands, results, and current conclusions.

### Performance Story

When the Bun-on-UI5 experiment first measured build performance, the numbers were discouraging:

| Metric | Node | Bun | Delta |
| --- | ---: | ---: | ---: |
| **Overall** | **47.91 s** | **65.50 s** | **Bun slower by 17.59 s** |
| Build total | 44.50 s | 63.20 s | +18.70 s |

Key improvements since that first pass:

1. **Debug binary in benchmarks** — `bun-debug` was being picked up instead of release builds, adding massive artificial slowdown
2. **`process.binding("stream_wrap").streamBaseState`** — Changed from a plain Array to `Uint8Array` in the Bun fork, matching Node.js behavior. One-line C++ change that unblocked an entire npm dependency chain (`handle-thing` -> `spdy`)
3. **Express over custom BunNativeApp** — Replaced the custom `Bun.serve()`-based adapter with standard Express, which works correctly on Bun out of the box
4. **Benchmarking against the actual release binary** — The validation flow now resolves `build/release/bun` first so comparisons are not skewed by debug builds or fallback binaries
5. **Worker-based theme/minify remains an active tradeoff** — The current Bun validation path keeps `buildThemes` in-process and the `minify` worker pool disabled because the MessageChannel and worker cleanup paths are still unstable on Bun, and a fresh attempt to re-enable Bun theme workers still crashed the real framework build
6. **The experimental ESM investigation is now out of the main fixture matrix** — `compare:fixtures` is back to tracking the copied core validation suite, while bridge-free/source-native ESM work continues under `esm-migration-poc/`

Best local result before the latest rebase check (2026-04-18):

| Metric | Node | Bun | Delta |
| --- | ---: | ---: | ---: |
| **Overall** | **40.28 s** | **38.17 s** | **Bun faster by 2.11 s** |
| Build total | 38.17 s | 36.18 s | Bun faster by 1.99 s |
| Build prepare | 12.51 s | 12.04 s | Bun faster by 0.47 s |
| Build `ui5` | 25.09 s | 23.62 s | Bun faster by 1.47 s |
| Serve | 1.24 s | 1.22 s | Bun faster by 0.02 s |

Latest rebase check after removing `builder/application.experimental.esm` from the active fixture matrix (2026-04-23, Bun `1.3.13`):

| Metric | Node | Bun | Delta |
| --- | ---: | ---: | ---: |
| **Overall** | **40.30 s** | **30.73 s** | **Bun faster by 9.57 s** |
| Build total | 36.77 s | 28.99 s | Bun faster by 7.78 s |
| Build prepare | 10.54 s | 9.66 s | Bun faster by 0.88 s |
| Build `ui5` | 25.79 s | 18.93 s | Bun faster by 6.86 s |
| Serve | 2.74 s | 1.13 s | Bun faster by 1.61 s |
| Parity | 0.68 s | 0.53 s | Bun faster by 0.15 s |

This exact `npm run compare:fixtures` rerun excludes the dedicated experimental-source-esm fixture so the main benchmark stays focused on the copied runtime validation suite. On that suite Bun now has an even clearer overall lead, driven mainly by faster `ui5` execution, a much faster serve run, and a smaller but real win in build preparation.

Key takeaways: measure with production builds, keep the worker stability tradeoff explicit, standard middleware still beats custom replacements, and keep the bridge-free/source-native ESM investigation isolated in [`esm-migration-poc/`](./esm-migration-poc/) instead of letting it skew the main fixture comparison.
