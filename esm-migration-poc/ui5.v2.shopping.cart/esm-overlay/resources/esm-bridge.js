/**
 * ESM-AMD Bridge for UI5 v2.0.0 Shopping Cart
 *
 * This module bridges ESM-converted application modules back into the ui5loader's
 * AMD registry. It eagerly imports all ESM modules and registers them via
 * sap.ui.predefine() so they are immediately available when the UI5 runtime
 * resolves module dependencies.
 *
 * Architecture:
 *
 *   ┌──────────────────┐    import     ┌──────────────────┐  predefine  ┌──────────────┐
 *   │  ESM Module (.js) │──────────────▶│  ESM-AMD Bridge  │────────────▶│ ui5loader reg│
 *   └──────────────────┘               └──────────────────┘             └──────────────┘
 *
 * The bridge runs AFTER sap-ui-core.js (ui5loader is available) but BEFORE
 * ComponentSupport starts the application. This is orchestrated by index-esm.html.
 */

// --- Import all ESM application modules ---

// Models
import formatter from "../model/formatter.js";
import cart from "../model/cart.js";
import models from "../model/models.js";
import EmailType from "../model/EmailType.js";
import LocalStorageModel from "../model/LocalStorageModel.js";

// Local service
import mockserver from "../localService/mockserver.js";

// Component
import Component from "../Component.js";

// Controllers
import BaseController from "../controller/BaseController.js";
import AppController from "../controller/App.controller.js";
import CartController from "../controller/Cart.controller.js";
import CategoryController from "../controller/Category.controller.js";
import CheckoutController from "../controller/Checkout.controller.js";
import ComparisonController from "../controller/Comparison.controller.js";
import HomeController from "../controller/Home.controller.js";
import ProductController from "../controller/Product.controller.js";
import WelcomeController from "../controller/Welcome.controller.js";
import NotFoundController from "../controller/NotFound.controller.js";
import OrderCompletedController from "../controller/OrderCompleted.controller.js";

// --- Register all ESM modules into ui5loader's AMD registry ---

const esmModules = {
	// Models
	"sap/ui/demo/cart/model/formatter": formatter,
	"sap/ui/demo/cart/model/cart": cart,
	"sap/ui/demo/cart/model/models": models,
	"sap/ui/demo/cart/model/EmailType": EmailType,
	"sap/ui/demo/cart/model/LocalStorageModel": LocalStorageModel,

	// Local service
	"sap/ui/demo/cart/localService/mockserver": mockserver,

	// Component
	"sap/ui/demo/cart/Component": Component,

	// Controllers
	"sap/ui/demo/cart/controller/BaseController": BaseController,
	"sap/ui/demo/cart/controller/App.controller": AppController,
	"sap/ui/demo/cart/controller/Cart.controller": CartController,
	"sap/ui/demo/cart/controller/Category.controller": CategoryController,
	"sap/ui/demo/cart/controller/Checkout.controller": CheckoutController,
	"sap/ui/demo/cart/controller/Comparison.controller": ComparisonController,
	"sap/ui/demo/cart/controller/Home.controller": HomeController,
	"sap/ui/demo/cart/controller/Product.controller": ProductController,
	"sap/ui/demo/cart/controller/Welcome.controller": WelcomeController,
	"sap/ui/demo/cart/controller/NotFound.controller": NotFoundController,
	"sap/ui/demo/cart/controller/OrderCompleted.controller": OrderCompletedController,
};

let count = 0;
for (const [name, value] of Object.entries(esmModules)) {
	sap.ui.predefine(name, [], function() {
		return value;
	});
	count++;
}

console.log(`[ESM-AMD Bridge v2.0] Registered ${count} application modules via predefine()`);

export { esmModules };
