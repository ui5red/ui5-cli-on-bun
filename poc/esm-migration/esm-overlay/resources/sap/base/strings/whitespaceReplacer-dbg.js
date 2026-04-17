/*!
 * OpenUI5
 * (c) Copyright 2026 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */

/**
 * Utility to replace whitespaces with special characters.
 * The main purpose is to enable properly displaying of whitespaces in HTML.
 *
 * @param {string} sInput The input string
 * @returns {string | *} The transformed string or the original input in case the input is not a string
 * @private
 */
export default function whitespaceReplacer(sInput) {
	var sWhitespace = " ",
		sUnicodeWhitespaceCharacter = "\u00A0"; // Non-breaking whitespace

	if (typeof sInput !== "string") {
		return sInput;
	}

	return sInput
		.replaceAll("\t", sWhitespace + sWhitespace) // replace tabs with 2 spaces
		.replaceAll((sWhitespace + sWhitespace), (sWhitespace + sUnicodeWhitespaceCharacter)); // replace spaces
}
