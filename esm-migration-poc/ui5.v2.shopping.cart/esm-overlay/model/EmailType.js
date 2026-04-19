import { requireUI5All } from "../esm-helpers.js";

const [StringType, ValidateException, ResourceModel] = await requireUI5All(
	"sap/ui/model/type/String",
	"sap/ui/model/ValidateException",
	"sap/ui/model/resource/ResourceModel"
);

const oResourceModel = new ResourceModel({
	bundleName: "sap.ui.demo.cart.i18n.i18n"
});
// The following Regex is NOT covering all cases of RFC 5322 and only used for demonstration purposes.
const rEMail = /^\w+[\w-+\.]*\@\w+([-\.]\w+)*\.[a-zA-Z]{2,}$/;

const EmailType = StringType.extend("sap.ui.demo.cart.model.EmailType", {
	validateValue(sValue) {
		if (!sValue.match(rEMail)) {
			throw new ValidateException(
				oResourceModel.getResourceBundle().getText("checkoutCodEmailValueTypeMismatch", [sValue]));
		}
	}
});

export default EmailType;
