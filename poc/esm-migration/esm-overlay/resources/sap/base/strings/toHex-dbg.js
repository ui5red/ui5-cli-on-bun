/*!
 * OpenUI5
 * (c) Copyright 2026 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */

/**
 * Create hex string and pad to length with zeros.
 *
 * @param {int} iChar UTF-16 character code
 * @param {int} [iLength=0] number of padded zeros
 * @returns {string} padded hex representation of the given character code
 * @private
 */
export default function toHex(iChar, iLength) {
	var sHex = iChar.toString(16);
	if (iLength) {
		sHex = sHex.padStart(iLength, '0');
	}
	return sHex;
}
