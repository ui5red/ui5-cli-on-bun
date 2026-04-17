/**
 * ESM-AMD Bridge for UI5
 *
 * This module bridges ESM-converted UI5 modules back into the ui5loader's AMD registry.
 * It supports two modes of operation:
 *
 * MODE A: Eager registration (predefine)
 *   Import the ESM module, then call sap.ui.predefine() to register the value eagerly.
 *   The module is immediately available — no additional network request when first required.
 *
 * MODE B: Lazy registration (registerESMModule)
 *   Call sap.ui.registerESMModule() to tell the loader about the ESM file path.
 *   The module will be loaded via import() only when first required (on-demand).
 *   This is more efficient for large codebases where not all modules are needed.
 *
 * Architecture:
 *
 *   Mode A (eager):
 *   ┌─────────────────────┐    import     ┌──────────────────┐  predefine  ┌──────────────┐
 *   │  ESM Module (.js)   │──────────────▶│  ESM-AMD Bridge  │────────────▶│ ui5loader reg│
 *   └─────────────────────┘               └──────────────────┘             └──────────────┘
 *
 *   Mode B (lazy):
 *   ┌──────────────────┐  registerESMModule  ┌──────────────┐  import()  ┌─────────────────┐
 *   │  ESM-AMD Bridge  │───────────────────▶│ ui5loader reg │──────────▶│  ESM Module (.js)│
 *   └──────────────────┘                     └──────────────┘            └─────────────────┘
 *                                           (on first require)
 */

// List of all ESM-converted modules and their paths.
// This is the single source of truth for the migration.
const esmModuleMap = {
	"sap/base/assert":                     "./sap/base/assert-dbg.js",
	"sap/base/Log":                        "./sap/base/Log-dbg.js",
	"sap/base/util/now":                   "./sap/base/util/now-dbg.js",
	"sap/base/util/isPlainObject":         "./sap/base/util/isPlainObject-dbg.js",
	"sap/base/util/deepClone":             "./sap/base/util/deepClone-dbg.js",
	"sap/base/util/each":                  "./sap/base/util/each-dbg.js",
	"sap/base/util/values":                "./sap/base/util/values-dbg.js",
	"sap/base/util/uid":                   "./sap/base/util/uid-dbg.js",
	"sap/base/array/uniqueSort":           "./sap/base/array/uniqueSort-dbg.js",
	"sap/base/strings/camelize":           "./sap/base/strings/camelize-dbg.js",
	"sap/base/strings/capitalize":         "./sap/base/strings/capitalize-dbg.js",
	"sap/base/strings/escapeRegExp":       "./sap/base/strings/escapeRegExp-dbg.js",
	"sap/base/strings/formatMessage":      "./sap/base/strings/formatMessage-dbg.js",
	"sap/base/strings/hash":              "./sap/base/strings/hash-dbg.js",
	"sap/base/strings/hyphenate":          "./sap/base/strings/hyphenate-dbg.js",
	"sap/base/strings/toHex":             "./sap/base/strings/toHex-dbg.js",
	"sap/base/strings/whitespaceReplacer": "./sap/base/strings/whitespaceReplacer-dbg.js",
};

// --- MODE A: Eager registration ---

import assert from "./sap/base/assert-dbg.js";
import Log from "./sap/base/Log-dbg.js";
import now from "./sap/base/util/now-dbg.js";
import isPlainObject from "./sap/base/util/isPlainObject-dbg.js";
import deepClone from "./sap/base/util/deepClone-dbg.js";
import each from "./sap/base/util/each-dbg.js";
import values from "./sap/base/util/values-dbg.js";
import uid from "./sap/base/util/uid-dbg.js";
import uniqueSort from "./sap/base/array/uniqueSort-dbg.js";
import camelize from "./sap/base/strings/camelize-dbg.js";
import capitalize from "./sap/base/strings/capitalize-dbg.js";
import escapeRegExp from "./sap/base/strings/escapeRegExp-dbg.js";
import formatMessage from "./sap/base/strings/formatMessage-dbg.js";
import hash from "./sap/base/strings/hash-dbg.js";
import hyphenate from "./sap/base/strings/hyphenate-dbg.js";
import toHex from "./sap/base/strings/toHex-dbg.js";
import whitespaceReplacer from "./sap/base/strings/whitespaceReplacer-dbg.js";

const eagerModules = {
	"sap/base/assert": assert,
	"sap/base/Log": Log,
	"sap/base/util/now": now,
	"sap/base/util/isPlainObject": isPlainObject,
	"sap/base/util/deepClone": deepClone,
	"sap/base/util/each": each,
	"sap/base/util/values": values,
	"sap/base/util/uid": uid,
	"sap/base/array/uniqueSort": uniqueSort,
	"sap/base/strings/camelize": camelize,
	"sap/base/strings/capitalize": capitalize,
	"sap/base/strings/escapeRegExp": escapeRegExp,
	"sap/base/strings/formatMessage": formatMessage,
	"sap/base/strings/hash": hash,
	"sap/base/strings/hyphenate": hyphenate,
	"sap/base/strings/toHex": toHex,
	"sap/base/strings/whitespaceReplacer": whitespaceReplacer,
};

let eagerCount = 0;
for (const [name, value] of Object.entries(eagerModules)) {
	sap.ui.predefine(name, [], function() {
		return value;
	});
	eagerCount++;
}

// --- MODE B: Lazy registration ---

let lazyCount = 0;
if (typeof sap.ui.registerESMModule === "function") {
	for (const [name, path] of Object.entries(esmModuleMap)) {
		sap.ui.registerESMModule(name, path);
		lazyCount++;
	}
}

console.log(
	`[ESM-AMD Bridge] Registered ${eagerCount} modules eagerly (predefine), ` +
	`${lazyCount} modules for lazy ESM loading (registerESMModule)`
);

export { esmModuleMap, eagerModules };
