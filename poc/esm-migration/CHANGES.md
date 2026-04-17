# UI5 ESM Migration — Changes Documentation

This document records every change made at the UI5 resource level during the
AMD-to-ESM migration experiment.

## Overview

**Goal**: Evaluate whether UI5's AMD-style module system (`sap.ui.define` / `sap.ui.require`)
can be incrementally migrated to native ES Modules, enabling standard bundlers
(Bun.build, esbuild, Rollup) to process UI5 code with tree-shaking and modern optimization.

**Approach**: Hybrid — start with leaf utility modules, build an ESM-AMD bridge for
coexistence, and modify the ui5loader to support `import()`.

**Result**: Successful proof-of-concept. 11 modules converted (including the stateful
`sap/base/Log`), bridge functional in both eager and lazy modes, ui5loader modified,
Bun.build tree-shakes correctly, full browser validation complete.

---

## 1. Modules Converted from AMD to ESM

### Conversion Pattern

**Before (AMD)**:
```javascript
sap.ui.define(["sap/base/assert"], function(assert) {
    "use strict";
    var fn = function(x) { ... };
    return fn;
});
```

**After (ESM)**:
```javascript
import assert from "../assert-dbg.js";

export default function fn(x) { ... }
```

### Key differences:
| Aspect | AMD (`sap.ui.define`) | ESM (`import`/`export`) |
|--------|----------------------|------------------------|
| Dependencies | String array: `["sap/base/assert"]` | `import` statement: `import assert from "../assert-dbg.js"` |
| Module ID | Implicit from file path or explicit first arg | No module ID — identity is the file URL |
| Export | `return value` from factory function | `export default value` |
| Execution | Lazy (on first `require`) | Eager (at `import` time) |
| Scope | IIFE via factory function | Module scope (native) |
| Async loading | Custom script-tag loader | Native `import()` |
| Bundler support | UI5 tooling only | Any standard bundler |

### Stateful Module Conversion (sap/base/Log)

The `sap/base/Log` module is the most complex conversion, demonstrating that
ESM works for stateful modules with deep internal complexity.

**Challenges and how they were solved:**

1. **Mutable module-level state** — `var` declarations like `aLog`, `mMaxLevel`,
   `iLogEntriesLimit` become `let` declarations at module scope. ESM module scope
   is naturally isolated (no IIFE needed).

2. **Namespace object pattern** — The AMD version builds up `Log` as a plain object
   with methods attached (`Log.error = function...`). Same pattern works in ESM:
   `const Log = {}; Log.error = function...; export default Log;`.

3. **Closure-based private functions** — Functions like `log()`, `discardLogEntries()`,
   `getLogEntryListenerInstance()` that close over module state. These just become
   module-level functions — ESM module scope provides the same privacy as AMD's
   factory function scope.

4. **Logger constructor class** — The inner `Logger` class that delegates to `Log`
   methods. Remains a function constructor at module scope.

5. **ESM singleton semantics** — Confirmed that re-importing the module returns the
   same instance. `Log.error("test")` from one import is visible in `Log.getLogEntries()`
   from another import — state is shared, not copied.

### Converted Modules

#### Zero-dependency leaf modules (sap/base/strings/*)

| Module | Status | Notes |
|--------|--------|-------|
| `sap/base/strings/camelize` | Converted | Hyphen → camelCase. Zero deps. |
| `sap/base/strings/capitalize` | Converted | First char uppercase. Zero deps. |
| `sap/base/strings/escapeRegExp` | Converted | Escape regex special chars. Zero deps. |
| `sap/base/strings/hash` | Converted | String hash code generator. Zero deps. |
| `sap/base/strings/hyphenate` | Converted | CamelCase → kebab-case. Zero deps. |
| `sap/base/strings/toHex` | Converted | Int → padded hex string. Zero deps. |
| `sap/base/strings/whitespaceReplacer` | Converted | Whitespace → non-breaking space. Zero deps. |

#### Zero-dependency utility modules (sap/base/*)

| Module | Status | Notes |
|--------|--------|-------|
| `sap/base/assert` | Converted | Simple assertion with `console.assert`. Zero deps. |
| `sap/base/util/now` | Converted | High-resolution timestamp via `performance.timeOrigin + performance.now()`. Zero deps. |

#### Stateful module with ESM dependency

| Module | Status | Notes |
|--------|--------|-------|
| `sap/base/Log` | Converted | Full logging API (284 lines). **Imports `util/now` via ESM**. Complex conversion: mutable module-level state (`aLog`, `mMaxLevel`), namespace object pattern, closure-based private functions, Logger constructor class. Proves ESM singleton semantics preserve shared state across imports. |

#### Module with ESM dependency

| Module | Status | Notes |
|--------|--------|-------|
| `sap/base/strings/formatMessage` | Converted | MessageFormat pattern replacement. **Imports `assert` via ESM `import` statement**. First module to demonstrate the ESM dependency chain. |

#### Batch 2: Utility and array modules (2026-04-18)

| Module | Status | Notes |
|--------|--------|-------|
| `sap/base/util/isPlainObject` | Converted | Checks if a value is a plain object (created with `{}` or `new Object`). Zero deps. |
| `sap/base/util/deepClone` | Converted | Deep clones plain objects and arrays. **Imports `isPlainObject` via ESM**. Demonstrates ESM dependency chain in util/. |
| `sap/base/util/each` | Converted | Iterates over objects (key, value) and arrays (index, value). Zero deps. |
| `sap/base/util/values` | Converted | Returns object values as an array. Zero deps. |
| `sap/base/util/uid` | Converted | Pseudo-unique ID generator with module-level counter state. Proves stateful counter modules work in ESM. Zero deps. |
| `sap/base/array/uniqueSort` | Converted | Deduplicates arrays preserving first-occurrence order. First module in `sap/base/array/` namespace. Zero deps. |

---

## 2. ESM-AMD Bridge Layer

**File**: `dist-esm/resources/esm-bridge.js`

The bridge enables ESM and AMD modules to coexist during the migration. It supports
two modes:

### Mode A: Eager Registration (`sap.ui.predefine`)
```javascript
import camelize from "./sap/base/strings/camelize-dbg.js";
sap.ui.predefine("sap/base/strings/camelize", [], function() {
    return camelize;
});
```
The ESM module is imported at bridge load time and its value is immediately registered
in the ui5loader's module registry. When AMD code later calls
`sap.ui.require(["sap/base/strings/camelize"], ...)`, it gets the ESM module's export.

### Mode B: Lazy Registration (`sap.ui.registerESMModule`)
```javascript
sap.ui.registerESMModule("sap/base/strings/camelize", "./sap/base/strings/camelize-dbg.js");
```
Tells the loader *where* to find the ESM file. The module is NOT loaded until first
`sap.ui.require()` call — at that point, the loader uses `import()` instead of a
script tag.

### HTML Integration
```html
<!-- 1. Load ui5loader (AMD) normally -->
<script src="resources/sap-ui-core.js" ...></script>

<!-- 2. Load ESM bridge after loader, before app -->
<script type="module">
    import "./resources/esm-bridge.js";
    sap.ui.require(["sap/ui/core/ComponentSupport"], (CS) => CS.run());
</script>
```

The `data-sap-ui-on-init` attribute is removed from the bootstrap script tag, and the
app is started manually after the bridge has registered all ESM modules.

---

## 3. ui5loader Modifications

**File**: `dist-esm/resources/sap-ui-custom-dbg.js`

Three changes were made to the ui5loader:

### 3a. ESM Module Registry

Added after `strictModuleDefinitions` (around line 146):

```javascript
const mESMModules = new Map();

function registerESMModule(sModuleName, sESMPath) {
    const sResourceName = sModuleName + ".js";
    if (!sESMPath) {
        sESMPath = sModuleName + "-dbg.js";
    }
    mESMModules.set(sResourceName, sESMPath);
}

function isESMModule(sResourceName) {
    return mESMModules.has(sResourceName);
}

function loadESM(oModule, sResourceName) {
    const sESMPath = mESMModules.get(sResourceName);
    const sFullUrl = getResourcePath(sESMPath.replace(/\.js$/, ""), ".js");
    import(sFullUrl).then(function(esmModule) {
        const moduleValue = esmModule.default !== undefined ? esmModule.default : esmModule;
        oModule.ready(moduleValue);
    }).catch(function(err) {
        oModule.failWith("failed to load ESM module {id}", err);
    });
}
```

### 3b. ESM Interception in `requireModule`

Added in `requireModule()`, after `oModule.state = LOADING` but before the
sync/async branching:

```javascript
// If this module is registered as ESM, use dynamic import()
if (bAsync && isESMModule(sModuleName)) {
    loadESM(oModule, sModuleName);
    if (!bSkipBundle) {
        requireDependenciesUpfront(sModuleName);
    }
    return oModule.deferred().promise;
}
```

This intercepts the normal `loadScript()` path for ESM-registered modules and
replaces it with `import()`. The module's `deferred().promise` is returned just
like the script-tag path, so callers see no difference.

### 3c. Public API

Exposed on `sap.ui`:
```javascript
sap.ui.registerESMModule = registerESMModule;
```

And on the internal `privateAPI` object:
```javascript
privateAPI.registerESMModule = registerESMModule;
privateAPI.isESMModule = isESMModule;
privateAPI.getESMModules = () => new Map(mESMModules);
```

---

## 4. Browser Validation Results

### Mode A: Eager Bridge (`index-esm.html`)

Tested by serving `dist-esm/` with a static file server and loading `index-esm.html`.

| Test | Result |
|------|--------|
| App renders (sample.ts.app with high-five graphic, "SAY HELLO" button) | PASS |
| Console shows `[ESM-AMD Bridge] Registered 11 modules eagerly` | PASS |
| `sap.ui.require(["sap/base/strings/camelize"], fn)` returns working function | PASS |
| `camelize("foo-bar")` returns `"fooBar"` | PASS |
| `sap.ui.require(["sap/base/Log"], fn)` returns Log object with full API | PASS |
| Log.error() creates entries with timestamps (via `util/now` ESM dep) | PASS |
| No ESM-related errors in console | PASS |

### Mode B: Lazy Bridge (`index-esm-lazy.html`)

Tested with the lazy-only bridge and an inline shim that monkey-patches
`sap.ui.require` to intercept ESM-registered modules and load them via `import()`.

| Test | Result |
|------|--------|
| App renders correctly | PASS |
| Console shows `[ESM Lazy Shim] Installed import()-based module loading shim` | PASS |
| Console shows `[ESM-AMD Bridge (lazy)] Registered 11 modules for on-demand ESM loading` | PASS |
| `sap.ui.require(["sap/base/strings/camelize"], fn)` loads via `import()` | PASS |
| `camelize("foo-bar-baz")` returns `"fooBarBaz"` | PASS |
| `capitalize("hello")` returns `"Hello"` | PASS |
| `hyphenate("fooBar")` returns `"foo-bar"` | PASS |
| `hash("test")` returns `3569518` | PASS |
| `formatMessage("Say {0}", ["Hello"])` returns `"Say Hello"` (dependency chain: formatMessage → assert) | PASS |
| `Log` object loads with full API (Level enum, error(), getLogEntries()) | PASS |
| `Log.error()` creates entries with timestamps (dependency chain: Log → util/now) | PASS |
| Second `require` of same module is cache hit (~0.1ms, no re-import) | PASS |
| No ESM-related errors in console | PASS |

### Lazy Shim Fix

The initial shim used `sap.ui.require.toUrl(path) + ".js"` to resolve module URLs,
which produced bare relative paths like `resources/sap/base/strings/camelize-dbg.js`.
The browser's `import()` cannot resolve bare relative paths — it needs `./` prefix,
`/` prefix, or an absolute URL. Fix: prepend `"./"` to the resolved URL.

```javascript
// BEFORE (broken):
const url = sap.ui.require.toUrl(path) + ".js";

// AFTER (working):
const url = "./" + sap.ui.require.toUrl(path) + ".js";
```

---

## 5. Bundler Results

### Bun.build Compatibility

| Test | Result |
|------|--------|
| Bundle all 9 ESM modules | PASS — 4,307 bytes |
| Tree-shaking (import only camelize) | PASS — 434 bytes (90% reduction) |
| Minification | PASS — 2,746 bytes (36% reduction) |
| Dependency chain (formatMessage → assert) | PASS — transitive dep included |
| Unused module elimination | PASS — formatMessage/hash not in single-module bundle |

### Size Comparison

| Approach | All 9 modules | Single module (camelize) |
|----------|---------------|--------------------------|
| Original AMD (ui5loader predefine) | ~2,800 bytes (modules only, excluding loader) + ~100KB loader | N/A (no tree-shaking) |
| ESM + Bun.build (unminified) | 4,307 bytes (self-contained, no loader needed) | 434 bytes |
| ESM + Bun.build (minified) | 2,746 bytes | ~280 bytes (est.) |

Key insight: The ESM approach **eliminates the need for the ui5loader entirely** for
modules that have been converted. A bundled ESM module is self-contained — it doesn't
need a custom AMD loader to resolve dependencies.

---

## 6. Breaking Changes & Limitations

### What breaks when moving from AMD to ESM:

1. **`sap.ui.requireSync()` cannot load ESM modules** — `import()` is always async.
   Any code using `requireSync` on a converted module would fail.
   
2. **Module identity changes** — AMD modules are identified by string names
   (`"sap/base/strings/camelize"`). ESM modules are identified by URL. The bridge
   maps between them, but direct registry lookups by name bypass converted modules
   unless the bridge has run.

3. **Execution timing** — AMD factory functions execute lazily (on first require).
   ESM modules execute eagerly at import time. This can affect initialization order
   in code that depends on lazy execution.

4. **`sap.ui.define` with inline module name** — Modules that pass their own name
   as the first argument to `sap.ui.define` need that name removed when converting
   to ESM (ESM modules don't have explicit names).

5. **Circular dependencies** — AMD handles circular deps by providing `undefined`
   as an intermediate value. ESM has live bindings but different semantics for
   uninitialized imports. Circular dep patterns may need adjustment.

### Limitations of this PoC:

- Only 11 leaf/near-leaf modules converted — does not test complex modules with
  deep dependency trees, UI controls, or framework core
- No performance benchmarks (load time, parse time) yet
- No source map support for converted modules
- Lazy mode shim monkey-patches `sap.ui.require` — production use would need
  the loader-level ESM support (section 3) instead

---

## 7. Recommendations

### Short-term (immediate value):

1. **Convert a module consumed by UI controls**: Pick a `sap/base/` utility that's
   used by `sap/m/Button` or similar. Verify the control still works when the
   utility comes from ESM via the bridge.

2. **Test with the modified loader**: The lazy mode currently works via an inline
   shim. Switch to using `sap-ui-custom-dbg.js` (section 3) with its built-in
   `import()` support for a cleaner integration.

### Medium-term (expand the PoC):

3. **Benchmark**: Compare load times for the AMD-preload approach vs. ESM-import
   approach for the converted modules.

### Long-term (architectural direction):

4. **Dual-format publishing**: UI5 libraries could ship both AMD and ESM versions.
   The bridge becomes a build-time concern rather than a runtime one.

5. **ui5loader as optional**: For apps that only use ESM-converted modules, the
   ui5loader could be replaced entirely by the native module system. The loader
   becomes a compatibility layer, not a requirement.

6. **Standard bundler integration**: With ESM modules, apps could use Bun.build /
   esbuild / Rollup directly for production builds, with tree-shaking eliminating
   unused framework code. This could dramatically reduce bundle sizes for apps
   that use a small subset of UI5.

---

## File Inventory

| File | Type | Description |
|------|------|-------------|
| `dist-esm/resources/sap/base/strings/camelize-dbg.js` | ESM module | Converted from AMD |
| `dist-esm/resources/sap/base/strings/capitalize-dbg.js` | ESM module | Converted from AMD |
| `dist-esm/resources/sap/base/strings/escapeRegExp-dbg.js` | ESM module | Converted from AMD |
| `dist-esm/resources/sap/base/strings/formatMessage-dbg.js` | ESM module | Converted from AMD, imports assert |
| `dist-esm/resources/sap/base/strings/hash-dbg.js` | ESM module | Converted from AMD |
| `dist-esm/resources/sap/base/strings/hyphenate-dbg.js` | ESM module | Converted from AMD |
| `dist-esm/resources/sap/base/strings/toHex-dbg.js` | ESM module | Converted from AMD |
| `dist-esm/resources/sap/base/strings/whitespaceReplacer-dbg.js` | ESM module | Converted from AMD |
| `dist-esm/resources/sap/base/assert-dbg.js` | ESM module | Converted from AMD |
| `dist-esm/resources/sap/base/util/now-dbg.js` | ESM module | Converted from AMD |
| `dist-esm/resources/sap/base/Log-dbg.js` | ESM module | Converted from AMD, stateful, imports util/now |
| `dist-esm/resources/esm-bridge.js` | Bridge | Dual-mode: eager predefine + lazy registerESMModule |
| `dist-esm/resources/esm-bridge-lazy.js` | Bridge | Lazy-only: registerESMModule only, no eager imports |
| `dist-esm/resources/sap-ui-custom-dbg.js` | Modified loader | ESM registry + import() support |
| `dist-esm/index-esm.html` | HTML | App entry with eager bridge integration |
| `dist-esm/index-esm-lazy.html` | HTML | App entry with lazy shim + lazy bridge |
| `test-esm-modules.js` | Test | Verifies ESM module correctness (30 tests) |
| `test-esm-bridge.js` | Test | Verifies bridge registration (27 tests) |
| `build-esm.js` | Test | Verifies Bun.build bundling (12 tests) |
