import { requireUI5All } from "./esm-helpers.js";
import LocalStorageModel from "./model/LocalStorageModel.js";
import models from "./model/models.js";

const [UIComponent, Device] = await requireUI5All(
	"sap/ui/core/UIComponent",
	"sap/ui/Device"
);

const Component = UIComponent.extend("sap.ui.demo.cart.Component", {
	metadata: {
		interfaces: ["sap.ui.core.IAsyncContentCreation"],
		manifest: "json"
	},

	init() {
		//create and set cart model
		const oCartModel = new LocalStorageModel("SHOPPING_CART", {
			cartEntries: {},
			savedForLaterEntries: {}
		});
		this.setModel(oCartModel, "cartProducts");

		//create and set comparison model
		const oComparisonModel = new LocalStorageModel("PRODUCT_COMPARISON", {
			category: "",
			item1: "",
			item2: ""
		});
		this.setModel(oComparisonModel, "comparison");

		// set the device model
		this.setModel(models.createDeviceModel(), "device");

		// call the base component's init function and create the App view
		UIComponent.prototype.init.apply(this, arguments);

		// initialize the router
		this.getRouter().initialize();

		// update browser title
		this.getRouter().attachTitleChanged((oEvent) => {
			const sTitle = oEvent.getParameter("title");
			document.addEventListener('DOMContentLoaded', () => {
				document.title = sTitle;
			});
		});
	},

	getContentDensityClass() {
		if (this._sContentDensityClass === undefined) {
			// check whether FLP has already set the content density class; do nothing in this case
			if (document.body.classList.contains("sapUiSizeCozy") || document.body.classList.contains("sapUiSizeCompact")) {
				this._sContentDensityClass = "";
			} else if (!Device.support.touch) { // apply "compact" mode if touch is not supported
				this._sContentDensityClass = "sapUiSizeCompact";
			} else {
				this._sContentDensityClass = "sapUiSizeCozy";
			}
		}

		return this._sContentDensityClass;
	}
});

export default Component;
