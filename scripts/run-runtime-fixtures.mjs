const cliArgs = process.argv.slice(2);
const runtimeMode = cliArgs[0] === "node" ? "node" : "bun";
const optionArgs = cliArgs[0] === "node" || cliArgs[0] === "bun" ? cliArgs.slice(1) : cliArgs;

let reportPath;
let topCount;
const fixtureFilters = [];

for (let index = 0; index < optionArgs.length; index += 1) {
	const arg = optionArgs[index];
	switch (arg) {
	case "--report":
		reportPath = optionArgs[index + 1];
		if (!reportPath) {
			throw new Error("Missing value for --report");
		}
		index += 1;
		break;
	case "--only": {
		const filter = optionArgs[index + 1];
		if (!filter) {
			throw new Error("Missing value for --only");
		}
		fixtureFilters.push(filter);
		index += 1;
		break;
	}
	case "--top": {
		const rawTopCount = optionArgs[index + 1];
		if (!rawTopCount) {
			throw new Error("Missing value for --top");
		}
		topCount = Number.parseInt(rawTopCount, 10);
		if (!Number.isFinite(topCount) || topCount < 1) {
			throw new Error(`Invalid value for --top: ${rawTopCount}`);
		}
		index += 1;
		break;
	}
	default:
		throw new Error(`Unknown argument: ${arg}`);
	}
}

process.env.UI5_RUNTIME_MODE = runtimeMode;

if (reportPath) {
	process.env.UI5_FIXTURE_REPORT = reportPath;
} else {
	delete process.env.UI5_FIXTURE_REPORT;
}

if (fixtureFilters.length) {
	process.env.UI5_FIXTURE_ONLY = JSON.stringify(fixtureFilters);
} else {
	delete process.env.UI5_FIXTURE_ONLY;
}

if (topCount !== undefined) {
	process.env.UI5_FIXTURE_TOP = String(topCount);
} else {
	delete process.env.UI5_FIXTURE_TOP;
}

await import("./test-fixtures.mjs");