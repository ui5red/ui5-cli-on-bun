# Bridge-Free ESM Roadmap

This document captures the next-step migration path beyond the current mixed-mode PoC.

The goal is not another adapter-heavy overlay. The goal is a future where:

- application source is native ESM
- framework dependencies are consumed as native ESM
- debug output is readable preserve-modules ESM
- release output is optimized ESM
- no `sap.ui.require()` bridge is needed for app modules
- no `sap.ui.predefine()` bridge is needed to register app modules back into the loader

## What We Can Do Already

Yes, we can already move away from thinking of `dist` manipulation as the final architecture.

That split is now clear in this repository:

- `esm-migration-poc/scripts/build-esm-dist.mjs` is the temporary delivery path for the current runtime.
- `scripts/compare-esm-bundlers.mjs` already proves that the app-side ESM source graph can be consumed directly by bundlers without starting from `dist-esm/`.
- `framework-esm/` now provides the shared source-native runtime helpers used by both bridge-free shopping-cart PoCs.
- `ui5.v1.shopping.cart/esm-source-bridge-free/` is now generated as a bridge-free app-source variant whose `_esm` modules bind framework globals through shared runtime facades instead of per-module `framework/sap/...` imports.
- `ui5.v2.shopping.cart/esm-source-bridge-free/` is now generated the same way, using the same shared source-generator and source-build flow.
- `ui5.v1.shopping.cart/dist-esm-source-debug/` and `ui5.v1.shopping.cart/dist-esm-source-release/` now demonstrate source-native debug and release ESM outputs built from that variant.
- `ui5.v2.shopping.cart/dist-esm-source-debug/` and `ui5.v2.shopping.cart/dist-esm-source-release/` are now produced too, which means the source-build path itself is no longer v1-only.
- The shared source-native runtime now mounts both v1 and v2 by preloading the framework module set needed by the manifest and generated app code, synthesizing `sap-ui-version.json` when needed, installing a shared `sap.ui.require` import hook that redirects the app component module to `_esm/Component.js` and resolves app controller modules from `_esm/controller/*.controller.js`, generating a source-native `Component-preload.js` that module-preloads `_esm/` app modules plus manifest/XML/i18n resources, creating lazy `createUi5NamespaceFacade("sap/...")` bindings in generated app/bootstrap code instead of importing per-module `framework/sap/...` wrappers, and starting through async `ComponentContainer` / `Component.create` rather than direct `AppComponent` construction.

What this means in practice:

1. Source-driven ESM builds are already viable for the application-owned code.
2. The current blocker is the framework/runtime contract, not the application code shape.
3. `dist` manipulation should be treated as temporary compatibility logic only.

## What Still Blocks A True Bridge-Free Runtime

The current UI5 runtime still hard-depends on the loader/module-name contract in several places.

### 1. Framework Resources Are Still AMD

The framework resources available in this workspace are still `sap.ui.predefine` / `sap.ui.require` based, not published as real ESM.

That means the current bridge-free path still depends on runtime helpers plus a loader-backed framework preload, not a real framework migration.

Recent loader inspection narrowed that blocker further: the individual framework files under `dist/resources/` are anonymous `sap.ui.define(...)` modules. UI5's internal script loader assigns their module names through `data-sap-ui-module` and then flushes the pending `define()` queue on script `load`. A naive `import()` or unmanaged `<script>` replacement for the central framework preload does not provide that contract, so the remaining bootstrap preload cannot be removed cleanly without either private loader hooks or framework-side publication changes.

### 2. App Module Resolution Still Goes Through The Loader

Even if the app source becomes pure ESM, the runtime still resolves controllers, views, fragments, routers, and some component entry points by module name.

That affects:

- XML view controller loading
- manifest-driven routing and target resolution
- `ComponentSupport`
- `Component.create` / `sap.ui.component`
- string-based module references such as `module:sap/ui/demo/cart/initMockServer`

This is why the compatibility layer still exists today: the runtime can now start the root component through `ComponentContainer` / `Component.create` while redirecting the app component module to `_esm/Component.js`, XML-view controllers can bypass loader-visible wrapper files, and the generated `_esm` app modules no longer need direct `sap.ui.require.toUrl()` calls for app/mock resources, but name-resolved framework seams still require explicit runtime intervention.

The latest source-native runtime probes now show a narrower blocker shape:

- the early `sap.ui` bootstrap race can be mitigated with synchronous `sap-ui-core-ready` capture plus a shared runtime helper
- the current runtime expectation for `dist/resources/sap-ui-version.json` can be satisfied from `ui5.yaml` during source-native builds
- manifest-driven framework classes can be preloaded, standard `Component-preload.js` requests can be answered by a generated source-native preload script, the root component can start through `ComponentContainer` / `Component.create` by redirecting `sap/ui/demo/cart/Component` to `_esm/Component.js`, XML-view controller resolution can now stay on standard `Controller.create` while the shared `sap.ui.require` import hook resolves `sap/ui/demo/cart/controller/*.controller` to `_esm/controller/*.controller.js` without `sap.ui.predefine()` source overlays, `sap.ui.loader._.defineModuleSync()` registration, or generated controller wrapper files, and the generated `_esm` app modules can resolve app/mock resource URLs without direct `sap.ui.require.toUrl()` calls
- async `ComponentContainer` startup can then mount the v2 views end to end while request logs stay on `Component-preload.js`, `_esm/Component.js`, and `_esm/controller/*.controller.js` instead of top-level `Component.js` or `/controller/*.controller.js` wrapper modules
- the remaining blocker is no longer “can v2 render?”, “can the root component avoid loader startup?”, or “can controller wrappers disappear?” but “can the remaining name-resolved surfaces become first-class ESM without relying on explicit UI5 runtime hooks?”

### 3. Debug vs Release Output Is Not Formalized Yet

The future target should be one source graph and two official ESM output policies:

- debug: preserve modules, readable, sourcemapped, unminified
- release: optimized, chunked, minified

The current PoC bundler harness proves candidate output shapes, but this has not yet been turned into an official CLI build mode.

## What The Local `framework-esm/` Directory Is For

`framework-esm/` now holds the shared source-native runtime helpers for the PoC.

Its job is to keep the remaining compatibility logic centralized while the app-owned source stays ESM-shaped:

- wait for the core-ready signal in both v1 and v2 bootstraps
- resolve app module names to `_esm/...` files through the shared import hook
- resolve resource-root URLs for app/mock assets
- expose `createUi5NamespaceFacade("sap/...")` so generated app/bootstrap code can bind framework globals without tracked per-module wrapper files

Earlier per-module wrapper files under `framework-esm/sap/...` were useful as an intermediate source-shape experiment, but they are no longer needed now that generated app/bootstrap code relies on lazy namespace facades after a single bootstrap preload. That cleanup makes the remaining loader dependency explicit until the framework itself is actually dual-published.

## Recommended Migration Phases

### Phase 1: CLI Experimental Source-Build Mode

Add an experimental UI5 CLI mode that builds directly from the app ESM source graph instead of rebuilding `dist-esm` from `dist`.

Concrete work items:

1. Add a CLI input mode for app-owned ESM sources.
2. Treat framework modules as external during the experiment, with the current `framework-esm/` helpers limited to bootstrap/runtime compatibility work.
3. Emit two output modes from the same source graph:
   - `dist-esm-debug`
   - `dist-esm-release`
4. Keep the current assembler only as a fallback compatibility mode.

Success criterion:

- the CLI can produce ESM outputs without copying `dist` first.

### Phase 2: App Source Stops Calling `sap.ui.require` Directly

Replace `requireUI5` / `requireUI5All` in the app source with generated runtime bindings that do not call `sap.ui.require()` from app-owned modules.

Concrete work items:

1. Create and validate a bridge-free variant of the app source that does not call `requireUI5` / `requireUI5All`.
2. Keep the existing mixed-mode overlay in parallel during the transition.
3. Compare wrapper-import and runtime-facade variants for bundle shape and debuggability until true framework ESM entrypoints exist.

Success criterion:

- app-owned source no longer calls `sap.ui.require()` directly.

### Phase 3: Runtime Support For ESM App Module Resolution

Teach the runtime to resolve app-owned modules without `sap.ui.predefine()` re-registration.

Concrete work items:

1. Define an ESM-native component bootstrap path.
2. Define how controllers, fragments, views, and router targets resolve under ESM.
3. Generalize the current `sap.ui.require` import-hook path into a first-class runtime path for the remaining name-resolved surfaces such as controller extensions, fragments, `ComponentSupport`, and other module-name-driven entry points.
4. Make `ComponentSupport` and related startup flows ESM-aware.

Success criterion:

- the shopping-cart app can start without `resources/esm-bridge.js`.

### Phase 4: Framework Dual-Publishing

Move the framework from facade simulation to real ESM publication.

Concrete work items:

1. Produce stable ESM entrypoints for the framework modules currently consumed through the loader.
2. Guarantee equivalent debug and release publishing for those modules.
3. Define supported import specifiers and packaging policy.
4. Decide which parts stay external versus bundled.

Success criterion:

- the current runtime compatibility helpers no longer need to compensate for missing framework ESM entrypoints.

### Phase 5: Bridge Decommissioning

Once runtime resolution and framework publishing are in place, remove the bridge from the main path.

Concrete work items:

1. Keep the bridge only behind a legacy compatibility flag.
2. Migrate PoCs and selected apps to the new ESM-native mode.
3. Remove `sap.ui.predefine()` registration from the default ESM path.

Success criterion:

- mixed-mode bridge support is optional, not required.

## Immediate Concrete Next Steps

If this work continues right now, the next practical tasks should be:

1. Decide whether the remaining central framework preload should intentionally stay loader-backed until the framework publishes named ESM entrypoints.
2. Investigate whether any supported UI5 runtime API exists to execute anonymous framework `sap.ui.define(...)` files without `sap.ui.require()`; current loader inspection suggests the answer is no.
3. Formalize `sap-ui-version.json` generation for source-native serve/build mode instead of leaving it as PoC-only logic.
4. Port the current source-native experiment into the CLI fork as an experimental build mode instead of keeping it only in the PoC repo.

## Bottom Line

The PoC already proved that the app side can move to ESM and that source-driven bundler builds are viable.

The remaining work is not “how do we copy files more cleanly.”

The remaining work is:

- ESM-native framework publishing
- ESM-native runtime resolution without generated wrapper files, controller-specific runtime patches, or a loader-managed central framework preload
- ESM-native CLI build outputs

That is the path that replaces manipulation with productizable architecture.