/*!
 * OpenUI5
 * (c) Copyright 2026 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */

const rHyphen = /([A-Z])/g;

/**
 * Transforms a camel case string (camelCase) into a hyphen separated string (kebab-case).
 *
 * @param {string} sString camel case string
 * @returns {string} The transformed string
 * @public
 */
export default function hyphenate(sString) {
	return sString.replace(rHyphen, function(sMatch, sChar) {
		return "-" + sChar.toLowerCase();
	});
}
