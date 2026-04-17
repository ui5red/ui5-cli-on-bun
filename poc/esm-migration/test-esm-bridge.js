/**
 * Test the ESM-AMD Bridge registration logic.
 *
 * This test simulates the browser environment by providing mock sap.ui APIs,
 * then imports the bridge and verifies all modules get registered correctly.
 */

console.log("=== ESM-AMD Bridge Tests ===\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
	try {
		fn();
		console.log(`  PASS: ${name}`);
		passed++;
	} catch (e) {
		console.log(`  FAIL: ${name}`);
		console.log(`        ${e.message}`);
		failed++;
	}
}

// Track what the bridge registers
const predefinedModules = new Map();
const esmRegisteredModules = new Map();

// Mock the sap.ui APIs that the bridge calls
globalThis.sap = {
	ui: {
		predefine(name, deps, factory) {
			predefinedModules.set(name, { deps, factory, value: factory() });
		},
		registerESMModule(name, path) {
			esmRegisteredModules.set(name, path);
		}
	}
};

// Import the bridge — this triggers all registrations
const { esmModuleMap, eagerModules } = await import("./dist-esm/resources/esm-bridge.js");

console.log("--- Mode A: Eager registration (predefine) ---");

const expectedModules = [
	"sap/base/assert",
	"sap/base/Log",
	"sap/base/util/now",
	"sap/base/util/isPlainObject",
	"sap/base/util/deepClone",
	"sap/base/util/each",
	"sap/base/util/values",
	"sap/base/util/uid",
	"sap/base/array/uniqueSort",
	"sap/base/strings/camelize",
	"sap/base/strings/capitalize",
	"sap/base/strings/escapeRegExp",
	"sap/base/strings/formatMessage",
	"sap/base/strings/hash",
	"sap/base/strings/hyphenate",
	"sap/base/strings/toHex",
	"sap/base/strings/whitespaceReplacer",
];

test(`bridge predefines ${expectedModules.length} modules`, () => {
	if (predefinedModules.size !== expectedModules.length) {
		throw new Error(`Expected ${expectedModules.length} modules, got ${predefinedModules.size}`);
	}
});

for (const moduleName of expectedModules) {
	test(`${moduleName} is predefined`, () => {
		if (!predefinedModules.has(moduleName)) {
			throw new Error(`Module not found in predefine registry`);
		}
	});
}

console.log("\n--- Mode B: Lazy registration (registerESMModule) ---");

test(`bridge registers ${expectedModules.length} modules for lazy ESM loading`, () => {
	if (esmRegisteredModules.size !== expectedModules.length) {
		throw new Error(`Expected ${expectedModules.length} modules, got ${esmRegisteredModules.size}`);
	}
});

for (const moduleName of expectedModules) {
	test(`${moduleName} has ESM path registered`, () => {
		if (!esmRegisteredModules.has(moduleName)) {
			throw new Error(`Module not found in ESM registry`);
		}
		const path = esmRegisteredModules.get(moduleName);
		if (!path.endsWith("-dbg.js")) {
			throw new Error(`ESM path should end with -dbg.js, got: ${path}`);
		}
	});
}

console.log("\n--- Registered module values are correct ---");

test("camelize factory returns working function", () => {
	const { value } = predefinedModules.get("sap/base/strings/camelize");
	if (value("foo-bar") !== "fooBar") {
		throw new Error(`Expected "fooBar", got "${value("foo-bar")}"`);
	}
});

test("capitalize factory returns working function", () => {
	const { value } = predefinedModules.get("sap/base/strings/capitalize");
	if (value("hello") !== "Hello") {
		throw new Error(`Expected "Hello", got "${value("hello")}"`);
	}
});

test("hash factory returns working function", () => {
	const { value } = predefinedModules.get("sap/base/strings/hash");
	if (value("test") !== 3569518) {
		throw new Error(`Expected 3569518, got ${value("test")}`);
	}
});

test("formatMessage factory returns working function", () => {
	const { value } = predefinedModules.get("sap/base/strings/formatMessage");
	if (value("Say {0}", ["Hello"]) !== "Say Hello") {
		throw new Error(`Expected "Say Hello", got "${value("Say {0}", ["Hello"])}"`);
	}
});

test("assert factory returns working function", () => {
	const { value } = predefinedModules.get("sap/base/assert");
	if (typeof value !== "function") {
		throw new Error(`Expected function, got ${typeof value}`);
	}
	value(true, "ok");
});

console.log("\n--- Exported maps are consistent ---");

test("esmModuleMap has correct count", () => {
	if (Object.keys(esmModuleMap).length !== expectedModules.length) {
		throw new Error(`Expected ${expectedModules.length}, got ${Object.keys(esmModuleMap).length}`);
	}
});

test("eagerModules has correct count", () => {
	if (Object.keys(eagerModules).length !== expectedModules.length) {
		throw new Error(`Expected ${expectedModules.length}, got ${Object.keys(eagerModules).length}`);
	}
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
	process.exit(1);
}
