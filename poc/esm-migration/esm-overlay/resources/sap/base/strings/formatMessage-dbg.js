/*!
 * OpenUI5
 * (c) Copyright 2026 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */
import assert from "../assert-dbg.js";

/**
 * Pattern to analyze MessageFormat strings.
 * @private
 */
const rMessageFormat = /('')|'([^']+(?:''[^']*)*)(?:'|$)|\{([0-9]+(?:\s*,[^{}]*)?)\}|[{}]/g;

/**
 * Creates a string from a pattern by replacing placeholders with concrete values.
 *
 * The syntax of the pattern is inspired by (but not fully equivalent to) the
 * java.util.MessageFormat.
 *
 * Placeholders have the form { integer }, where any occurrence of
 * {0} is replaced by the value with index 0 in aValues,
 * {1} by the value with index 1 in aValues etc.
 *
 * @param {string} sPattern A pattern string in the described syntax
 * @param {any[]} [aValues=[]] The values to be used instead of the placeholders.
 * @returns {string} The formatted result string
 * @public
 */
export default function formatMessage(sPattern, aValues) {
	if (sPattern == null) {
		return "";
	}
	assert(typeof sPattern === "string" || sPattern instanceof String, "pattern must be string");
	if (arguments.length > 2 || (aValues != null && !Array.isArray(aValues))) {
		aValues = Array.prototype.slice.call(arguments, 1);
	}
	aValues = aValues || [];
	return sPattern.replace(rMessageFormat, function($0, $1, $2, $3, offset) {
		if ($1) {
			return "'";
		} else if ($2) {
			return $2.replace(/''/g, "'");
		} else if ($3) {
			return String(aValues[parseInt($3)]);
		}
		throw new Error("formatMessage: pattern syntax error at pos. " + offset);
	});
}
