/**
 * Test standard bundlers on ESM-converted UI5 modules.
 *
 * This script runs Bun.build() and (optionally) esbuild on the ESM modules
 * to verify they can be:
 * 1. Resolved and bundled by a standard bundler
 * 2. Tree-shaken (unused modules eliminated)
 * 3. The output is correct and functional
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const RESOURCES = "./dist-esm/resources";
const BUILD_OUT = "./build-output";

console.log("=== Standard Bundler Tests ===\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
	try {
		const result = fn();
		if (result instanceof Promise) {
			return result.then(() => {
				console.log(`  PASS: ${name}`);
				passed++;
			}).catch((e) => {
				console.log(`  FAIL: ${name}`);
				console.log(`        ${e.message}`);
				failed++;
			});
		}
		console.log(`  PASS: ${name}`);
		passed++;
	} catch (e) {
		console.log(`  FAIL: ${name}`);
		console.log(`        ${e.message}`);
		failed++;
	}
}

// Clean build output
if (existsSync(BUILD_OUT)) {
	rmSync(BUILD_OUT, { recursive: true });
}
mkdirSync(BUILD_OUT, { recursive: true });

// --- Test 1: Bundle all ESM modules with Bun.build ---

console.log("--- Bun.build: Bundle all ESM modules ---");

// Create an entrypoint that imports all ESM modules
const allModulesEntry = `${BUILD_OUT}/all-modules-entry.js`;
await Bun.write(allModulesEntry, `
import camelize from "../dist-esm/resources/sap/base/strings/camelize-dbg.js";
import capitalize from "../dist-esm/resources/sap/base/strings/capitalize-dbg.js";
import escapeRegExp from "../dist-esm/resources/sap/base/strings/escapeRegExp-dbg.js";
import formatMessage from "../dist-esm/resources/sap/base/strings/formatMessage-dbg.js";
import hash from "../dist-esm/resources/sap/base/strings/hash-dbg.js";
import hyphenate from "../dist-esm/resources/sap/base/strings/hyphenate-dbg.js";
import toHex from "../dist-esm/resources/sap/base/strings/toHex-dbg.js";
import whitespaceReplacer from "../dist-esm/resources/sap/base/strings/whitespaceReplacer-dbg.js";
import assert from "../dist-esm/resources/sap/base/assert-dbg.js";
import isPlainObject from "../dist-esm/resources/sap/base/util/isPlainObject-dbg.js";
import deepClone from "../dist-esm/resources/sap/base/util/deepClone-dbg.js";
import each from "../dist-esm/resources/sap/base/util/each-dbg.js";
import values from "../dist-esm/resources/sap/base/util/values-dbg.js";
import uid from "../dist-esm/resources/sap/base/util/uid-dbg.js";
import uniqueSort from "../dist-esm/resources/sap/base/array/uniqueSort-dbg.js";

// Verify at runtime
console.log("camelize:", camelize("foo-bar"));
console.log("capitalize:", capitalize("hello"));
console.log("hash:", hash("test"));
console.log("formatMessage:", formatMessage("Say {0}", ["Hello"]));
console.log("isPlainObject:", isPlainObject({}));
console.log("deepClone:", JSON.stringify(deepClone({a: 1})));
console.log("uniqueSort:", uniqueSort([1, 2, 1]).join(","));

export { camelize, capitalize, escapeRegExp, formatMessage, hash, hyphenate, toHex, whitespaceReplacer, assert, isPlainObject, deepClone, each, values, uid, uniqueSort };
`);

const allResult = await Bun.build({
	entrypoints: [allModulesEntry],
	outdir: `${BUILD_OUT}/all-modules`,
	target: "browser",
	minify: false,
});

await test("Bun.build bundles all ESM modules without errors", async () => {
	if (!allResult.success) {
		const errors = allResult.logs.filter(l => l.level === "error").map(l => l.message).join("; ");
		throw new Error(`Build failed: ${errors}`);
	}
});

await test("Bun.build produces output files", async () => {
	if (allResult.outputs.length === 0) {
		throw new Error("No output files produced");
	}
});

const allBundlePath = allResult.outputs[0]?.path;
const allBundleSize = allBundlePath ? Bun.file(allBundlePath).size : 0;

await test(`Bundle size is reasonable (got ${allBundleSize} bytes)`, async () => {
	if (allBundleSize < 100) {
		throw new Error("Bundle too small — modules may not have been included");
	}
	if (allBundleSize > 50000) {
		throw new Error("Bundle too large — something unexpected was included");
	}
});

await test("Bundle contains all module implementations", async () => {
	const content = readFileSync(allBundlePath, "utf-8");
	const checks = [
		["camelize", "toUpperCase"],
		["capitalize", "charAt"],
		["escapeRegExp", "\\\\$&"],
		["hash", "charCodeAt"],
		["hyphenate", "toLowerCase"],
		["toHex", "toString(16)"],
		["whitespaceReplacer", "replaceAll"],
		["formatMessage", "pattern syntax error"],
		["assert", "console.assert"],
		["isPlainObject", "getPrototypeOf"],
		["deepClone", "deepClone"],
		["each", "Object.keys"],
		["values", "Object.values"],
		["uid", "iIdCounter"],
		["uniqueSort", "Set"],
	];
	for (const [name, marker] of checks) {
		if (!content.includes(marker)) {
			throw new Error(`Module ${name} marker "${marker}" not found in bundle`);
		}
	}
});

// --- Test 2: Tree-shaking — import only one module ---

console.log("\n--- Bun.build: Tree-shaking test ---");

const singleEntry = `${BUILD_OUT}/single-module-entry.js`;
await Bun.write(singleEntry, `
import camelize from "../dist-esm/resources/sap/base/strings/camelize-dbg.js";
console.log(camelize("foo-bar"));
`);

const singleResult = await Bun.build({
	entrypoints: [singleEntry],
	outdir: `${BUILD_OUT}/single-module`,
	target: "browser",
	minify: false,
});

const singleBundlePath = singleResult.outputs[0]?.path;
const singleBundleSize = singleBundlePath ? Bun.file(singleBundlePath).size : 0;

await test("Tree-shaking: single module build succeeds", async () => {
	if (!singleResult.success) {
		throw new Error("Build failed");
	}
});

await test(`Tree-shaken bundle is smaller than all-modules bundle (${singleBundleSize} < ${allBundleSize})`, async () => {
	if (singleBundleSize >= allBundleSize) {
		throw new Error(`Single: ${singleBundleSize}, All: ${allBundleSize}`);
	}
});

await test("Tree-shaken bundle does NOT contain unused modules", async () => {
	const content = readFileSync(singleBundlePath, "utf-8");
	// formatMessage should not be in the bundle since we only imported camelize
	if (content.includes("pattern syntax error")) {
		throw new Error("formatMessage was NOT tree-shaken — it should not be in the bundle");
	}
	// hash should not be in the bundle
	if (content.includes("charCodeAt")) {
		throw new Error("hash was NOT tree-shaken — it should not be in the bundle");
	}
});

await test("Tree-shaken bundle DOES contain the imported module", async () => {
	const content = readFileSync(singleBundlePath, "utf-8");
	if (!content.includes("toUpperCase")) {
		throw new Error("camelize implementation not found in bundle");
	}
});

// --- Test 3: Minified build ---

console.log("\n--- Bun.build: Minified bundle ---");

const minResult = await Bun.build({
	entrypoints: [allModulesEntry],
	outdir: `${BUILD_OUT}/minified`,
	target: "browser",
	minify: true,
});

const minBundlePath = minResult.outputs[0]?.path;
const minBundleSize = minBundlePath ? Bun.file(minBundlePath).size : 0;

await test("Minified build succeeds", async () => {
	if (!minResult.success) {
		throw new Error("Build failed");
	}
});

await test(`Minified bundle is smaller than unminified (${minBundleSize} < ${allBundleSize})`, async () => {
	if (minBundleSize >= allBundleSize) {
		throw new Error(`Minified: ${minBundleSize}, Unminified: ${allBundleSize}`);
	}
});

// --- Test 4: Dependency chain resolution ---

console.log("\n--- Bun.build: Dependency chain (formatMessage → assert) ---");

const depChainEntry = `${BUILD_OUT}/dep-chain-entry.js`;
await Bun.write(depChainEntry, `
import formatMessage from "../dist-esm/resources/sap/base/strings/formatMessage-dbg.js";
console.log(formatMessage("Say {0}", ["Hello"]));
`);

const depChainResult = await Bun.build({
	entrypoints: [depChainEntry],
	outdir: `${BUILD_OUT}/dep-chain`,
	target: "browser",
	minify: false,
});

await test("Dependency chain build succeeds", async () => {
	if (!depChainResult.success) {
		throw new Error("Build failed");
	}
});

await test("Bundle includes transitive dependency (assert)", async () => {
	const content = readFileSync(depChainResult.outputs[0].path, "utf-8");
	if (!content.includes("console.assert")) {
		throw new Error("assert (transitive dep of formatMessage) not found in bundle");
	}
});

// --- Summary ---

console.log(`\n--- Build size comparison ---`);
console.log(`  All modules (unminified):  ${allBundleSize.toLocaleString()} bytes`);
console.log(`  All modules (minified):    ${minBundleSize.toLocaleString()} bytes`);
console.log(`  Single module (camelize):  ${singleBundleSize.toLocaleString()} bytes`);
console.log(`  Compression ratio:         ${(minBundleSize / allBundleSize * 100).toFixed(1)}%`);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
	process.exit(1);
}
