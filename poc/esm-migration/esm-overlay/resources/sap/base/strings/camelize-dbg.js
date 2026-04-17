/*!
 * OpenUI5
 * (c) Copyright 2026 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */

const rCamelCase = /-(.)/ig;

/**
 * Transforms a hyphen separated string to a camel case string.
 *
 * @example
 * import camelize from "sap/base/strings/camelize";
 * camelize("foo-bar"); // "fooBar"
 *
 * @param {string} sString Hyphen separated string
 * @returns {string} The transformed string
 * @public
 */
export default function camelize(sString) {
	return sString.replace(rCamelCase, function(sMatch, sChar) {
		return sChar.toUpperCase();
	});
}
