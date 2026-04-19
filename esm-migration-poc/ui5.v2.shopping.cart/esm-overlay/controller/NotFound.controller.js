import { requireUI5 } from "../esm-helpers.js";
import BaseController from "./BaseController.js";

const UIComponent = await requireUI5("sap/ui/core/UIComponent");

const NotFoundController = BaseController.extend("sap.ui.demo.cart.controller.NotFound", {
	onInit() {
		this._router = UIComponent.getRouterFor(this);
	}
});

export default NotFoundController;
