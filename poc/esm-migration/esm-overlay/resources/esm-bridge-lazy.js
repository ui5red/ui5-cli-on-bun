/**
 * Lazy-only ESM Bridge for UI5
 *
 * This variant does NOT eagerly import any ESM modules.
 * It only registers ESM file paths via sap.ui.registerESMModule().
 * The ui5loader will use import() to load them on-demand when first required.
 *
 * This tests the modified ui5loader's native ESM loading path.
 */

const esmModuleMap = {
	"sap/base/assert":                     "sap/base/assert-dbg",
	"sap/base/Log":                        "sap/base/Log-dbg",
	"sap/base/util/now":                   "sap/base/util/now-dbg",
	"sap/base/strings/camelize":           "sap/base/strings/camelize-dbg",
	"sap/base/strings/capitalize":         "sap/base/strings/capitalize-dbg",
	"sap/base/strings/escapeRegExp":       "sap/base/strings/escapeRegExp-dbg",
	"sap/base/strings/formatMessage":      "sap/base/strings/formatMessage-dbg",
	"sap/base/strings/hash":              "sap/base/strings/hash-dbg",
	"sap/base/strings/hyphenate":          "sap/base/strings/hyphenate-dbg",
	"sap/base/strings/toHex":             "sap/base/strings/toHex-dbg",
	"sap/base/strings/whitespaceReplacer": "sap/base/strings/whitespaceReplacer-dbg",
};

let count = 0;
if (typeof sap !== "undefined" && typeof sap.ui.registerESMModule === "function") {
	for (const [name, path] of Object.entries(esmModuleMap)) {
		sap.ui.registerESMModule(name, path);
		count++;
	}
	console.log(`[ESM-AMD Bridge (lazy)] Registered ${count} modules for on-demand ESM loading`);
} else {
	console.warn("[ESM-AMD Bridge (lazy)] sap.ui.registerESMModule not available — loader not modified?");
}

export { esmModuleMap };
