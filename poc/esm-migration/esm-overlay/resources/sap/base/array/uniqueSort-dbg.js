/*!
 * OpenUI5
 * (c) Copyright 2026 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */

/**
 * Returns a new array with unique values from the given array.
 * Preserves the order of first occurrence.
 *
 * @example
 * import uniqueSort from "sap/base/array/uniqueSort";
 * uniqueSort([3, 1, 2, 1, 3]); // [3, 1, 2]
 *
 * @param {Array} aArray The array to deduplicate
 * @returns {Array} A new array with unique elements
 * @public
 */
export default function uniqueSort(aArray) {
	const seen = new Set();
	return aArray.filter(function(item) {
		if (seen.has(item)) {
			return false;
		}
		seen.add(item);
		return true;
	});
}
