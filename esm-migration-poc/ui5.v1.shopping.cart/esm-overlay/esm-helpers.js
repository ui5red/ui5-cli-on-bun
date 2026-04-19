/**
 * ESM helpers for bridging UI5 AMD framework modules into ESM context.
 *
 * Application modules are converted to native ESM and can import each other
 * directly. However, they still depend on UI5 framework modules which remain
 * in the AMD registry. These helpers wrap sap.ui.require() in Promises so
 * ESM modules can use top-level await to resolve framework dependencies.
 *
 * Usage:
 *   import { requireUI5, requireUI5All } from "../esm-helpers.js";
 *   const Controller = await requireUI5("sap/ui/core/mvc/Controller");
 *   const [JSONModel, Device] = await requireUI5All("sap/ui/model/json/JSONModel", "sap/ui/Device");
 */

/**
 * Resolve a single UI5 AMD module.
 * @param {string} moduleName - UI5 module path (e.g. "sap/ui/core/mvc/Controller")
 * @returns {Promise<any>} The resolved module
 */
export function requireUI5(moduleName) {
	return new Promise((resolve, reject) => {
		sap.ui.require([moduleName], resolve, reject);
	});
}

/**
 * Resolve multiple UI5 AMD modules in parallel.
 * @param {...string} moduleNames - UI5 module paths
 * @returns {Promise<any[]>} Array of resolved modules in the same order
 */
export function requireUI5All(...moduleNames) {
	return new Promise((resolve, reject) => {
		sap.ui.require(moduleNames, (...modules) => resolve(modules), reject);
	});
}
