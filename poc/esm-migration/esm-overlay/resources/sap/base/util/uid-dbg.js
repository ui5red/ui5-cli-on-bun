/*!
 * OpenUI5
 * (c) Copyright 2026 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */

/**
 * Creates and returns a pseudo-unique id.
 *
 * No means of detecting or avoiding collisions with other callers or
 * processes. This is NOT an RFC 4122 UUID. It uses a simple counter
 * prefixed with a fixed string.
 *
 * @example
 * import uid from "sap/base/util/uid";
 * uid(); // "id-1745955492000-0"
 * uid(); // "id-1745955492000-1"
 *
 * @returns {string} A pseudo-unique id
 * @public
 */
let iIdCounter = 0;

export default function uid() {
	return "id-" + new Date().valueOf() + "-" + iIdCounter++;
}
