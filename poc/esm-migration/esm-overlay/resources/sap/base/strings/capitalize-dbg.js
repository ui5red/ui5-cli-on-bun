/*!
 * OpenUI5
 * (c) Copyright 2026 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */

/**
 * Converts first character of the string to upper case.
 *
 * @example
 * import capitalize from "sap/base/strings/capitalize";
 * capitalize("foobar"); // "Foobar"
 *
 * @param {string} sString String for which first character should be converted
 * @returns {string} String input with first character uppercase
 * @public
 */
export default function capitalize(sString) {
	return sString.charAt(0).toUpperCase() + sString.substring(1);
}
