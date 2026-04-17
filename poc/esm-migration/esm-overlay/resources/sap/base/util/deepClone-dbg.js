/*!
 * OpenUI5
 * (c) Copyright 2026 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */

import isPlainObject from "./isPlainObject-dbg.js";

/**
 * Creates a deep clone of the given value.
 *
 * Supports plain objects, arrays, and primitives. Non-plain objects
 * (e.g. class instances, Date, RegExp) are returned as-is (by reference).
 *
 * @example
 * import deepClone from "sap/base/util/deepClone";
 * const original = { a: { b: 1 }, c: [2, 3] };
 * const cloned = deepClone(original);
 * cloned.a.b = 42;
 * console.log(original.a.b); // 1
 *
 * @param {*} src The value to clone
 * @returns {*} A deep clone of the value
 * @public
 */
export default function deepClone(src) {
	if (src == null || typeof src !== "object") {
		// Primitives and null/undefined
		return src;
	}
	if (Array.isArray(src)) {
		return src.map(deepClone);
	}
	if (isPlainObject(src)) {
		const clone = {};
		for (const key of Object.keys(src)) {
			clone[key] = deepClone(src[key]);
		}
		return clone;
	}
	// Non-plain objects are returned by reference
	return src;
}
