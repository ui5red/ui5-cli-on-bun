import { requireUI5All } from "../esm-helpers.js";

const [JSONModel, Device] = await requireUI5All(
	"sap/ui/model/json/JSONModel",
	"sap/ui/Device"
);

const models = {
	createDeviceModel() {
		const oModel = new JSONModel(Device);
		oModel.setDefaultBindingMode("OneWay");

		return oModel;
	}
};

export default models;
