import UIComponent from "sap/ui/core/UIComponent";
import JSONModel from "sap/ui/model/json/JSONModel";
import models from "./model/models";
import Device from "sap/ui/Device";

/**
 * @namespace sample.ts.app
 */
export default class Component extends UIComponent {
	public static metadata = {
		manifest: "json",
		interfaces: ["sap.ui.core.IAsyncContentCreation"]
	};

	private contentDensityClass: string;

	public init(): void {
		// call the base component's init function
		super.init();

		// create the device model
		this.setModel(models.createDeviceModel(), "device");
		const runtimeModel = new JSONModel({isBun: false});
		this.setModel(runtimeModel, "runtime");
		void this.loadRuntimeIndicator(runtimeModel);

		// create the views based on the url/hash
		this.getRouter().initialize();
	}

	private async loadRuntimeIndicator(runtimeModel: JSONModel): Promise<void> {
		try {
			const versionInfoUrl = sap.ui.require.toUrl("sap-ui-version.json");
			const response = await fetch(versionInfoUrl, {
				method: "HEAD",
				cache: "no-store"
			});
			runtimeModel.setProperty("/isBun", response.headers.get("x-ui5-runtime") === "bun");
		} catch {
			runtimeModel.setProperty("/isBun", false);
		}
	}

	/**
	 * This method can be called to determine whether the sapUiSizeCompact or sapUiSizeCozy
	 * design mode class should be set, which influences the size appearance of some controls.
	 * @public
	 * @returns css class, either 'sapUiSizeCompact' or 'sapUiSizeCozy' - or an empty string if no css class should be set
	 */
	public getContentDensityClass(): string {
		if (this.contentDensityClass === undefined) {
			// check whether FLP has already set the content density class; do nothing in this case
			if (document.body.classList.contains("sapUiSizeCozy") || document.body.classList.contains("sapUiSizeCompact")) {
				this.contentDensityClass = "";
			} else if (!Device.support.touch) {
				// apply "compact" mode if touch is not supported
				this.contentDensityClass = "sapUiSizeCompact";
			} else {
				// "cozy" in case of touch support; default for most sap.m controls, but needed for desktop-first controls like sap.ui.table.Table
				this.contentDensityClass = "sapUiSizeCozy";
			}
		}
		return this.contentDensityClass;
	}
}
