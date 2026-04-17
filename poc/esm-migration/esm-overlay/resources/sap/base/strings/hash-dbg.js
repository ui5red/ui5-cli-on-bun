/*!
 * OpenUI5
 * (c) Copyright 2026 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */

/**
 * Generates a hash-code from a string.
 *
 * @example
 * import hash from "sap/base/strings/hash";
 * hash(""); // 0
 * hash("test"); // 3569518
 *
 * @param {string} sString The string to generate the hash-code from
 * @return {int} The generated hash-code
 * @private
 */
export default function hash(sString) {
	var i = sString.length, iHash = 0;

	while (i--) {
		iHash = (iHash << 5) - iHash + sString.charCodeAt(i);
		iHash = iHash & iHash; // convert to 32 bit
	}

	return iHash;
}
