/*!
 * OpenUI5
 * (c) Copyright 2026 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */

/**
 * Returns a high resolution timestamp in microseconds.
 * The timestamp is based on 01/01/1970 00:00:00 (UNIX epoch) as float with microsecond precision.
 *
 * @returns {float} timestamp in microseconds
 * @public
 */
export default function now() {
	return performance.timeOrigin + performance.now();
}
