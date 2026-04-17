/**
 * Test script to verify ESM-converted UI5 modules work correctly.
 *
 * Tests:
 * 1. Zero-dependency leaf modules (sap/base/strings/*)
 * 2. Module with ESM import dependency (formatMessage → assert)
 * 3. Functional correctness matches original AMD module behavior
 */

const RESOURCES = "./dist-esm/resources";

console.log("=== UI5 ESM Module Tests ===\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
	try {
		fn();
		console.log(`  PASS: ${name}`);
		passed++;
	} catch (e) {
		console.log(`  FAIL: ${name}`);
		console.log(`        ${e.message}`);
		failed++;
	}
}

function assertEqual(actual, expected, msg) {
	if (actual !== expected) {
		throw new Error(`${msg || "Assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
	}
}

// --- Test zero-dependency leaf modules ---

console.log("--- sap/base/strings leaf modules (zero deps) ---");

const { default: camelize } = await import(`${RESOURCES}/sap/base/strings/camelize-dbg.js`);
test("camelize('foo-bar') => 'fooBar'", () => {
	assertEqual(camelize("foo-bar"), "fooBar");
});
test("camelize('my-component-name') => 'myComponentName'", () => {
	assertEqual(camelize("my-component-name"), "myComponentName");
});

const { default: capitalize } = await import(`${RESOURCES}/sap/base/strings/capitalize-dbg.js`);
test("capitalize('foobar') => 'Foobar'", () => {
	assertEqual(capitalize("foobar"), "Foobar");
});
test("capitalize('already') => 'Already'", () => {
	assertEqual(capitalize("already"), "Already");
});

const { default: escapeRegExp } = await import(`${RESOURCES}/sap/base/strings/escapeRegExp-dbg.js`);
test("escapeRegExp('m*c') => 'm\\\\*c'", () => {
	assertEqual(escapeRegExp("m*c"), "m\\*c");
});
test("escapeRegExp('[test]') => '\\\\[test\\\\]'", () => {
	assertEqual(escapeRegExp("[test]"), "\\[test\\]");
});

const { default: hash } = await import(`${RESOURCES}/sap/base/strings/hash-dbg.js`);
test("hash('') => 0", () => {
	assertEqual(hash(""), 0);
});
test("hash('test') => 3569518", () => {
	assertEqual(hash("test"), 3569518);
});

const { default: hyphenate } = await import(`${RESOURCES}/sap/base/strings/hyphenate-dbg.js`);
test("hyphenate('fooBar') => 'foo-bar'", () => {
	assertEqual(hyphenate("fooBar"), "foo-bar");
});

const { default: toHex } = await import(`${RESOURCES}/sap/base/strings/toHex-dbg.js`);
test("toHex(10, 2) => '0a'", () => {
	assertEqual(toHex(10, 2), "0a");
});
test("toHex(16, 2) => '10'", () => {
	assertEqual(toHex(16, 2), "10");
});

const { default: whitespaceReplacer } = await import(`${RESOURCES}/sap/base/strings/whitespaceReplacer-dbg.js`);
test("whitespaceReplacer handles tabs", () => {
	const result = whitespaceReplacer("\t");
	assertEqual(result, " \u00A0");
});
test("whitespaceReplacer passes through non-strings", () => {
	assertEqual(whitespaceReplacer(42), 42);
});

// --- Test module with dependency ---

console.log("\n--- sap/base/assert (zero deps) ---");

const { default: assert } = await import(`${RESOURCES}/sap/base/assert-dbg.js`);
test("assert(true, 'ok') does not throw", () => {
	assert(true, "this should pass");
});
test("assert is a function", () => {
	assertEqual(typeof assert, "function");
});

console.log("\n--- sap/base/strings/formatMessage (depends on assert) ---");

const { default: formatMessage } = await import(`${RESOURCES}/sap/base/strings/formatMessage-dbg.js`);
test("formatMessage('Say {0}', ['Hello']) => 'Say Hello'", () => {
	assertEqual(formatMessage("Say {0}", ["Hello"]), "Say Hello");
});
test("formatMessage with multiple placeholders", () => {
	assertEqual(formatMessage("{0} and {1}", ["foo", "bar"]), "foo and bar");
});
test("formatMessage with escaped quotes", () => {
	assertEqual(formatMessage("Say '{0}'", ["Hello"]), "Say {0}");
});
test("formatMessage with doubled quotes", () => {
	assertEqual(formatMessage("Say ''{0}''", ["Hello"]), "Say 'Hello'");
});
test("formatMessage(null) => ''", () => {
	assertEqual(formatMessage(null), "");
});

// --- Test stateful module: sap/base/Log ---

console.log("\n--- sap/base/Log (stateful, depends on util/now) ---");

const { default: Log } = await import(`${RESOURCES}/sap/base/Log-dbg.js`);

test("Log is an object with Level enum", () => {
	assertEqual(typeof Log, "object");
	assertEqual(Log.Level.ERROR, 1);
	assertEqual(Log.Level.DEBUG, 4);
});

test("Log.getLevel returns default ERROR level", () => {
	assertEqual(Log.getLevel(), Log.Level.ERROR);
});

test("Log.isLoggable(ERROR) is true at default level", () => {
	assertEqual(Log.isLoggable(Log.Level.ERROR), true);
});

test("Log.isLoggable(DEBUG) is false at default level", () => {
	assertEqual(Log.isLoggable(Log.Level.DEBUG), false);
});

test("Log.setLevel changes effective level", () => {
	Log.setLevel(Log.Level.DEBUG);
	assertEqual(Log.getLevel(), Log.Level.DEBUG);
	assertEqual(Log.isLoggable(Log.Level.DEBUG), true);
	// Reset
	Log.setLevel(Log.Level.ERROR);
});

test("Log.error creates a log entry", () => {
	const before = Log.getLogEntries().length;
	Log.error("test error message", "details", "test.component");
	const entries = Log.getLogEntries();
	assertEqual(entries.length, before + 1);
	const last = entries[entries.length - 1];
	assertEqual(last.message, "test error message");
	assertEqual(last.details, "details");
	assertEqual(last.component, "test.component");
	assertEqual(last.level, Log.Level.ERROR);
});

test("Log.getLogger returns component-scoped logger", () => {
	Log.setLevel(Log.Level.DEBUG);
	const logger = Log.getLogger("my.component");
	assertEqual(typeof logger.error, "function");
	assertEqual(typeof logger.info, "function");
	logger.error("component error");
	const entries = Log.getLogEntries();
	const last = entries[entries.length - 1];
	assertEqual(last.component, "my.component");
	Log.setLevel(Log.Level.ERROR);
});

test("Log entries have timestamps from util/now", () => {
	Log.error("timestamp test");
	const entries = Log.getLogEntries();
	const last = entries[entries.length - 1];
	assertEqual(typeof last.timestamp, "number");
	assertEqual(last.timestamp > 0, true);
	assertEqual(typeof last.time, "string");
	assertEqual(typeof last.date, "string");
});

test("Log.addLogListener / removeLogListener works", () => {
	const received = [];
	const listener = {
		onLogEntry(entry) { received.push(entry); }
	};
	Log.addLogListener(listener);
	Log.error("listener test");
	assertEqual(received.length, 1);
	assertEqual(received[0].message, "listener test");
	Log.removeLogListener(listener);
	Log.error("after remove");
	assertEqual(received.length, 1); // listener should not receive this
});

test("Log state is shared (singleton semantics)", async () => {
	// Import again — should be the same instance
	const { default: Log2 } = await import(`${RESOURCES}/sap/base/Log-dbg.js`);
	Log.error("singleton test");
	const entries1 = Log.getLogEntries();
	const entries2 = Log2.getLogEntries();
	assertEqual(entries1.length, entries2.length);
	assertEqual(entries1[entries1.length - 1].message, "singleton test");
	assertEqual(entries2[entries2.length - 1].message, "singleton test");
});

// --- Test new util modules (batch 2) ---

console.log("\n--- sap/base/util/isPlainObject (zero deps) ---");

const { default: isPlainObject } = await import(`${RESOURCES}/sap/base/util/isPlainObject-dbg.js`);
test("isPlainObject({}) => true", () => {
	assertEqual(isPlainObject({}), true);
});
test("isPlainObject(new Object) => true", () => {
	assertEqual(isPlainObject(new Object()), true);
});
test("isPlainObject([]) => false", () => {
	assertEqual(isPlainObject([]), false);
});
test("isPlainObject(null) => false", () => {
	assertEqual(isPlainObject(null), false);
});
test("isPlainObject(42) => false", () => {
	assertEqual(isPlainObject(42), false);
});
test("isPlainObject(Object.create(null)) => true", () => {
	assertEqual(isPlainObject(Object.create(null)), true);
});

console.log("\n--- sap/base/util/deepClone (depends on isPlainObject) ---");

const { default: deepClone } = await import(`${RESOURCES}/sap/base/util/deepClone-dbg.js`);
test("deepClone creates independent copy", () => {
	const original = { a: { b: 1 }, c: [2, 3] };
	const cloned = deepClone(original);
	cloned.a.b = 42;
	cloned.c.push(4);
	assertEqual(original.a.b, 1);
	assertEqual(original.c.length, 2);
});
test("deepClone handles primitives", () => {
	assertEqual(deepClone(42), 42);
	assertEqual(deepClone("hello"), "hello");
	assertEqual(deepClone(null), null);
	assertEqual(deepClone(undefined), undefined);
});
test("deepClone handles arrays of objects", () => {
	const original = [{ x: 1 }, { y: 2 }];
	const cloned = deepClone(original);
	cloned[0].x = 99;
	assertEqual(original[0].x, 1);
});

console.log("\n--- sap/base/util/each (zero deps) ---");

const { default: each } = await import(`${RESOURCES}/sap/base/util/each-dbg.js`);
test("each iterates over object keys", () => {
	const keys = [];
	each({ a: 1, b: 2 }, (key) => { keys.push(key); });
	assertEqual(keys.join(","), "a,b");
});
test("each iterates over array indices", () => {
	const items = [];
	each([10, 20, 30], (i, val) => { items.push(val); });
	assertEqual(items.join(","), "10,20,30");
});
test("each stops on false return", () => {
	const keys = [];
	each({ a: 1, b: 2, c: 3 }, (key) => {
		keys.push(key);
		if (key === "b") return false;
	});
	assertEqual(keys.join(","), "a,b");
});

console.log("\n--- sap/base/util/values (zero deps) ---");

const { default: values } = await import(`${RESOURCES}/sap/base/util/values-dbg.js`);
test("values({a:1, b:2}) => [1, 2]", () => {
	const result = values({ a: 1, b: 2 });
	assertEqual(result.length, 2);
	assertEqual(result[0], 1);
	assertEqual(result[1], 2);
});
test("values({}) => []", () => {
	assertEqual(values({}).length, 0);
});
test("values(null) => []", () => {
	assertEqual(values(null).length, 0);
});

console.log("\n--- sap/base/util/uid (stateful, zero deps) ---");

const { default: uid } = await import(`${RESOURCES}/sap/base/util/uid-dbg.js`);
test("uid returns a string", () => {
	assertEqual(typeof uid(), "string");
});
test("uid returns unique values", () => {
	const id1 = uid();
	const id2 = uid();
	assertEqual(id1 !== id2, true);
});
test("uid starts with 'id-'", () => {
	assertEqual(uid().startsWith("id-"), true);
});

console.log("\n--- sap/base/array/uniqueSort (zero deps) ---");

const { default: uniqueSort } = await import(`${RESOURCES}/sap/base/array/uniqueSort-dbg.js`);
test("uniqueSort([3,1,2,1,3]) => [3,1,2]", () => {
	const result = uniqueSort([3, 1, 2, 1, 3]);
	assertEqual(result.length, 3);
	assertEqual(result[0], 3);
	assertEqual(result[1], 1);
	assertEqual(result[2], 2);
});
test("uniqueSort preserves order", () => {
	const result = uniqueSort(["b", "a", "b", "c", "a"]);
	assertEqual(result.join(","), "b,a,c");
});
test("uniqueSort handles empty array", () => {
	assertEqual(uniqueSort([]).length, 0);
});

// --- Summary ---

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
	process.exit(1);
}
