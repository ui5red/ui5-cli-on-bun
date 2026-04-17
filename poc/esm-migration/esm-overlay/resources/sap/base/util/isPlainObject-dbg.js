/*!
 * OpenUI5
 * (c) Copyright 2026 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */

/**
 * Checks whether the given value is a plain object (created using "{}" or "new Object").
 *
 * @example
 * import isPlainObject from "sap/base/util/isPlainObject";
 * isPlainObject({});         // true
 * isPlainObject(new Object); // true
 * isPlainObject([]);         // false
 * isPlainObject(null);       // false
 *
 * @param {*} value The value to check
 * @returns {boolean} Whether the value is a plain object
 * @public
 */
export default function isPlainObject(value) {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	if (Array.isArray(value)) {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	// Objects created with Object.create(null) have no prototype
	if (proto === null) {
		return true;
	}
	return proto === Object.prototype;
}
