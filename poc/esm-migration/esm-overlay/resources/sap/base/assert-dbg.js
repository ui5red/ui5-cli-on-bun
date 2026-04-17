/*!
 * OpenUI5
 * (c) Copyright 2026 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */

/**
 * A simple assertion mechanism that logs a message when a given condition is not met.
 *
 * <b>Note:</b> Calls to this method might be removed when the JavaScript code
 *              is optimized during build. Therefore, callers should not rely on any side effects
 *              of this method.
 *
 * @param {boolean} bResult Result of the checked assertion
 * @param {string|function():any} vMessage Message that will be logged when the result is false.
 * @public
 */
export default function assert(bResult, vMessage) {
	if (!bResult) {
		var sMessage = typeof vMessage === "function" ? vMessage() : vMessage;
		console.assert(bResult, sMessage);
	}
}
