# Agent Change Log

This document is the working memory for the standalone `ui5-cli-on-bun` repository.
It captures what has been changed so far, why those changes were introduced, what has already been verified, and what future agents should know before continuing work.

## Repository Purpose

`ui5-cli-on-bun` is a standalone validation repo that sits next to two sibling forks:

- Bun fork: `https://github.com/ui5red/bun`
- UI5 CLI fork: `https://github.com/ui5red/cli`

The repo exists so Bun runtime experiments and UI5 CLI integration work can be validated outside the forks themselves. That keeps benchmark assets, copied fixtures, smoke scenarios, and comparison tooling isolated from production code in the two upstream forks.

## Main Goals Covered So Far

The work completed in this repo has been driven by four needs:

1. Make it easy to bootstrap and run the sibling Bun and UI5 CLI forks from one place.
2. Recreate enough UI5 CLI test coverage in a standalone repo to compare Node and Bun on the same workloads.
3. Remove benchmark noise caused by accidentally using a Bun debug binary instead of a release binary.
4. Build a repeatable timing and profiling workflow so future optimization work can target real hotspots instead of guesswork.

## Major Changes Implemented

### 1. Fork bootstrap and runtime resolution

Files involved:

- `scripts/bootstrap-forks.mjs`
- `scripts/local-forks.mjs`
- `scripts/build-bun-fork.mjs`
- `package.json`
- `README.md`

What changed:

- The repo bootstraps the Bun and UI5 CLI forks automatically, defaulting to `ui5red/bun` and `ui5red/cli`.
- Runtime selection was generalized so the standalone repo can explicitly run the fixture suite with either Bun or Node.
- Bun runtime resolution now prefers release binaries over debug binaries.
- The Bun build helper now supports profiles and clean rebuilds.
- The default Bun build path for this repo is now a release build instead of a debug build.

Why:

- The earlier comparison runs were unintentionally using `bun-debug`, which emitted internal runtime trace noise and was not a fair benchmark target against Node.
- The repo needed a clean way to build Bun repeatedly without manually navigating into the Bun fork.
- Future profiling work needs stable runtime selection instead of implicit behavior.

Important implementation notes:

- `scripts/local-forks.mjs` now prefers `build/release/bun`, then `build/release-local/bun`, and only falls back to debug binaries afterward.
- `scripts/build-bun-fork.mjs` supports `release`, `debug`, `release-local`, and `debug-local`, plus `--clean`.
- `bun:build:fork` builds a release binary by default.
- `bun:rebuild:fork` performs a clean release rebuild.

Known constraint:

- `build:release:local` currently fails in the Bun fork checkout because local WebKit sources are not present under `vendor/WebKit`.
- `build:release` works and was used successfully.

### 2. Standalone fixture suite copied from the UI5 CLI test surface

Files involved:

- `test/`
- `examples/`
- `test/README.md`
- `examples/README.md`

What changed:

- A large standalone `test/` tree was added to mirror relevant UI5 CLI fixture coverage across builder, server, fs, cli, project, and sourcemap scenarios.
- An `examples/` area was added to keep copied manual example apps separate from automated fixture runs.

Why:

- The standalone repo needed realistic, repeatable workloads that exercise the UI5 CLI fork through the Bun fork without depending on the original CLI repo’s internal test harness.
- The copied fixtures make it possible to compare Node and Bun against the same standalone project layout.

Design choices in the copied fixture set:

- `test/builder/` contains copied UI5 application and library fixtures used for `ui5 build --all` validation.
- `test/server/` contains a serve fixture used to validate `ui5 serve` behavior.
- `test/cli`, `test/fs`, and `test/project` support parity scenarios against the UI5 CLI fork modules directly.
- `test/sourcemaps/` includes a focused build case for sourcemap behavior.
- `examples/browsersync/` is a manually runnable example kept separate from the automated suite.

Important adaptation notes:

- Some copied fixtures needed explicit `package.json` or `ui5.yaml` files in this repo because the original UI5 CLI tests created or configured them programmatically.
- Recursive local `file:` dependency preparation is required because several fixtures depend on sibling libraries that also depend on other local libraries.
- `project/err.application.a` is intentionally treated as an expected build failure.

### 3. Runtime-aware fixture execution harness

Files involved:

- `scripts/run-runtime-fixtures.mjs`
- `scripts/test-fixtures.mjs`
- `scripts/fixture-parity-runner.mjs`
- `package.json`
- `test/README.md`

What changed:

- A runtime-aware entrypoint was added so the same suite can run under Bun or Node.
- The main fixture runner handles:
  - build fixtures
  - server fixture
  - direct parity checks against UI5 CLI modules
- A dedicated parity runner was added for scenarios that are not just shelling out to `ui5`, such as CLI init, fs adapter behavior, glob behavior, and project workspace behavior.
- The runner supports filtering with `--only` and report export with `--report`.

Why:

- The repo needed a single harness that could compare Bun and Node without duplicating logic.
- Some meaningful compatibility checks live below the CLI command layer and needed direct module-level parity checks.

Behavior worth knowing:

- `test:fixtures` runs the Bun path.
- `test:fixtures:node` runs the Node path.
- Local dependency installation is done recursively and lazily so each fixture can resolve `file:` dependencies correctly.

### 4. Benchmark and profiling workflow

Files involved:

- `scripts/compare-runtimes.mjs`
- `scripts/profile-runtime-fixture.mjs`
- `scripts/test-fixtures.mjs`
- `package.json`
- `README.md`
- `test/README.md`

What changed:

- Per-step timings were added to the fixture runner.
- Build fixtures now record subphase timings for dependency preparation versus actual `ui5 build` execution.
- The runner now records structured reports when `--report` is provided.
- `compare:fixtures` now runs Node and Bun back to back, compares the reports, prints wall-clock totals, phase totals, build subphase totals, and the largest Bun regressions and wins.
- `profile:fixture:bun` and `profile:fixture:node` rerun filtered fixture steps from a clean test state and summarize min/avg/max timings across repeated runs, including build prep versus `ui5` timings when the selected fixture is a build case.
- The compare runner uses a lock file so overlapping comparisons cannot corrupt results.
- The compare runner now cleans up temporary report directories even on failure.

Why:

- A single overall wall-clock number was not enough to understand where Bun was losing time.
- The profiling workflow needed a way to isolate one fixture step and rerun it repeatedly under clean conditions.
- Overlapping benchmark runs had already caused invalid intermediate results earlier in the work.

Current canonical commands:

- `npm run bun:build:fork`
- `npm run bun:build:fork:debug`
- `npm run bun:rebuild:fork`
- `npm run bun:rebuild:fork:debug`
- `npm run test:fixtures`
- `npm run test:fixtures:node`
- `npm run compare:fixtures`
- `npm run profile:fixture:bun -- --only <filter> --repeat <n>`
- `npm run profile:fixture:node -- --only <filter> --repeat <n>`

Script cleanup already done:

- Redundant aliases such as separate `*-cli` and duplicate compare aliases were removed so the package script surface is now canonical instead of duplicated.

### 5. Documentation updates

Files involved:

- `README.md`
- `test/README.md`
- `examples/README.md`
- this file: `agent-doc.md`

What changed:

- The root README now documents the release-build default and the benchmark/profiling commands.
- The root README now links directly to the sibling Bun and UI5 CLI forks.
- The test README explains the fixture suite, runtime comparison workflow, and filtered profiling workflow.
- The examples README explains why `examples/` is separate from the automated fixture tree.

Why:

- The repo had grown beyond a small smoke-test setup and needed onboarding-quality documentation.
- Future agents need context without having to reverse-engineer the full git diff.

## Benchmark State Verified So Far

### Debug binary issue

The earlier noisy logs were not caused by leaked `BUN_DEBUG` environment variables in this repo. The standalone harness was already scrubbing those variables. The real issue was that the runtime selection path was finding `bun-debug` first and using it for comparison.

After switching the runtime preference to release binaries and rebuilding Bun cleanly, the internal Bun trace spam disappeared from the fixture runs.

### Clean Bun release build

The clean release rebuild succeeded using `npm run bun:rebuild:fork`.

Notes:

- The Bun release build fetched and extracted a prebuilt WebKit artifact successfully.
- `build:release:local` remains unusable in the current checkout because the local WebKit source tree is absent.

### Latest comparison result

Latest verified comparison from `npm run compare:fixtures`:

- Node total: `47.91 s`
- Bun total: `65.50 s`
- Result: Node is faster by `17.59 s`

Phase breakdown:

- Build: Node `44.50 s`, Bun `63.20 s`
- Serve: Node `2.50 s`, Bun `1.55 s`
- Parity: Node `0.78 s`, Bun `0.65 s`

Interpretation:

- Bun is not losing overall because of serve or parity checks.
- The slowdown is concentrated in build-heavy fixture steps.
- After splitting build steps into subphases, the dominant regression is inside the actual `ui5 build` phase rather than dependency preparation.

Subphase breakdown from the latest comparison:

- Build prepare: Node `10.90 s`, Bun `14.68 s`
- Build `ui5`: Node `21.10 s`, Bun `48.67 s`

Interpretation of the subphase split:

- Build preparation contributes some noise and some smaller regressions.
- The main optimization target is now clearly the Bun path inside `ui5 build` itself.
- Some one-off prep spikes appeared in full-suite runs, but repeated focused profiles show the stable regression is still primarily in the `ui5` portion.

Largest Bun regressions observed:

- `build builder/application.c2`
- `build builder/application.c`
- `build project/application.f`
- `build builder/application.c3`
- `build builder/application.e`
- `build project/application.c`
- `build project/application.e`
- `build builder/application.d`

Largest Bun wins observed:

- `build builder/application.a`
- `build builder/application.b`
- `serve server/application.a`

### Focused hotspot profiling already done

`builder/application.c2` was profiled as the first hotspot.

Repeated clean runs:

- Bun average: about `3.19 s`
- Node average: about `2.20 s`

Interpretation:

- The `application.c2` slowdown is stable across reruns and not just a one-off outlier.

Additional focused evaluation after adding build subphase timings:

- `project/application.c` and related `c2`/`c3` cases were profiled repeatedly under both runtimes.
- Their dependency-prep timings are broadly similar between Node and Bun in focused reruns.
- Their stable regression comes from the `ui5` portion, where Bun stays roughly `+0.9 s` to `+1.0 s` slower per fixture.
- `project/application.b` shows the same shape: after an initial noisy prep outlier, the stable Bun regression remains concentrated in the `ui5 build` portion.

## Important Things Future Agents Should Preserve

1. Do not switch benchmark runs back to `bun-debug` unless the explicit goal is Bun debug-runtime debugging instead of fair performance comparison.
2. Keep the compare lock file behavior in place so concurrent comparison runs do not overlap.
3. Preserve the recursive local dependency preparation in `scripts/test-fixtures.mjs`; several fixtures depend on nested sibling libraries.
4. Preserve the canonical package scripts and avoid reintroducing duplicated aliases.
5. Treat `project/err.application.a` as an expected failure unless the fixture strategy itself is intentionally being redesigned.

## Recommended Next Steps

The next optimization phase should focus on where the current measurements point:

1. Profile more build hotspots such as `builder/application.c`, `project/application.f`, and `builder/application.c3`.
2. Split build-step timing further into dependency preparation time versus the actual `ui5 build` execution to see whether Bun is slower before CLI work starts or inside the build path itself.
3. If the slowdown is inside the UI5 build path, profile the Bun fork and UI5 CLI fork interactions around file access, module loading, and subprocess behavior for those hotspot fixtures.

## Summary

This repo is no longer just a smoke-test wrapper. It now provides:

- reproducible fork bootstrap
- explicit Bun and Node runtime execution
- a standalone copied fixture corpus
- module-level parity checks
- release-vs-debug runtime hygiene
- repeatable comparison timing
- focused hotspot profiling
- repo-local documentation for future agents

Any future agent continuing the Bun optimization work should start from this document, then use the profiling commands above to narrow down the next hotspot before changing runtime or CLI behavior.

## Latest Validation App State

- `BOOTSTRAP_BUN`, `.env.local`, and `BUN_FORK_BINARY` were removed from the validation app.
- A Bun executable on `PATH` is still required only to bootstrap the Bun fork itself before its local release binary exists.
- Actual validation commands now always resolve the sibling Bun fork outputs, preferring `../bun/build/release/bun`, and the sibling CLI fork entrypoint.
- Fresh `compare:fixtures` after that cleanup measured Node `33.50 s` vs Bun `31.83 s`, with Bun ahead by `1.67 s` overall and `1.65 s` on total build time.

## 2026-04-16 Self-Contained Bun.build Spike

Files involved:

- `examples/self-contained-bundler-spike/**`
- `scripts/self-contained-bundler-spike.mjs`
- `package.json`
- `README.md`
- `examples/README.md`

What changed:

- Added a deliberately small standalone example app that is authored as plain HTML plus ESM JavaScript instead of `sap.ui.define` modules.
- Added `npm run spike:self-contained-bundler` to run two paths side by side:
  - `ui5 build self-contained --all`
  - `Bun.build()` against the example's HTML entrypoint
- Updated the root README with a short experiment summary describing the coordinated Bun fork, UI5 CLI fork, and validation-app changes, including why Bun serve was pursued and why Bun build was not.

Why this spike exists:

- The main UI5 build path is graph-driven and uses the LBT bundler for preload, raw, require, and bundleInfo sections across multiple resource types.
- `Bun.build` only becomes a plausible comparison point in a narrow self-contained, entrypoint-oriented scenario.
- The spike exists to document that boundary with a runnable command instead of only a theoretical conclusion.

Validated result:

- The UI5 self-contained build completed, but the current LBT path logged parse errors for ESM `import` and `export` in `main.js` and `message.js`.
- The emitted `sap-ui-custom.js` only contained preload content for `manifest.json` plus placeholder `undefined` lines for the failed modules.
- The HTML bootstrap transform did not apply because the spike app intentionally uses a plain `<script type="module">` entrypoint rather than the UI5 bootstrap tag.
- The Bun.build path bundled the same ESM app naturally into an HTML entrypoint plus JS chunk.
- The spike script now writes its scratch output under the OS temp directory instead of the repo so the validation repo stays clean before a push.

Interpretation:

- This confirms the current architectural conclusion: Bun.build is useful as a narrow self-contained experiment on ESM-friendly sources, but it is not a drop-in replacement for the standard UI5 build or preload/custom bundle paths.
- The spike should be preserved as an explanatory artifact and not expanded into the main validation suite unless the underlying UI5 module expectations change.
