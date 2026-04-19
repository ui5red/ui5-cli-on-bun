import { requireUI5All } from "../esm-helpers.js";
import BaseController from "./BaseController.js";
import EmailType from "../model/EmailType.js";
import formatter from "../model/formatter.js";

const [Link, MessageBox, MessageItem, MessagePopover, Messaging, JSONModel] = await requireUI5All(
	"sap/m/Link",
	"sap/m/MessageBox",
	"sap/m/MessageItem",
	"sap/m/MessagePopover",
	"sap/ui/core/Messaging",
	"sap/ui/model/json/JSONModel"
);

const CheckoutController = BaseController.extend("sap.ui.demo.cart.controller.Checkout", {
	types: {
		email: new EmailType()
	},

	formatter,

	onInit() {
		const oModel = new JSONModel({
			SelectedPayment: "Credit Card",
			SelectedDeliveryMethod: "Standard Delivery",
			DifferentDeliveryAddress: false,
			CashOnDelivery: {
				FirstName: "",
				LastName: "",
				PhoneNumber: "",
				Email: ""
			},
			InvoiceAddress: {
				Address: "",
				City: "",
				ZipCode: "",
				Country: "",
				Note: ""
			},
			DeliveryAddress: {
				Address: "",
				Country: "",
				City: "",
				ZipCode: "",
				Note: ""
			},
			CreditCard: {
				Name: "",
				CardNumber: "",
				SecurityCode: "",
				Expire: ""
			}
		});
		const oReturnToShopButton = this.byId("returnToShopButton");

		this.setModel(oModel);

		// previously selected entries in wizard
		this._oHistory = {
			prevPaymentSelect: null,
			prevDiffDeliverySelect: null
		};

		// Assign the model object to the SAPUI5 core
		this.setModel(Messaging.getMessageModel(), "message");

		// switch to single column view for checkout process
		this.getRouter().getRoute("checkout").attachMatched(() => {
			this._setLayout("One");
		});

		// set focus to the "Return to Shop" button each time the view is shown to avoid losing
		// the focus after changing the layout to one column
		this.getView().addEventDelegate({
			onAfterShow() {
				oReturnToShopButton.focus();
			}
		});
	},

	onShowMessagePopoverPress(oEvent) {
		const oButton = oEvent.getSource();
		let oMessagePopover;
		const oLink = new Link({
			text: "Show more information",
			href: "http://sap.com",
			target: "_blank"
		});

		const oMessageTemplate = new MessageItem({
			type: '{message>type}',
			title: '{message>message}',
			subtitle: '{message>additionalText}',
			link: oLink
		});

		if (!this.byId("errorMessagePopover")) {
			oMessagePopover = new MessagePopover(this.createId("messagePopover"), {
				items: {
					path: 'message>/',
					template: oMessageTemplate
				},
				afterClose() {
					oMessagePopover.destroy();
				}
			});
			this._addDependent(oMessagePopover);
		}

		oMessagePopover.openBy(oButton);
	},

	_addDependent(oMessagePopover) {
		this.getView().addDependent(oMessagePopover);
	},

	goToPaymentStep() {
		const selectedKey = this.getModel().getProperty("/SelectedPayment");
		const oElement = this.byId("paymentTypeStep");
		switch (selectedKey) {
			case "Bank Transfer":
				oElement.setNextStep(this.byId("bankAccountStep"));
				break;
			case "Cash on Delivery":
				oElement.setNextStep(this.byId("cashOnDeliveryStep"));
				break;
			case "Credit Card":
			default:
				oElement.setNextStep(this.byId("creditCardStep"));
				break;
		}
	},

	async setPaymentMethod() {
		this._setDiscardableProperty({
			message: (await this.requestResourceBundle()).getText("checkoutControllerChangePayment"),
			discardStep: this.byId("paymentTypeStep"),
			modelPath: "/SelectedPayment",
			historyPath: "prevPaymentSelect"
		});
	},

	async setDifferentDeliveryAddress() {
		this._setDiscardableProperty({
			message: (await this.requestResourceBundle()).getText("checkoutControllerChangeDelivery"),
			discardStep: this.byId("invoiceStep"),
			modelPath: "/DifferentDeliveryAddress",
			historyPath: "prevDiffDeliverySelect"
		});
	},

	invoiceAddressComplete() {
		const sNextStepId = (this.getModel().getProperty("/DifferentDeliveryAddress"))
			? "deliveryAddressStep"
			: "deliveryTypeStep";
		this.byId("invoiceStep").setNextStep(this.byId(sNextStepId));

	},

	async handleWizardCancel() {
		const sText = (await this.requestResourceBundle()).getText("checkoutControllerAreYouSureCancel");
		this._handleSubmitOrCancel(sText, "warning", "home");
	},

	async handleWizardSubmit() {
		const sText = (await this.requestResourceBundle()).getText("checkoutControllerAreYouSureSubmit");
		this._handleSubmitOrCancel(sText, "confirm", "ordercompleted");
	},

	backToWizardContent() {
		this.byId("wizardNavContainer").backToPage(this.byId("wizardContentPage").getId());
	},

	_clearMessages() {
		Messaging.removeAllMessages();
	},

	onCheckStepActivation(oEvent) {
		this._clearMessages();
		const sWizardStepId = oEvent.getSource().getId();
		switch (sWizardStepId) {
			case this.createId("creditCardStep"):
				this.checkCreditCardStep();
				break;
			case this.createId("cashOnDeliveryStep"):
				this.checkCashOnDeliveryStep();
				break;
			case this.createId("invoiceStep"):
				this.checkInvoiceStep();
				break;
			case this.createId("deliveryAddressStep"):
				this.checkDeliveryAddressStep();
				break;
			default:
				break;
		}
	},

	checkCreditCardStep() {
		this._checkStep("creditCardStep", ["creditCardHolderName", "creditCardNumber", "creditCardSecurityNumber",
			"creditCardExpirationDate"]);
	},

	checkCashOnDeliveryStep() {
		this._checkStep("cashOnDeliveryStep", ["cashOnDeliveryName", "cashOnDeliveryLastName",
			"cashOnDeliveryPhoneNumber", "cashOnDeliveryEmail"]);
	},

	checkInvoiceStep() {
		this._checkStep("invoiceStep", ["invoiceAddressAddress", "invoiceAddressCity", "invoiceAddressZip",
			"invoiceAddressCountry"]);
	},

	checkDeliveryAddressStep() {
		this._checkStep("deliveryAddressStep", ["deliveryAddressAddress", "deliveryAddressCity",
			"deliveryAddressZip", "deliveryAddressCountry"]);
	},

	_checkInputFields(aInputIds) {
		const oView = this.getView();

		return aInputIds.some((sInputId) => {
			const oInput = oView.byId(sInputId);
			const oBinding = oInput.getBinding("value");
			try {
				oBinding.getType().validateValue(oInput.getValue());
			} catch (oException) {
				return true;
			}

			return false;
		});
	},

	_checkStep(sStepName, aInputIds) {
		const oWizard = this.byId("shoppingCartWizard");
		const oStep = this.byId(sStepName);
		const bEmptyInputs = this._checkInputFields(aInputIds);
		const bValidationError = !!Messaging.getMessageModel().getData().length;

		if (!bValidationError && !bEmptyInputs) {
			oWizard.validateStep(oStep);
		} else {
			oWizard.invalidateStep(oStep);
		}
	},

	async checkCompleted() {
		if (Messaging.getMessageModel().getData().length > 0) {
			MessageBox.error((await this.requestResourceBundle()).getText("popOverMessageText"));
		} else {
			this.byId("wizardNavContainer").to(this.byId("summaryPage"));
		}
	},

	onReturnToShopButtonPress() {
		this._setLayout("Two");
		this.getRouter().navTo("home");
	},

	_setDiscardableProperty(oParams) {
		const oWizard = this.byId("shoppingCartWizard");
		if (oWizard.getProgressStep() !== oParams.discardStep) {
			MessageBox.warning(oParams.message, {
				actions: [MessageBox.Action.YES,
					MessageBox.Action.NO],
				onClose: (oAction) => {
					if (oAction === MessageBox.Action.YES) {
						oWizard.discardProgress(oParams.discardStep);
						this._oHistory[oParams.historyPath] = this.getModel().getProperty(oParams.modelPath);
					} else {
						this.getModel().setProperty(oParams.modelPath, this._oHistory[oParams.historyPath]);
					}
				}
			});
		} else {
			this._oHistory[oParams.historyPath] = this.getModel().getProperty(oParams.modelPath);
		}
	},

	_handleSubmitOrCancel(sMessage, sMessageBoxType, sRoute) {
		MessageBox[sMessageBoxType](sMessage, {
			actions: [MessageBox.Action.YES,
				MessageBox.Action.NO],
			onClose: (oAction) => {
				if (oAction === MessageBox.Action.YES) {
					// resets Wizard
					const oWizard = this.byId("shoppingCartWizard");
					const oModel = this.getModel();
					const oCartModel = this.getOwnerComponent().getModel("cartProducts");
					this._navToWizardStep(this.byId("contentsStep"));
					oWizard.discardProgress(oWizard.getSteps()[0]);
					const oModelData = oModel.getData();
					oModelData.SelectedPayment = "Credit Card";
					oModelData.SelectedDeliveryMethod = "Standard Delivery";
					oModelData.DifferentDeliveryAddress = false;
					oModelData.CashOnDelivery = {};
					oModelData.InvoiceAddress = {};
					oModelData.DeliveryAddress = {};
					oModelData.CreditCard = {};
					oModel.setData(oModelData);
					//all relevant cart properties are set back to default. Content is deleted.
					const oCartModelData = oCartModel.getData();
					oCartModelData.cartEntries = {};
					oCartModelData.totalPrice = 0;
					oCartModel.setData(oCartModelData);
					this.getRouter().navTo(sRoute);
				}
			}
		});
	},

	_navBackToStep(oEvent) {
		const sStep = oEvent.getSource().data("navBackTo");
		const oStep = this.byId(sStep);
		this._navToWizardStep(oStep);
	},

	_navToWizardStep(oStep) {
		const oNavContainer = this.byId("wizardNavContainer");
		const _fnAfterNavigate = () => {
			this.byId("shoppingCartWizard").goToStep(oStep);
			// detaches itself after navigation
			oNavContainer.detachAfterNavigate(_fnAfterNavigate);
		};

		oNavContainer.attachAfterNavigate(_fnAfterNavigate);
		oNavContainer.to(this.byId("wizardContentPage"));
	}
});

export default CheckoutController;
