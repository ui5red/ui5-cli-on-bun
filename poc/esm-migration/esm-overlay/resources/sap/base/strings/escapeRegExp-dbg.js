/*!
 * OpenUI5
 * (c) Copyright 2026 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */

const rEscapeRegExp = /[[\]{}()*+?.\\^$|]/g;

/**
 * Escapes all characters that would have a special meaning in a regular expression.
 *
 * @example
 * import escapeRegExp from "sap/base/strings/escapeRegExp";
 * var text = "E=m*c^2";
 * var search = "m*c";
 * text.match( new RegExp( escapeRegExp(search) ) ); // [ "m*c" ]
 *
 * @param {string} sString String to escape
 * @returns {string} The escaped string
 * @public
 */
export default function escapeRegExp(sString) {
	return sString.replace(rEscapeRegExp, "\\$&");
}
