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

1. `ui5 build --all` produces the standard AMD `dist/`
2. `dist/` is copied to `dist-esm/`
3. `Component-preload.js` is removed (prevents AMD versions from shadowing ESM-registered modules)
4. `esm-overlay/*` is copied over `dist-esm/`

This keeps the original app untouched and makes the ESM version a clean overlay.

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
