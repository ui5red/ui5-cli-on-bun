import { requireUI5All } from "../esm-helpers.js";
import cart from "../model/cart.js";

const [Controller, MessageToast, UIComponent, History] = await requireUI5All(
	"sap/ui/core/mvc/Controller",
	"sap/m/MessageToast",
	"sap/ui/core/UIComponent",
	"sap/ui/core/routing/History"
);

const BaseController = Controller.extend("sap.ui.demo.cart.controller.BaseController", {
	cart,

	getRouter() {
		return UIComponent.getRouterFor(this);
	},

	getModel(sName) {
		return this.getView().getModel(sName);
	},

	setModel(oModel, sName) {
		return this.getView().setModel(oModel, sName);
	},

	requestResourceBundle() {
		return this.getOwnerComponent().getModel("i18n").getResourceBundle();
	},

	async onAvatarPress() {
		const sMessage = (await this.requestResourceBundle()).getText("avatarButtonMessageToastText");
		MessageToast.show(sMessage);
	},

	onStateChange(oEvent) {
		const sLayout = oEvent.getParameter("layout");
		const iColumns = oEvent.getParameter("maxColumnsCount");

		if (iColumns === 1) {
			this.getModel("appView").setProperty("/smallScreenMode", true);
		} else {
			this.getModel("appView").setProperty("/smallScreenMode", false);
			// switch back to two column mode when device orientation is changed
			if (sLayout === "OneColumn") {
				this._setLayout("Two");
			}
		}
	},

	_setLayout(sColumns) {
		if (sColumns) {
			this.getModel("appView").setProperty("/layout",
				sColumns + "Column" + (sColumns === "One" ? "" : "sMidExpanded"));
		}
	},

	onBack() {
		const oHistory = History.getInstance();
		const oPrevHash = oHistory.getPreviousHash();
		if (oPrevHash !== undefined) {
			window.history.go(-1);
		} else {
			this.getRouter().navTo("home");
		}
	},

	onAddToCart() {
		const oEntry =  arguments[0].getSource().getBindingContext().getObject();
		const oCartModel = this.getView().getModel("cartProducts");
		cart.addToCart(this.requestResourceBundle(), oEntry, oCartModel);
	},

	_clearComparison() {
		const oModel = this.getOwnerComponent().getModel("comparison");
		oModel.setData({
			category: "",
			item1: "",
			item2: ""
		});
	}
});

export default BaseController;
