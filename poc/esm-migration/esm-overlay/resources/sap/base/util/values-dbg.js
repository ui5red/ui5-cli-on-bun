/*!
 * OpenUI5
 * (c) Copyright 2026 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */

/**
 * Returns the values of the given object as an array.
 *
 * @example
 * import values from "sap/base/util/values";
 * values({a: 1, b: 2, c: 3}); // [1, 2, 3]
 *
 * @param {object} mObject The object to get values from
 * @returns {Array} The values of the object as an array
 * @public
 */
export default function values(mObject) {
	// Fallback: polyfill-safe implementation
	if (typeof Object.values === "function") {
		return Object.values(mObject || {});
	}
	return Object.keys(mObject || {}).map(function(key) {
		return mObject[key];
	});
}
