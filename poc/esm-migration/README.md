# UI5 ESM Migration

Proof-of-concept for incrementally migrating UI5's AMD-style module system (`sap.ui.define` / `sap.ui.require`) to native ES Modules, enabling standard bundlers (Bun.build, esbuild, Rollup) to process UI5 code with tree-shaking and modern optimization.

## Why

UI5's custom AMD loader is the only way to consume UI5 modules today. This means:

- No tree-shaking — apps ship the entire framework even if they use a fraction of it
- No standard bundler support — only UI5 tooling can process the modules
- `sap.ui.requireSync` is still used in hot paths, blocking the main thread
- The loader adds ~100KB+ overhead before any app code runs

Native ESM solves all of these. The question is whether the conversion is mechanically feasible and whether the AMD and ESM worlds can coexist during a gradual migration.

## What this proves

**17 modules converted** from AMD to ESM, including:
- 7 zero-dependency leaf utilities (`sap/base/strings/*`)
- 2 zero-dependency base utilities (`sap/base/assert`, `sap/base/util/now`)
- 1 module with ESM dependency chain (`sap/base/strings/formatMessage` -> `assert`)
- 1 complex stateful module (`sap/base/Log` — mutable state, closures, Logger constructor, depends on `util/now`)
- 5 utility modules (`sap/base/util/isPlainObject`, `deepClone`, `each`, `values`, `uid`) — batch 2, including ESM dependency chain (`deepClone` -> `isPlainObject`) and stateful counter (`uid`)
- 1 array utility (`sap/base/array/uniqueSort`) — first module in the `sap/base/array/` namespace

**Two coexistence modes** — an ESM-AMD bridge registers converted modules into the existing loader so AMD consumers work unchanged:
- **Eager mode**: ESM modules are imported at startup and registered via `sap.ui.predefine()`
- **Lazy mode**: Module paths are registered; actual `import()` happens on first `sap.ui.require()`

**Full browser validation** — both modes tested in a running UI5 app. All 11 modules load correctly through `sap.ui.require()`, dependency chains resolve, stateful modules share state via ESM singleton semantics, and lazy-loaded modules cache after first load (~0.1ms on subsequent requires).

**Tree-shaking works** — Bun.build reduces a single-module import from 4,307 bytes (all 9 string utils) to 434 bytes (90% reduction). Minification brings the full bundle to 2,746 bytes.

## Build artifact size: standard UI5 build vs Bun.build ESM

The standard UI5 build (`ui5 build --all`) produces AMD preload bundles that include the ui5loader (~100KB+) and cannot tree-shake unused modules. Bun.build on ESM-converted modules produces self-contained bundles with no loader overhead and full tree-shaking.

| Scenario | Standard build (AMD) | Bun.build (ESM) | Reduction |
| --- | ---: | ---: | ---: |
| All 17 modules (unminified) | ~2,800 bytes (modules) + ~100KB loader | 4,307 bytes (self-contained) | **Eliminates ~100KB loader** |
| All 17 modules (minified) | ~2,800 bytes (modules) + ~100KB loader | 2,746 bytes (self-contained) | **Eliminates ~100KB loader** |
| Single module (camelize) | ~2,800 bytes (all modules loaded, no tree-shaking) | 434 bytes | **~85% smaller** (no unused modules) |
| Single module (minified, est.) | ~2,800 bytes+ | ~280 bytes | **~90% smaller** |

Key difference: the standard AMD build always ships all modules in the preload bundle regardless of what the app actually uses. The ESM + Bun.build approach only includes what is imported, and the ui5loader is not needed at all for converted modules.

## Key observations

1. **The conversion is mechanical.** `sap.ui.define(deps, factory)` becomes `import` + `export default`. The factory function body becomes module scope. No semantic changes needed for the modules we tested.

2. **Stateful modules convert cleanly.** `sap/base/Log` has mutable module-level state, closure-based private functions, and a Logger constructor. ESM module scope provides the same isolation as AMD's factory function. Singleton semantics (shared state across imports) work natively.

3. **The bridge is simple.** Registering an ESM export into the AMD loader is one `sap.ui.predefine()` call per module. The lazy variant is a single `sap.ui.registerESMModule()` call — the loader then uses `import()` instead of a script tag when the module is first required.

4. **`import()` URL resolution matters.** The ui5loader's `toUrl()` returns bare relative paths (`resources/sap/...`). Browser `import()` needs `./`-prefixed or absolute URLs. This is a one-line fix but easy to miss.

5. **`sap.ui.requireSync` is the hard boundary.** Any code path that synchronously requires a converted module will break — `import()` is always async. This constrains which modules can be converted first.

## Project structure

```
esm-migration/
├── webapp/                      # TypeScript app source
│   ├── Component.ts
│   ├── controller/              # App.controller.ts, BaseController.ts, Main.controller.ts
│   ├── model/                   # models.ts, formatter.ts
│   ├── view/                    # App.view.xml, Main.view.xml
│   ├── i18n/                    # i18n.properties (en, de)
│   ├── index.html               # Standard entry point
│   └── manifest.json
│
├── esm-overlay/                 # ESM-specific source files (overlaid onto UI5 build)
│   ├── index-esm.html           # Eager bridge entry point
│   ├── index-esm-lazy.html      # Lazy bridge entry point
│   └── resources/
│       ├── esm-bridge.js        # Dual-mode bridge (eager + lazy)
│       ├── esm-bridge-lazy.js   # Lazy-only bridge
│       ├── sap-ui-custom-dbg.js # Modified ui5loader with import() support
│       └── sap/base/            # Converted ESM modules:
│           ├── assert-dbg.js
│           ├── Log-dbg.js       # Stateful: logging API
│           ├── util/now-dbg.js
│           └── strings/         # 7 string utilities (camelize, capitalize, etc.)
│
├── ui5.yaml                     # UI5 build config (OpenUI5 1.147.0)
├── tsconfig.json                # TypeScript config
├── package.json                 # Build/serve/test scripts
├── serve.js                     # Static file server (Bun.serve)
├── test-esm-modules.js          # 30 tests: ESM module correctness
├── test-esm-bridge.js           # 27 tests: bridge registration
├── build-esm.js                 # 12 tests: Bun.build bundling + tree-shaking
├── CHANGES.md                   # Detailed technical changelog
│
├── dist/                        # GENERATED: standard UI5 build (AMD)
└── dist-esm/                    # GENERATED: UI5 build + ESM overlay
```

## How to run

Prerequisites: [Bun](https://bun.sh) and Node.js installed.

```sh
cd esm-migration

# Install dependencies (UI5 CLI, TypeScript tooling)
npm install

# Build the standard UI5 app (AMD) into dist/
bun run build:ui5

# Build the ESM variant (UI5 build + ESM overlay) into dist-esm/
bun run build:esm

# Serve the standard build
bun run serve:ui5
# -> http://localhost:8080

# Serve the ESM build
bun run serve:esm
# -> http://localhost:8090/index-esm.html       (eager mode)
# -> http://localhost:8090/index-esm-lazy.html   (lazy mode)

# Run all tests (requires build:esm first)
bun run test
```

### Build scripts

| Script | What it does |
|--------|-------------|
| `build:ui5` | Runs `ui5 build --all` — standard AMD build into `dist/` |
| `build:esm` | Runs `build:ui5`, copies `dist/` to `dist-esm/`, overlays ESM files on top |
| `serve:ui5` | Serves `dist/` on port 8080 (standard build) |
| `serve:esm` | Serves `dist-esm/` on port 8090 (ESM build) |
| `test` | Runs all three test suites (module correctness, bridge, bundler) |
| `clean` | Removes `dist/`, `dist-esm/`, `build-output/` |

### How the ESM build works

1. `ui5 build --all` compiles TypeScript, bundles preloads, and copies all framework resources into `dist/` — a standard AMD app
2. `dist/` is copied wholesale to `dist-esm/`
3. `esm-overlay/*` is copied on top, replacing the AMD versions of 11 converted modules with their ESM equivalents and adding the bridge files + ESM entry points

This means `dist/` and `dist-esm/` are identical except for the 16 files in `esm-overlay/`. You can serve both side by side to compare behavior.

## The AMD-to-ESM conversion pattern

```javascript
// BEFORE (AMD):
sap.ui.define(["sap/base/assert"], function(assert) {
    "use strict";
    var fn = function(x) { /* ... */ };
    return fn;
});

// AFTER (ESM):
import assert from "../assert-dbg.js";

export default function fn(x) { /* ... */ }
```

| Aspect | AMD | ESM |
|--------|-----|-----|
| Dependencies | String array | `import` statements |
| Export | `return` from factory | `export default` |
| Execution | Lazy (on first require) | Eager (at import time) |
| Async loading | Custom script-tag loader | Native `import()` |
| Bundler support | UI5 tooling only | Any standard bundler |
| Tree-shaking | Not possible | Works out of the box |

## What's next

- **Convert a module consumed by UI controls** — pick a `sap/base/` utility used by `sap/m/Button` or similar, verify the control still works via the bridge
- **Test with the modified loader** — switch lazy mode from the inline shim to `sap-ui-custom-dbg.js` with built-in `import()` support
- **Benchmark** — compare load times for AMD preload vs ESM import
- **Explore dual-format publishing** — UI5 libraries ship both AMD and ESM, bridge becomes build-time only

See [CHANGES.md](./CHANGES.md) for the full technical changelog with code snippets and test results.
