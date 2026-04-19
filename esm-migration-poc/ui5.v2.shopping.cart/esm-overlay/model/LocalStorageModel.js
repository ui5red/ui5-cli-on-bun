import { requireUI5All } from "../esm-helpers.js";

const [JSONModel, Storage] = await requireUI5All(
	"sap/ui/model/json/JSONModel",
	"sap/ui/util/Storage"
);

const LocalStorageModel = JSONModel.extend("sap.ui.demo.cart.model.CartModel", {
	_STORAGE_KEY: "LOCALSTORAGE_MODEL",

	_storage: new Storage(Storage.Type.local),

	constructor: function(sStorageKey, oSettings) {
		// call super constructor with everything from the second argument
		JSONModel.apply(this, [].slice.call(arguments, 1));
		this.setSizeLimit(1000000);

		// override default storage key
		if (sStorageKey) {
			this._STORAGE_KEY = sStorageKey;
		}

		// load data from local storage
		this._loadData();

		return this;
	},

	_loadData() {
		const sJSON = this._storage.get(this._STORAGE_KEY);

		if (sJSON) {
			this.setData(JSON.parse(sJSON));
		}
		this._bDataLoaded = true;
	},

	_storeData() {
		const oData = this.getData();

		// update local storage with current data
		const sJSON = JSON.stringify(oData);
		this._storage.put(this._STORAGE_KEY, sJSON);
	},

	setProperty() {
		JSONModel.prototype.setProperty.apply(this, arguments);
		this._storeData();
	},

	setData() {
		JSONModel.prototype.setData.apply(this, arguments);
		// called from constructor: only store data after first load
		if (this._bDataLoaded) {
			this._storeData();
		}
	},

	refresh() {
		JSONModel.prototype.refresh.apply(this, arguments);
		this._storeData();
	}
});

export default LocalStorageModel;
