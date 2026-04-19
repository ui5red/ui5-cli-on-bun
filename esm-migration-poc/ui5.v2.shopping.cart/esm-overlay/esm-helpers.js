/**
 * ESM helpers for resolving UI5 framework AMD modules from ESM code.
 *
 * Application modules converted to ESM use native `import` for other app modules,
 * but framework modules (sap/ui/core/*, sap/m/*, etc.) remain in the AMD registry.
 * These helpers bridge that gap by wrapping `sap.ui.require()` in Promises,
 * allowing ESM modules to use top-level `await` for framework dependencies.
 *
 * This keeps framework references opaque to bundlers (Bun.build, esbuild) —
 * only app-to-app `import` statements are visible for bundling and tree-shaking.
 */

/**
 * Resolve a single UI5 AMD module.
 * @param {string} moduleName  UI5 module name, e.g. "sap/ui/core/UIComponent"
 * @returns {Promise<any>}
 */
export function requireUI5(moduleName) {
	return new Promise((resolve, reject) => {
		sap.ui.require([moduleName], resolve, reject);
	});
}

/**
 * Resolve multiple UI5 AMD modules in parallel.
 * @param {...string} moduleNames  UI5 module names
 * @returns {Promise<any[]>}  Resolved modules in the same order
 */
export function requireUI5All(...moduleNames) {
	return new Promise((resolve, reject) => {
		sap.ui.require(moduleNames, (...modules) => resolve(modules), reject);
	});
}
