import BaseController from "./BaseController.js";

const OrderCompletedController = BaseController.extend("sap.ui.demo.cart.controller.OrderCompleted", {
	onInit() {
		this._oRouter = this.getRouter();
	},

	onReturnToShopButtonPress() {
		//navigates back to home screen
		this._setLayout("Two");
		this._oRouter.navTo("home");
	}
});

export default OrderCompletedController;
