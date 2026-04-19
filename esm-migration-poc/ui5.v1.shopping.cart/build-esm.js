/**
 * Bun.build test suite for ESM-converted UI5 v1.x application modules.
 *
 * Tests that Bun.build can:
 * 1. Bundle all application ESM modules together
 * 2. Tree-shake unused modules
 * 3. Minify the output
 * 4. Resolve dependency chains (controller → BaseController → cart)
 *
 * Framework dependencies (sap/ui/core/*, sap/m/*, etc.) are resolved at runtime
 * via requireUI5() — they are opaque to the bundler and never appear as imports.
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";

const ESM_DIR = "../esm-overlay";
const BUILD_OUT = "./build-output";

console.log("=== Bun.build Tests: UI5 v1.x ESM Modules ===\n");

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

// --- Test 1: Bundle all application ESM modules ---

console.log("--- Bun.build: Bundle all ESM application modules ---");

const allModulesEntry = `${BUILD_OUT}/all-modules-entry.js`;
await Bun.write(allModulesEntry, `
// Import all application ESM modules
import formatter from "${ESM_DIR}/model/formatter.js";
import cart from "${ESM_DIR}/model/cart.js";
import models from "${ESM_DIR}/model/models.js";
import EmailType from "${ESM_DIR}/model/EmailType.js";
import LocalStorageModel from "${ESM_DIR}/model/LocalStorageModel.js";
import mockserver from "${ESM_DIR}/localService/mockserver.js";
import Component from "${ESM_DIR}/Component.js";
import BaseController from "${ESM_DIR}/controller/BaseController.js";
import AppController from "${ESM_DIR}/controller/App.controller.js";
import CartController from "${ESM_DIR}/controller/Cart.controller.js";
import CategoryController from "${ESM_DIR}/controller/Category.controller.js";
import CheckoutController from "${ESM_DIR}/controller/Checkout.controller.js";
import ComparisonController from "${ESM_DIR}/controller/Comparison.controller.js";
import HomeController from "${ESM_DIR}/controller/Home.controller.js";
import ProductController from "${ESM_DIR}/controller/Product.controller.js";
import WelcomeController from "${ESM_DIR}/controller/Welcome.controller.js";
import NotFoundController from "${ESM_DIR}/controller/NotFound.controller.js";
import OrderCompletedController from "${ESM_DIR}/controller/OrderCompleted.controller.js";

export {
  formatter, cart, models, EmailType, LocalStorageModel, mockserver, Component,
  BaseController, AppController, CartController, CategoryController, CheckoutController,
  ComparisonController, HomeController, ProductController, WelcomeController,
  NotFoundController, OrderCompletedController
};
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
	if (allBundleSize < 500) {
		throw new Error("Bundle too small — modules may not have been included");
	}
	if (allBundleSize > 200000) {
		throw new Error("Bundle too large — something unexpected was included");
	}
});

await test("Bundle contains application module implementations", async () => {
	const content = readFileSync(allBundlePath, "utf-8");
	const checks = [
		["formatter", "getFloatInstance"],
		["cart", "addToCart"],
		["models", "createDeviceModel"],
		["LocalStorageModel", "_STORAGE_KEY"],
		["BaseController", "getRouterFor"],
		["Component", "IAsyncContentCreation"],
		["Cart.controller", "onProceedButtonPress"],
		["Checkout.controller", "goToPaymentStep"],
		["Welcome.controller", "_iCarouselLoopTime"],
	];
	for (const [name, marker] of checks) {
		if (!content.includes(marker)) {
			throw new Error(`Module ${name} marker "${marker}" not found in bundle`);
		}
	}
});

await test("Bundle does NOT contain UI5 framework code (only runtime refs)", async () => {
	const content = readFileSync(allBundlePath, "utf-8");
	// The bundle should reference sap.ui.require via requireUI5, but should NOT
	// contain actual framework implementations
	if (content.includes("sap.ui.define(")) {
		throw new Error("Bundle contains sap.ui.define() — framework code leaked into bundle");
	}
	// requireUI5 should be present (our helper)
	if (!content.includes("sap.ui.require")) {
		throw new Error("requireUI5 helper (sap.ui.require reference) not found in bundle");
	}
});

// --- Test 2: Tree-shaking — import only formatter ---

console.log("\n--- Bun.build: Tree-shaking test ---");

const singleEntry = `${BUILD_OUT}/single-module-entry.js`;
await Bun.write(singleEntry, `
import formatter from "${ESM_DIR}/model/formatter.js";
export { formatter };
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

await test("Tree-shaken bundle does NOT contain controller code", async () => {
	const content = readFileSync(singleBundlePath, "utf-8");
	// Cart controller markers should not be in the bundle
	if (content.includes("onProceedButtonPress")) {
		throw new Error("Cart controller code was NOT tree-shaken");
	}
	if (content.includes("goToPaymentStep")) {
		throw new Error("Checkout controller code was NOT tree-shaken");
	}
});

await test("Tree-shaken bundle DOES contain formatter implementation", async () => {
	const content = readFileSync(singleBundlePath, "utf-8");
	if (!content.includes("getFloatInstance")) {
		throw new Error("formatter implementation not found in bundle");
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

console.log("\n--- Bun.build: Dependency chain (Cart.controller → BaseController → cart) ---");

const depChainEntry = `${BUILD_OUT}/dep-chain-entry.js`;
await Bun.write(depChainEntry, `
import CartController from "${ESM_DIR}/controller/Cart.controller.js";
export { CartController };
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

await test("Bundle includes transitive dependency (BaseController)", async () => {
	const content = readFileSync(depChainResult.outputs[0].path, "utf-8");
	if (!content.includes("getRouterFor")) {
		throw new Error("BaseController (transitive dep of Cart.controller) not found in bundle");
	}
});

await test("Bundle includes transitive dependency (cart model)", async () => {
	const content = readFileSync(depChainResult.outputs[0].path, "utf-8");
	if (!content.includes("addToCart")) {
		throw new Error("cart model (transitive dep via BaseController) not found in bundle");
	}
});

await test("Bundle includes transitive dependency (formatter)", async () => {
	const content = readFileSync(depChainResult.outputs[0].path, "utf-8");
	if (!content.includes("getFloatInstance")) {
		throw new Error("formatter (dep of Cart.controller) not found in bundle");
	}
});

// --- Summary ---

console.log(`\n--- Build size comparison ---`);
console.log(`  All modules (unminified):    ${allBundleSize.toLocaleString()} bytes`);
console.log(`  All modules (minified):      ${minBundleSize.toLocaleString()} bytes`);
console.log(`  Single module (formatter):   ${singleBundleSize.toLocaleString()} bytes`);
console.log(`  Dep chain (Cart controller): ${depChainResult.outputs[0] ? Bun.file(depChainResult.outputs[0].path).size.toLocaleString() : "N/A"} bytes`);
console.log(`  Minification ratio:          ${(minBundleSize / allBundleSize * 100).toFixed(1)}%`);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
	process.exit(1);
}
