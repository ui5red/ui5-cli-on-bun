import { requireUI5 } from "../esm-helpers.js";

const NumberFormat = await requireUI5("sap/ui/core/format/NumberFormat");

const mStatusState = {
	A: "Success",
	O: "Warning",
	D: "Error"
};
const formatter = {
	price(sValue) {
		const oFloatInstance = NumberFormat.getFloatInstance({
			maxFractionDigits: 2,
			minFractionDigits: 2,
			groupingEnabled: true,
			groupingSeparator: ".",
			decimalSeparator: ","
		});

		return oFloatInstance.format(sValue);
	},

	async totalPrice(oCartEntries) {
		let fTotalPrice = 0;
		Object.keys(oCartEntries).forEach((sProductId) => {
			const oProduct = oCartEntries[sProductId];
			fTotalPrice += parseFloat(oProduct.Price) * oProduct.Quantity;
		});

		return (await this.requestResourceBundle())
			.getText("cartTotalPrice", [formatter.price(fTotalPrice), "EUR"]);
	},

	async statusText(sStatus) {
		const oBundle = await this.requestResourceBundle();
		const mStatusText = {
			A: oBundle.getText("statusA"),
			O: oBundle.getText("statusO"),
			D: oBundle.getText("statusD")
		};

		return mStatusText[sStatus] || sStatus;
	},

	statusState(sStatus) {
		return mStatusState[sStatus] || "None";
	},

	pictureUrl(sUrl) {
		if (sUrl){
			return sap.ui.require.toUrl(sUrl);
		} else {
			return undefined;
		}
	},

	hasItems(oCollection1, oCollection2) {
		const bCollection1Filled = !!(oCollection1 && Object.keys(oCollection1).length);
		const bCollection2Filled = !!(oCollection2 && Object.keys(oCollection2).length);

		return bCollection1Filled || bCollection2Filled;
	}
};

export default formatter;
