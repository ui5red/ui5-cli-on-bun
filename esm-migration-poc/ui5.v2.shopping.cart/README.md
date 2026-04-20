# ESM Migration PoC — UI5 v2.0.0 Shopping Cart

This proof of concept converts all application modules of the UI5 2.0.0 [Shopping Cart demo app](https://sdk.openui5.org/test-resources/sap/m/demokit/cart/webapp/index.html) from UI5's AMD format (`sap.ui.define`) to native ES Modules (`import`/`export`), while keeping the UI5 framework itself untouched.

## How UI5 v2.0.0 Bootstrap Works

The v2.0.0 bootstrap is fundamentally different from v1.x — it uses a cascading, event-driven architecture:

1. `<script src="sap-ui-core.js">` loads `sap-ui-boot.js`, which kicks off a multi-phase cascade:
   - `ui5loader.js` — the module loader
   - `_bootConfig.js` — configuration resolution
   - `autoconfig.js` — automatic settings detection
   - `_runBoot.js` — final boot orchestration via `boot.json`
2. `boot.json` defines four phases: `config` → `preBoot` → `boot` → `postBoot`
3. When all phases complete, UI5 dispatches a **`sap-ui-core-ready` CustomEvent** on `document`
4. The traditional `data-sap-ui-on-init` attribute still works but resolves to `sapUiOnInit` — it fires after the event

The critical challenge: `<script type="module">` is **deferred by spec**, so it may run _after_ the `sap-ui-core-ready` event has already fired and been lost. This requires a synchronous script to capture the event.

## ESM Migration Approach

### The Problem

UI5 uses an AMD-style module system (`sap.ui.define` / `sap.ui.require`). Modern bundlers like Bun.build cannot tree-shake or statically analyze AMD modules — they need native ES Modules.

### The Solution: Hybrid ESM + AMD Bridge

Application modules are converted to native ESM, but framework modules (controllers, models, routing, etc.) remain AMD. A bridge connects the two worlds:

```
┌──────────────────┐    import     ┌──────────────────┐  predefine  ┌──────────────┐
│  ESM Module (.js)│──────────────>│  ESM-AMD Bridge  │────────────>│ ui5loader reg│
└──────────────────┘               └──────────────────┘             └──────────────┘
```

**`esm-helpers.js`** — wraps `sap.ui.require()` in Promises for top-level `await`:

```javascript
export function requireUI5(moduleName) {
    return new Promise((resolve, reject) => {
        sap.ui.require([moduleName], resolve, reject);
    });
}

export function requireUI5All(...moduleNames) {
    return new Promise((resolve, reject) => {
        sap.ui.require(moduleNames, (...modules) => resolve(modules), reject);
    });
}
```

**Converted modules** use native `import` for app dependencies and `requireUI5` for framework dependencies:

```javascript
// controller/BaseController.js (ESM version)
import { requireUI5All } from "../esm-helpers.js";
import cart from "../model/cart.js";                    // native ESM — bundleable

const [Controller, MessageToast, UIComponent, History] = await requireUI5All(
    "sap/ui/core/mvc/Controller",                       // AMD — opaque to bundler
    "sap/m/MessageToast",
    "sap/ui/core/UIComponent",
    "sap/ui/core/routing/History"
);

export default Controller.extend("sap.ui.demo.cart.controller.BaseController", {
    cart,
    getRouter() { return UIComponent.getRouterFor(this); },
    // ...
});
```

**`esm-bridge.js`** — eagerly imports all ESM modules and registers them into ui5loader's AMD registry via `sap.ui.predefine()`, so the UI5 runtime sees them as normal AMD modules.

### ESM Bootstrap (`index-esm.html`)

The v2.0.0 ESM bootstrap requires a **three-step** process to handle the asynchronous core-ready event:

```html
<!-- Step 1: Boot UI5 core (no data-sap-ui-on-init) -->
<script id="sap-ui-bootstrap" src="resources/sap-ui-core.js"
    data-sap-ui-resource-roots='{ "sap.ui.demo.cart": "./" }'>
</script>

<!-- Step 2: Capture core-ready event (sync script runs before module scripts) -->
<script>
    window.__ui5CoreReady = new Promise(function(resolve) {
        document.addEventListener("sap-ui-core-ready", resolve, { once: true });
    });
</script>

<!-- Step 3: After core ready, load bridge, then init app -->
<script type="module">
    await window.__ui5CoreReady;
    await import("./resources/esm-bridge.js");
    const mockserver = await new Promise((resolve, reject) => {
        sap.ui.require(["sap/ui/demo/cart/localService/mockserver"], resolve, reject);
    });
    await mockserver.init();
    sap.ui.require(["sap/ui/core/ComponentSupport"]);
</script>
```

Why the extra sync script? The `sap-ui-core-ready` event fires once and is not re-emitted. A `<script type="module">` is deferred, so by the time it executes the event may have already fired. The sync `<script>` sets up the listener _immediately_ and stores the resolution in a Promise that the module script can await. This is the key difference from the v1.x bootstrap.

### v1.x vs v2.0.0 Bootstrap Comparison

| Aspect | v1.x | v2.0.0 |
|--------|------|--------|
| Bootstrap script | `sap-ui-core.js` (synchronous init) | `sap-ui-core.js` → `sap-ui-boot.js` (cascading phases) |
| Init signal | `data-sap-ui-on-init` callback | `sap-ui-core-ready` CustomEvent |
| ESM bootstrap steps | 2 (load core, module script) | 3 (load core, sync event capture, module script) |
| Event capture needed | No — ui5loader available immediately | Yes — must catch event before module script defers |
| `data-sap-ui-async` | Explicit attribute needed | Default behavior in v2 |
| `data-sap-ui-compat-version` | Used (`"edge"`) | Removed in v2 |

### Overlay Strategy

ESM files are not mixed into the original source. Instead, the build process:

1. `bun run build` produces the standard AMD `dist/`
2. `build:esm` rebuilds `dist-esm/` from that output and removes `Component-preload.js`
3. Every `esm-overlay/*.js` file is written into `dist-esm/` twice: once as the runtime module and once as the matching debug artifact using the UI5 naming that already exists in `dist/`
4. Unused AMD-only app leftovers such as `initMockServer.js` and stale sourcemaps for replaced modules are removed
5. The assembler validates that non-framework app modules left in `dist-esm/` no longer contain `sap.ui.define`

This keeps the original app untouched, treats `esm-overlay/` as the source of truth for application modules, and leaves the framework payload from `ui5 build` intact.

## Converted Modules

18 application modules were converted (all application-level JS in the project):

| Module | App Imports (ESM) | Framework Deps (requireUI5) |
|--------|------------------|-----------------------------|
| `model/formatter.js` | — | `NumberFormat` |
| `model/cart.js` | — | `MessageBox`, `MessageToast` |
| `model/models.js` | — | `JSONModel`, `Device` |
| `model/EmailType.js` | — | `String` type, `ValidateException`, `ResourceModel` |
| `model/LocalStorageModel.js` | — | `JSONModel`, `Storage` |
| `localService/mockserver.js` | — | `MockServer`, `JSONModel`, `Log` |
| `Component.js` | `LocalStorageModel`, `models` | `UIComponent`, `Device` |
| `controller/BaseController.js` | `cart` | `Controller`, `MessageToast`, `UIComponent`, `History` |
| `controller/App.controller.js` | `BaseController` | `JSONModel` |
| `controller/Cart.controller.js` | `BaseController`, `formatter` | `JSONModel`, `Device`, `MessageBox`, `MessageToast` |
| `controller/Category.controller.js` | `BaseController`, `formatter` | `Device`, `Filter`, `FilterOperator`, `JSONModel`, `Fragment` |
| `controller/Checkout.controller.js` | `BaseController`, `EmailType`, `formatter` | `Link`, `MessageBox`, `MessageItem`, `MessagePopover`, `Messaging`, `JSONModel` |
| `controller/Comparison.controller.js` | `BaseController`, `formatter` | — |
| `controller/Home.controller.js` | `BaseController`, `formatter` | `Filter`, `FilterOperator`, `Device` |
| `controller/Welcome.controller.js` | `BaseController`, `cart`, `formatter` | `JSONModel`, `Filter`, `FilterOperator` |
| `controller/Product.controller.js` | `BaseController`, `formatter` | — |
| `controller/NotFound.controller.js` | `BaseController` | `UIComponent` |
| `controller/OrderCompleted.controller.js` | `BaseController` | — |

Modules like `Comparison.controller.js`, `Product.controller.js`, and `OrderCompleted.controller.js` have zero direct framework deps — they access the framework only through inherited `BaseController` methods.

## Files Created

```
esm-overlay/
├── index-esm.html                      # ESM bootstrap (3-step with event capture)
├── esm-helpers.js                      # requireUI5 / requireUI5All helpers
├── resources/
│   └── esm-bridge.js                   # Registers 18 ESM modules into ui5loader
├── Component.js                        # ESM root component
├── controller/
│   ├── BaseController.js
│   ├── App.controller.js
│   ├── Cart.controller.js
│   ├── Category.controller.js
│   ├── Checkout.controller.js
│   ├── Comparison.controller.js
│   ├── Home.controller.js
│   ├── NotFound.controller.js
│   ├── OrderCompleted.controller.js
│   ├── Product.controller.js
│   └── Welcome.controller.js
├── model/
│   ├── cart.js
│   ├── EmailType.js
│   ├── formatter.js
│   ├── LocalStorageModel.js
│   └── models.js
└── localService/
    └── mockserver.js

serve.js                                # Bun.serve static file server
build-esm.js                            # Bun.build test suite (15 tests)
package.json                            # Updated with ESM scripts
```

## Usage

```sh
# Build the standard AMD dist, then create the ESM overlay
bun run build:esm

# Serve the ESM version
bun run serve:esm
# Open http://localhost:8081/index-esm.html

# Serve the original AMD version for comparison
bun run serve
# Open http://localhost:8080

# Run Bun.build validation tests
bun run test:esm-build
```

## What the Bun.build Tests Validate

The `build-esm.js` test suite validates:

- All 16 application modules bundle without errors
- Output files have reasonable sizes (500B – 200KB)
- Module content markers are present in bundles
- **Framework isolation**: `sap.ui.define()` does NOT appear in bundles (framework stays separate)
- **Tree-shaking**: a single-module bundle is smaller than the all-modules bundle
- **Dependency chains**: `Cart.controller` → `BaseController` → `cart` model all resolve
- **Minification**: minified bundle is significantly smaller than unminified

## Bridge-Free Source Exploration

This app now also supports the same generated bridge-free source variant used for the v1 exploration, but against the v2 shopping-cart source tree.

What changes in that variant:

- generated app modules bind framework dependencies through `createUi5NamespaceFacade("sap/...")` from the shared runtime instead of importing per-module `./framework/sap/...` wrapper modules
- the HTML bootstrap uses a module entrypoint (`bootstrap.js`) instead of `resources/esm-bridge.js`
- the app no longer uses `requireUI5` helpers in its source files
- the variant is still exploratory and continues to rely on the current UI5 runtime underneath

Useful commands:

```sh
# Generate the bridge-free source variant
bun run generate:esm:source

# Build debug and release ESM outputs directly from that source variant
bun run build:esm:source

# Serve the generated source variant
bun run serve:esm:source
# Open http://localhost:8082/esm-source-bridge-free/index-esm.html

# Serve the debug preserve-modules build
bun run serve:esm:source:debug
# Open http://localhost:8083/dist-esm-source-debug/index-esm.html

# Serve the release bundled build
bun run serve:esm:source:release
# Open http://localhost:8084/dist-esm-source-release/index-esm.html
```

Because UI5 v2 bootstraps asynchronously, the bridge-free source variant depends on the shared runtime helper to wait for an already-initialized core or the `sap-ui-core-ready` event before starting the app module bootstrap. Any remaining runtime failure is therefore expected to indicate loader-based UI5 assumptions rather than a missed app-source conversion.

The current source-native runtime contract is:

- wait for the captured `sap-ui-core-ready` signal before the module bootstrap continues
- synthesize `dist/resources/sap-ui-version.json` from `ui5.yaml` when the normal build output does not provide it
- preload the framework module set needed by the manifest and generated app code
- answer standard `Component-preload.js` requests with a generated source-native preload script that module-preloads `_esm/` app modules and prefetches manifest/XML/i18n/metadata resources
- create lazy `createUi5NamespaceFacade("sap/...")` bindings in generated app/bootstrap code instead of importing per-module `./framework/sap/...` wrapper modules
- install a shared `sap.ui.require` import hook that redirects `sap/ui/demo/cart/Component` to `_esm/Component.js`
- start the root component through async `ComponentContainer` / `Component.create`
- let standard `Controller.create` resolve XML-view controllers through that same import hook to `_esm/controller/*.controller.js`
- resolve app and mock resource URLs from the bootstrap resource-root config so the generated `_esm` modules no longer call `sap.ui.require.toUrl()` directly

Current probe status:

- the bridge-free source variant now generates, builds, serves, and mounts a UI5 view from the app root under the same source-native flow as v1
- browser probing confirms the rendered shopping-cart UI with no page errors; request logging now shows `Component-preload.js` in both the source-root and release flows, followed by `_esm/Component.js` and direct `_esm/controller/*.controller.js` fetches with no top-level `Component.js` or `/controller/*.controller.js` wrapper requests, and the only remaining console noise is the expected locale fallback 404s for `i18n_en_US.properties` and `i18n_en.properties`
- the latest narrowing step also removed per-module `framework/sap/...` wrapper imports from generated app/bootstrap code; the remaining architectural gap is no longer view rendering, eager loader registration, root-component startup, generated controller wrappers, or direct `sap.ui.require` calls in the app-owned source-native modules, but the fact that the remaining name-resolved runtime seams still depend on explicit UI5 runtime hooks and a loader-managed central framework preload rather than a truly first-class loader-free path
