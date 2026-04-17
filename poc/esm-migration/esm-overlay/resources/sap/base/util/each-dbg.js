/*!
 * OpenUI5
 * (c) Copyright 2026 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */

/**
 * Iterates over the given object or array, calling the callback for each entry.
 *
 * For objects, the callback receives (key, value).
 * For arrays, the callback receives (index, value).
 *
 * @example
 * import each from "sap/base/util/each";
 * each({a: 1, b: 2}, (key, value) => console.log(key, value));
 * each([10, 20], (index, value) => console.log(index, value));
 *
 * @param {object|Array} oObject The object or array to iterate over
 * @param {function} fnCallback Callback function (key/index, value)
 * @public
 */
export default function each(oObject, fnCallback) {
	if (Array.isArray(oObject)) {
		for (let i = 0; i < oObject.length; i++) {
			if (fnCallback(i, oObject[i]) === false) {
				break;
			}
		}
	} else if (oObject && typeof oObject === "object") {
		for (const key of Object.keys(oObject)) {
			if (fnCallback(key, oObject[key]) === false) {
				break;
			}
		}
	}
}
