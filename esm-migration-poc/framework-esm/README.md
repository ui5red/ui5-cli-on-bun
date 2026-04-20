# Source-Native Runtime Helpers

This directory now contains the shared runtime helpers used by the bridge-free source-native PoCs.

The main implementation is `./_runtime.js`. It centralizes the runtime contract that both shopping-cart apps currently need:

- waiting for an initialized UI5 core or the captured `sap-ui-core-ready` event
- resolving app and mock resource URLs from bootstrap resource roots without direct app-side `sap.ui.require.toUrl()` calls
- preloading framework modules through the existing loader contract
- installing the shared `sap.ui.require` import hook that redirects app component and controller module names to `_esm/...` files
- creating lazy `createUi5NamespaceFacade("sap/...")` bindings after that bootstrap preload

What changed during cleanup:

- the earlier per-module `framework-esm/sap/...` wrapper experiment is no longer kept in-repo because generated app/bootstrap code no longer imports those wrapper files
- the remaining framework dependency is now expressed explicitly as one loader-backed preload plus runtime namespace facades rather than as a tracked wrapper tree

What this still does not solve:

- the current UI5 runtime still resolves controllers, views, routes, and components through the loader/module-name contract
- `sap-ui-core.js` and the framework resources available in this workspace are still AMD / `sap.ui.predefine` based
- this directory therefore supports the current bridge-free app experiment, but it does not replace real framework dual-publishing or ESM-native runtime support

The authoritative follow-up roadmap is documented in `../bridge-free-roadmap.md`.