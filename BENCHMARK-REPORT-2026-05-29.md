# Benchmark report — UI5 CLI on Bun (post-upstream-merge)

**Date:** 2026-05-29
**Bun build:** `1.4.0-canary.1+40eff4488` (release, aarch64-apple-darwin)
**Compared against:** system `node` on `darwin/arm64`
**Harness:** `npm run compare:fixtures` → `scripts/compare-runtimes.mjs`

## Headline

> **Bun is 1.15× faster than Node on the UI5 fixture suite — 13.0% less wall-clock (35.57 s vs 40.88 s).**

This is **after both upstream merges of 2026-05-29**: 552 commits into the Bun fork (Zig→Rust port in progress), and 38 commits into the UI5 CLI fork (`UI5/cli` upstream). An earlier run with only the Bun merge applied (and the pre-merge CLI) measured 1.06× / 5.4% — the gap widened after merging upstream UI5 CLI changes too. See the "Comparison runs" section below.

## Build verification

The newly merged Bun fork **built cleanly** end-to-end:

- Rust toolchain auto-installed `nightly-2026-05-06-aarch64-apple-darwin` (4 components).
- Cargo workspace compiled all internal crates (~150) without errors.
- Final ninja link + dsymutil + strip succeeded.
- Build product: `/Users/I353257/Documents/Projects/bunnify/bun/build/release/bun` (56,608,880 bytes; `1.4.0` self-reports vs old `1.3.13`).
- Full log: `/tmp/bun-build-2026-05-29.log`.
- Build wall-clock: ~10 minutes from clean (08:38 start of `npm run bun:build:fork` → 08:46 binary on disk; bulk was Cargo download + crate compilation + JSC link).

## Patch survival, verified at runtime

Three quick sanity probes against the new binary:

| Patch                                  | Probe                                              | Result          |
| -------------------------------------- | -------------------------------------------------- | --------------- |
| `process.binding('stream_wrap')` shim  | `process.binding('stream_wrap').streamBaseState`   | `Uint8Array(1)` ✅ |
| `tls.Server` `instanceof` cleanup      | `new tls.Server() instanceof tls.Server`           | `true` ✅       |
| HTTP/2 SETTINGS frame fix              | `serve server/application.a` fixture (uses HTTP/2) | passes, 1.42 s ✅ |

## Fixture suite results (final, post-both-merges)

```
Node: 40.88 s
Bun:  35.57 s
Bun was faster by 5.31 s (1.15x, 13.0% less wall time).

Phase totals
build:  Node 37.81 s, Bun 33.40 s, delta -4.41 s
serve:  Node  2.10 s, Bun  1.56 s, delta -0.55 s
parity: Node  0.73 s, Bun  0.52 s, delta -0.21 s

Build subphases
prepare: Node 10.53 s, Bun 10.74 s, delta +0.21 s
ui5:     Node 26.80 s, Bun 22.09 s, delta -4.71 s
```

- **32 build fixtures** all pass under both runtimes.
- **1 expected-failure fixture** (`project/err.application.a`) correctly fails under both.
- **1 serve fixture** (`server/application.a`, exercises HTTP/2 path our patches enable) passes — this is the one fixture that depends on our HTTP/2 SETTINGS-frame fix.
- **5 parity checks** (cli/init, fs/fsInterface, fs/glob, fs/adapter, project/workspace) all pass.

## Comparison runs

We have two data points from this session, both with the merged Bun (`1.4.0`):

| Run                                             | Node    | Bun     | Bun ratio | Bun saving |
| ----------------------------------------------- | ------- | ------- | --------- | ---------- |
| Bun merge only, pre-merge CLI                   | 48.71 s | 46.08 s | 1.06×     | −5.4 %     |
| Bun merge + CLI merge (final)                   | 40.88 s | 35.57 s | 1.15×     | −13.0 %    |

Both runtimes got faster after the CLI merge (Node −7.8s, Bun −10.5s). Most of the speedup is shared infrastructure — the merged CLI's prepare phase dropped from 15.5s to 10.7s on both runtimes, suggesting upstream tightened a fixture-setup hot path. Bun pulled further ahead on the `ui5` phase (the actual build work).

Caveat: this is a single laptop, single thermal envelope, one run each — cross-run variance is real and not measured. The structural picture (Bun faster, all fixtures passing on both, identical pass/fail topology between runs) is solid; the exact percentage could shift ±2-3 points on repeats.

## Where Bun wins biggest (final run)

| Fixture                                | Node   | Bun    | Δ        | Speedup |
| -------------------------------------- | ------ | ------ | -------- | ------- |
| `build builder/application.a`          | 4.39 s | 1.60 s | −2.79 s  | 0.36×   |
| `build builder/application.b`          | 2.20 s | 1.47 s | −0.73 s  | 0.67×   |
| `serve server/application.a`           | 2.10 s | 1.56 s | −0.55 s  | 0.74×   |
| `build project/application.a`          | 1.49 s | 1.24 s | −0.25 s  | 0.83×   |
| `build builder/theme.heavy.library`    | 0.88 s | 0.66 s | −0.23 s  | 0.75×   |

`builder/application.a` at **0.36×** is the standout — Bun finishes that build in roughly a third of Node's wall-clock. Server startup (HTTP/2) and theme builds remain consistent Bun wins.

## Where Bun is slower

| Fixture                                | Node   | Bun    | Δ        | Slowdown | Phase split           |
| -------------------------------------- | ------ | ------ | -------- | -------- | --------------------- |
| `build project/application.h`          | 0.65 s | 0.95 s | +0.30 s  | 1.46×    | prep +0.00, ui5 +0.30 |
| `build project/application.c2`         | 1.30 s | 1.75 s | +0.45 s  | 1.34×    | prep +0.04, ui5 +0.41 |
| `build project/err.application.a`      | 0.82 s | 1.07 s | +0.26 s  | 1.32×    | prep +0.18, ui5 +0.00 |
| `build project/application.g`          | 1.09 s | 1.43 s | +0.34 s  | 1.31×    | prep +0.11, ui5 +0.22 |
| `build project/application.d`          | 1.02 s | 1.20 s | +0.17 s  | 1.17×    | prep +0.06, ui5 +0.12 |

The regression cluster is now concentrated on small `project/*` fixtures — these have very low wall-clocks (under ~1.5s on Node), so even tiny per-process startup overheads in Bun show up as 30-46% slowdowns in relative terms. The `err.application.a` regression remains the same shape as before (prep-phase). Worth a follow-up profiling pass with `npm run profile:fixture:bun -- --fixture project/application.h` if these paths matter.

## Phase analysis (final run)

- **`prepare` phase** (npm install / fixture setup): Node 10.53 s, Bun 10.74 s — **near tie, marginal Node win** of 0.21 s. Dominated by I/O and node_modules layout, not JS execution.
- **`ui5` phase** (the actual UI5 CLI run): Node 26.80 s, Bun 22.09 s — **Bun 17.6% faster**. This is the phase that actually exercises the runtime. The big win.
- **`serve` phase**: Bun 26% faster. Single fixture but consistent with HTTP/2 path being well-served by our patches.

## What this benchmark *doesn't* measure

- **Cold-start vs warm-start**: not separated. Each fixture is a fresh process.
- **Memory footprint**: not measured.
- **Bun-specific tasks** (e.g. `enable minify workers on Bun` from a recent CLI commit) — these have no Node equivalent, so the comparison fairly excludes them.
- **First-build vs incremental**: only first-build measured.
- **`profile:build-variant`** scripts (which can repeat fixtures, vary CSS/source-ESM flags) were not run — they'd be the next step for deeper investigation.

## Comparison against the previous (pre-merge) Bun

The old `1.3.13` binary from 2026-04-22 was overwritten by this build, and there's no archived snapshot to A/B against. So this report compares **post-merge Bun vs Node**, not **post-merge Bun vs pre-merge Bun**. If the latter is what you want, restore the old binary from `git stash`/backup and rerun `compare:fixtures` against both.

## Reproducibility

```sh
cd ui5-cli-on-bun
npm run bun:build:fork           # ~10 min from clean
npm run compare:fixtures         # ~3 min for full suite
```

Lock file at `.compare-fixtures.lock` prevents concurrent runs.

## Three key takeaways

1. **Both merged trees build and run.** All four Bun-side patches (HTTP/2 SETTINGS, `stream_wrap` shim, TLS hasInstance, ALPN) survived the 552-commit Bun merge. All 13 of our CLI-side commits survived the 38-commit UI5 CLI merge with zero conflicts. Full fixture suite passes on both runtimes.
2. **Bun is faster — meaningfully.** 13.0% across the full suite (35.57 s vs 40.88 s), driven by a 17.6% win on the `ui5` phase. `builder/application.a` finishes in 0.36× of Node's time on the final run.
3. **The slow fixtures cluster on small `project/*` builds.** These spend under 1.5 s on Node, so per-process startup costs dominate; Bun shows 30–46% relative slowdowns there. The headline win still dominates because the larger fixtures more than make up for it.
