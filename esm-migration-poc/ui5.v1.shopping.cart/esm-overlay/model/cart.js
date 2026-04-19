import { requireUI5All } from "../esm-helpers.js";

const [MessageBox, MessageToast] = await requireUI5All(
	"sap/m/MessageBox",
	"sap/m/MessageToast"
);

const cart = {
	async addToCart(oBundlePromise, oProduct, oCartModel) {
		// Items to be added from the welcome view have it's content inside product object
		if (oProduct.Product !== undefined) {
			oProduct = oProduct.Product;
		}
		const oResourceBundle = await oBundlePromise;
		switch (oProduct.Status) {
			case "D":
				//show message dialog
				MessageBox.show(
					oResourceBundle.getText("productStatusDiscontinuedMsg"), {
					icon: MessageBox.Icon.ERROR,
					titles: oResourceBundle.getText("productStatusDiscontinuedTitle"),
					actions: [MessageBox.Action.CLOSE]
				});
				break;
			case "O":
				// show message dialog
				MessageBox.show(
					oResourceBundle.getText("productStatusOutOfStockMsg"), {
					icon: MessageBox.Icon.QUESTION,
					title: oResourceBundle.getText("productStatusOutOfStockTitle"),
					actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
					onClose: (oAction) => {
						// order
						if (MessageBox.Action.OK === oAction) {
							this._updateCartItem(oResourceBundle, oProduct, oCartModel);
						}
					}
				});
				break;
			case "A":
			default:
				this._updateCartItem(oResourceBundle, oProduct, oCartModel);
				break;
		}
	},

	_updateCartItem(oBundle, oProductToBeAdded, oCartModel) {
		// find existing entry for product
		const oCollectionEntries = {...oCartModel.getData()["cartEntries"]};
		let oCartEntry =  oCollectionEntries[oProductToBeAdded.ProductId];

		if (oCartEntry === undefined) {
			// create new entry
			oCartEntry = {...oProductToBeAdded};
			oCartEntry.Quantity = 1;
			oCollectionEntries[oProductToBeAdded.ProductId] = oCartEntry;
		} else {
			// update existing entry
			oCartEntry.Quantity += 1;
		}
		//update the cart model
		oCartModel.setProperty("/cartEntries", {...oCollectionEntries});
		oCartModel.refresh(true);
		MessageToast.show(oBundle.getText("productMsgAddedToCart", [oProductToBeAdded.Name]));
	}
};

export default cart;
