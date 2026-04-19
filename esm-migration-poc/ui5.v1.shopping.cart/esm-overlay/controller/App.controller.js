import { requireUI5 } from "../esm-helpers.js";
import BaseController from "./BaseController.js";

const JSONModel = await requireUI5("sap/ui/model/json/JSONModel");

const AppController = BaseController.extend("sap.ui.demo.cart.controller.App", {
	onInit() {
		const oViewModel = new JSONModel({
			busy: true,
			delay: 0,
			layout: "TwoColumnsMidExpanded",
			smallScreenMode: true
		});
		this.setModel(oViewModel, "appView");

		const iOriginalBusyDelay = this.getView().getBusyIndicatorDelay();
		const fnSetAppNotBusy = () => {
			oViewModel.setProperty("/busy", false);
			oViewModel.setProperty("/delay", iOriginalBusyDelay);
		};

		// since then() has no "reject"-path attach to the MetadataFailed-Event to disable the busy indicator in case of an error
		this.getOwnerComponent().getModel().metadataLoaded().then(fnSetAppNotBusy);
		this.getOwnerComponent().getModel().attachMetadataFailed(fnSetAppNotBusy);

		// apply content density mode to root view
		this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());
	}
});

export default AppController;
