# ESM Migration PoCs

This directory contains the standalone UI5 ESM migration experiments for the shopping-cart demo application. The goal is to validate what a UI5 application looks like when application-owned modules move to native ES Modules while the UI5 framework remains in its existing AMD-based runtime model.

These PoCs are intentionally outside the main validation matrix in the repository root. They are architecture spikes, not the default compatibility target for the Bun-on-UI5 work.

## What Is Here

- `ui5.v1.shopping.cart/` — OpenUI5 `1.148.0-SNAPSHOT` shopping cart app migrated to ESM, including the simpler v1 bootstrap path
- `ui5.v2.shopping.cart/` — UI5 `2.0.0-SNAPSHOT` version of the same app, including the `sap-ui-core-ready` event-capture bootstrap path
- `scripts/build-esm-dist.mjs` — shared assembler used by both apps for `build:esm`

Each app also has its own README with version-specific bootstrap details and local commands.

## What We Changed

The migration work in this folder now has two separate tracks:

1. A runtime-shaped `dist-esm` delivery path that works with the existing UI5 build output.
2. A direct-ESM-input comparison harness for future bundler experiments.

### 1. Runtime-Shaped `dist-esm`

Both shopping-cart apps now share the same `build:esm` implementation through `scripts/build-esm-dist.mjs`.

That shared assembler does the following:

1. Runs the normal `ui5 build --all --clean-dest` flow unless `UI5_BUILD_ESM_SKIP_BUILD=1` is set.
2. Rebuilds `dist-esm/` from `dist/`.
3. Treats `esm-overlay/` as the source of truth for app-owned `.js` modules.
4. Mirrors each overlay `.js` file into both the runtime path and the matching debug artifact already used by the UI5 build output.
5. Removes `Component-preload.js` and unused AMD leftovers such as `initMockServer.js`.
6. Verifies that overlay-backed outputs and non-framework app JS in `dist-esm/` no longer contain `sap.ui.define`.

This keeps the framework payload and non-JS assets from the standard UI5 build intact while replacing only the application module layer.

### 2. Direct ESM-Input Bundler Spikes

From the repository root, `npm run spike:esm-bundlers` compares bundlers directly against the `esm-overlay/` source graph instead of the assembled `dist-esm/` output.

The harness currently runs three strategies against `resources/esm-bridge.js`:

- `bun-build-bridge`
- `esbuild-bridge`
- `rollup-preserve`

All three strategies copy `index-esm.html` through unchanged and restrict bundling to the ESM module graph. The harness emits both JSON and Markdown summaries, including timing, output counts, output sizes, JS size totals, and extra JS chunk counts.

## Architecture Summary

The application modules are converted to native ESM, but framework modules still come from UI5's AMD loader.

The shared pattern is:

1. `esm-helpers.js` wraps `sap.ui.require()` in Promises so ESM modules can use top-level `await` for framework dependencies.
2. App-to-app dependencies are native `import` statements, so they are statically visible to bundlers.
3. `resources/esm-bridge.js` eagerly imports the ESM app modules and re-registers them into the UI5 loader with `sap.ui.predefine()`.
4. The HTML bootstrap loads the UI5 runtime first, then loads the bridge, then starts the app.

The important version-specific difference is bootstrap timing:

- `ui5.v1.shopping.cart/` can start directly after `sap-ui-core.js` because the loader is available synchronously.
- `ui5.v2.shopping.cart/` must capture `sap-ui-core-ready` before the deferred module script runs.

## Current Status

Validated state in this workspace:

- Clean `bun run build:esm` succeeded for both PoCs when the OpenUI5 snapshot registry was reachable.
- Post-build checks confirmed the application-owned JS in `dist-esm/` no longer leaked `sap.ui.define`.
- The direct bundler comparison harness succeeded for both apps across Bun.build, esbuild, and Rollup.

Most recent comparative results from `npm run spike:esm-bundlers`:

### `ui5.v1.shopping.cart`

- `bun-build-bridge`: about `0.04 s`, `152.7 KiB` total output, `51.3 KiB` JS, `0` extra JS chunks
- `esbuild-bridge`: about `1.54 s`, `152.9 KiB` total output, `52.5 KiB` JS, `0` extra JS chunks
- `rollup-preserve`: about `1.48 s`, `178.4 KiB` total output, `56.7 KiB` JS, `19` extra JS chunks

### `ui5.v2.shopping.cart`

- `bun-build-bridge`: about `0.03 s`, `153.1 KiB` total output, `51.3 KiB` JS, `0` extra JS chunks
- `esbuild-bridge`: about `1.35 s`, `153.4 KiB` total output, `52.5 KiB` JS, `0` extra JS chunks
- `rollup-preserve`: about `1.51 s`, `178.8 KiB` total output, `56.7 KiB` JS, `19` extra JS chunks

None of the three strategies emitted `sap.ui.define` in their JS outputs.

## How To Run

### App-level build and serve

For either app directory:

```sh
bun run build
bun run build:esm
bun run serve
bun run serve:esm
```

Useful extras:

```sh
bun run test:esm-build
bun run clean
```

### Root-level bundler comparison

From the `ui5-cli-on-bun/` repository root:

```sh
npm run spike:esm-bundlers
npm run spike:esm-bundlers -- --app ui5.v1.shopping.cart
npm run spike:esm-bundlers -- --app ui5.v2.shopping.cart --strategy rollup-preserve
```

## Constraints And Conclusions

- The shared `build:esm` assembler is still the delivery path for runtime-shaped `dist-esm`.
- The bundler comparison harness is intentionally exploratory and does not replace the full UI5 build graph.
- Framework resolution for clean app builds still depends on the OpenUI5 SNAPSHOT registry being reachable.
- The main architectural conclusion has not changed: use proper ESM inputs for experiments, but keep the UI5-aware assembly step for actual `dist-esm` delivery.

## Related Docs

- `ui5.v1.shopping.cart/README.md`
- `ui5.v2.shopping.cart/README.md`
- `../README.md`