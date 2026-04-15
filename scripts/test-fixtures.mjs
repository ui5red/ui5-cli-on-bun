import {access, mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {spawn} from "node:child_process";
import {once} from "node:events";
import os from "node:os";
import path from "node:path";
import {getCliRepoDir, getRuntimeMode, getSampleRoot, spawnRuntimeProcess, spawnUi5} from "./local-forks.mjs";

const sampleRoot = getSampleRoot();
const testRoot = path.join(sampleRoot, "test");
const runtimeMode = getRuntimeMode();
const fixtureReportPath = process.env.UI5_FIXTURE_REPORT;
const fixtureFilters = parseFixtureFilters(process.env.UI5_FIXTURE_ONLY);
const slowestFixtureCount = parsePositiveInteger(process.env.UI5_FIXTURE_TOP, 8);

const buildFixturesByCategory = {
	builder: [
		"application.a",
		"application.b",
		"application.c",
		"application.c2",
		"application.c3",
		"application.d",
		"application.e",
		"application.f",
		"application.g",
		"application.h",
		"application.i",
		"application.j",
		"application.k",
		"application.l",
		"application.m",
		"application.n",
		"application.o",
		"application.ø",
	],
	project: [
		"application.a",
		"application.a.aliases",
		"application.b",
		"application.c",
		"application.c2",
		"application.c3",
		"application.d",
		"application.e",
		"application.f",
		"application.g",
		"application.h",
		"err.application.a",
	],
	sourcemaps: ["test.application"],
};
const serveFixturesByCategory = {
	server: ["application.a"],
};
const parityChecks = [
	{key: "cli/init.application", scenario: "cli-init-application"},
	{key: "fs/fsInterface", scenario: "fs-interface"},
	{key: "fs/glob", scenario: "fs-glob"},
	{key: "fs/adapter", scenario: "fs-adapter"},
	{key: "project/workspace", scenario: "project-workspace"},
];
const expectedBuildFailures = new Set([
	"project/err.application.a",
]);
const preparedPackageDirs = new Set();
const preparingPackageDirs = new Set();

function parseFixtureFilters(rawFilters) {
	if (!rawFilters) {
		return [];
	}

	let parsedFilters;
	try {
		parsedFilters = JSON.parse(rawFilters);
	} catch {
		throw new Error("UI5_FIXTURE_ONLY must be a JSON-encoded string array");
	}

	if (!Array.isArray(parsedFilters) || parsedFilters.some((value) => typeof value !== "string" || !value.trim())) {
		throw new Error("UI5_FIXTURE_ONLY must be a JSON-encoded string array");
	}

	return parsedFilters.map((value) => value.trim());
}

function parsePositiveInteger(rawValue, fallbackValue) {
	if (!rawValue) {
		return fallbackValue;
	}

	const parsedValue = Number.parseInt(rawValue, 10);
	if (!Number.isFinite(parsedValue) || parsedValue < 1) {
		throw new Error(`Expected a positive integer but received ${rawValue}`);
	}
	return parsedValue;
}

function formatDuration(milliseconds) {
	return `${(milliseconds / 1000).toFixed(2)} s`;
}

function durationSince(startTime) {
	return Number(process.hrtime.bigint() - startTime) / 1_000_000;
}

function createTimingRecord(kind, key, status, durationMs, errorMessage) {
	return {
		kind,
		key,
		status,
		durationMs,
		...(errorMessage ? {errorMessage} : {}),
	};
}

function shouldRunFixture(kind, key) {
	if (!fixtureFilters.length) {
		return true;
	}

	const candidates = [
		key,
		`${kind}:${key}`,
		`${kind}/${key}`,
	].map((value) => value.toLowerCase());

	return fixtureFilters.some((filter) => {
		const normalizedFilter = filter.toLowerCase();
		return candidates.some((candidate) => candidate.includes(normalizedFilter));
	});
}

function getPhaseTotals(timingRecords) {
	return timingRecords.reduce((phaseTotals, record) => {
		phaseTotals[record.kind] = (phaseTotals[record.kind] ?? 0) + record.durationMs;
		return phaseTotals;
	}, {build: 0, serve: 0, parity: 0});
}

function printTimingSummary(timingRecords, suiteDurationMs) {
	if (!timingRecords.length) {
		return;
	}

	const phaseTotals = getPhaseTotals(timingRecords);
	console.log(`Timing totals for ${runtimeMode}: ` +
		`build ${formatDuration(phaseTotals.build)}, ` +
		`serve ${formatDuration(phaseTotals.serve)}, ` +
		`parity ${formatDuration(phaseTotals.parity)}, ` +
		`overall ${formatDuration(suiteDurationMs)}`);

	const slowestFixtures = [...timingRecords]
		.sort((left, right) => right.durationMs - left.durationMs)
		.slice(0, slowestFixtureCount);

	if (!slowestFixtures.length) {
		return;
	}

	console.log(`Slowest ${runtimeMode} fixture steps:`);
	for (const record of slowestFixtures) {
		console.log(`- ${record.kind} ${record.key}: ${formatDuration(record.durationMs)} [${record.status}]`);
	}
}

function fixtureKey(category, name) {
	return `${category}/${name}`;
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

async function runCommandCaptured(command, args, cwd) {
	const child = spawn(command, args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
	});

	return await new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		child.on("error", reject);
		child.on("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`${command} terminated with signal ${signal}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
				return;
			}
			if (code !== 0) {
				reject(new Error(`${command} exited with code ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
				return;
			}
			resolve({stdout, stderr});
		});
	});
}

async function runUi5Captured(ui5Args, cwd) {
	const child = await spawnUi5(ui5Args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
	});

	return await new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		child.on("error", reject);
		child.on("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`UI5 process terminated with signal ${signal}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
				return;
			}
			if (code !== 0) {
				reject(new Error(`UI5 process exited with code ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
				return;
			}
			resolve({stdout, stderr});
		});
	});
}

async function runRuntimeCaptured(args, cwd, env = {}, runtime = runtimeMode) {
	const child = await spawnRuntimeProcess(args, {
		cwd,
		env,
		runtimeMode: runtime,
		stdio: ["ignore", "pipe", "pipe"],
	});

	return await new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		child.on("error", reject);
		child.on("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`${runtime} process terminated with signal ${signal}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
				return;
			}
			if (code !== 0) {
				reject(new Error(`${runtime} process exited with code ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
				return;
			}
			resolve({stdout, stderr});
		});
	});
}

async function prepareFixture(cwd) {
	const packageJsonPath = path.join(cwd, "package.json");
	let packageJsonSource;
	try {
		packageJsonSource = await readFile(packageJsonPath, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") {
			return;
		}
		throw error;
	}

	if (!packageJsonSource.trim()) {
		return;
	}

	const packageJson = JSON.parse(packageJsonSource);
	const localDependencyDirs = [
		...Object.values(packageJson.dependencies ?? {}),
		...Object.values(packageJson.devDependencies ?? {}),
		...Object.values(packageJson.optionalDependencies ?? {}),
	].flatMap((range) => {
		if (typeof range !== "string") {
			return [];
		}
		if (range.startsWith("file:") || range.startsWith("link:")) {
			return [path.resolve(cwd, range.replace(/^(file:|link:)/, ""))];
		}
		return [];
	});

	if (!localDependencyDirs.length) {
		return;
	}

	const resolvedCwd = path.resolve(cwd);
	if (preparedPackageDirs.has(resolvedCwd) || preparingPackageDirs.has(resolvedCwd)) {
		return;
	}

	preparingPackageDirs.add(resolvedCwd);
	try {
		for (const dependencyDir of localDependencyDirs) {
			await prepareFixture(dependencyDir);
		}

		try {
			await access(path.join(cwd, "node_modules"));
			preparedPackageDirs.add(resolvedCwd);
			return;
		} catch (error) {
			if (error.code !== "ENOENT") {
				throw error;
			}
		}

		await runCommandCaptured(npmCommand, [
			"install",
			"--ignore-scripts",
			"--package-lock=false",
			"--no-audit",
			"--no-fund",
		], cwd);
		preparedPackageDirs.add(resolvedCwd);
	} finally {
		preparingPackageDirs.delete(resolvedCwd);
	}
}

function waitForHttpServer(child) {
	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";

		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error(`Timed out waiting for the UI5 server to start.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
		}, 20000);

		function cleanup() {
			clearTimeout(timeout);
			child.stdout?.off("data", onStdout);
			child.stderr?.off("data", onStderr);
			child.off("error", onError);
			child.off("exit", onExit);
		}

		function onStdout(chunk) {
			stdout += chunk.toString();
			const match = stdout.match(/URL:\s+(http:\/\/localhost:\d+)/);
			if (match) {
				cleanup();
				resolve({url: match[1], stdout, stderr});
			}
		}

		function onStderr(chunk) {
			stderr += chunk.toString();
		}

		function onError(error) {
			cleanup();
			reject(error);
		}

		function onExit(code, signal) {
			cleanup();
			reject(new Error(`UI5 server exited before becoming ready (code: ${code}, signal: ${signal}).\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
		}

		child.stdout?.on("data", onStdout);
		child.stderr?.on("data", onStderr);
		child.on("error", onError);
		child.on("exit", onExit);
	});
}

async function stopServer(child) {
	if (child.exitCode !== null || child.signalCode !== null) {
		return;
	}
	child.kill("SIGTERM");
	await once(child, "exit");
}

async function runBuildFixture(category, name, tmpRoot, failures, timingRecords) {
	const key = fixtureKey(category, name);
	const cwd = path.join(testRoot, category, name);
	const destDir = path.join(tmpRoot, category, name);
	const startedAt = process.hrtime.bigint();
	let status = "pass";
	let errorMessage;
	let message = `PASS build ${key}`;
	await mkdir(path.dirname(destDir), {recursive: true});

	try {
		await prepareFixture(cwd);
		await runUi5Captured(["build", "--all", "--dest", destDir], cwd);
		if (expectedBuildFailures.has(key)) {
			status = "unexpected-success";
			failures.push(`${key}: expected failure but build succeeded`);
			message = `FAIL ${key} (expected build failure)`;
		}
	} catch (error) {
		if (expectedBuildFailures.has(key)) {
			status = "expected-failure";
			message = `PASS expected-failure ${key}`;
		} else {
			status = "fail";
			errorMessage = error.message;
			failures.push(`${key}: ${error.message}`);
			message = `FAIL build ${key}`;
		}
	}

	const timingRecord = createTimingRecord("build", key, status, durationSince(startedAt), errorMessage);
	timingRecords.push(timingRecord);
	console.log(`${message} (${formatDuration(timingRecord.durationMs)})`);
}

async function runServerFixture(category, name, port, failures, timingRecords) {
	const key = fixtureKey(category, name);
	const cwd = path.join(testRoot, category, name);
	const startedAt = process.hrtime.bigint();
	let child;
	let status = "pass";
	let errorMessage;
	let message = `PASS serve ${key}`;

	try {
		await prepareFixture(cwd);
		child = await spawnUi5(["serve", "--port", String(port)], {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const {url} = await waitForHttpServer(child);
		const response = await fetch(`${url}/index.html`, {
			signal: AbortSignal.timeout(10000),
		});
		if (!response.ok) {
			throw new Error(`Expected HTTP 200, got ${response.status}`);
		}
		const body = await response.text();
		if (!body.trim()) {
			throw new Error("Expected non-empty response body from server fixture");
		}
	} catch (error) {
		status = "fail";
		errorMessage = error.message;
		failures.push(`${key}: ${error.message}`);
		message = `FAIL serve ${key}`;
	} finally {
		if (child) {
			await stopServer(child);
		}
	}

	const timingRecord = createTimingRecord("serve", key, status, durationSince(startedAt), errorMessage);
	timingRecords.push(timingRecord);
	console.log(`${message} (${formatDuration(timingRecord.durationMs)})`);
}

async function runParityCheck({key, scenario}, failures, timingRecords) {
	const startedAt = process.hrtime.bigint();
	let status = "pass";
	let errorMessage;
	let message = `PASS parity ${key}`;

	try {
		await runRuntimeCaptured([
			path.join(sampleRoot, "scripts", "fixture-parity-runner.mjs"),
			scenario,
			sampleRoot,
			getCliRepoDir(),
		], sampleRoot);
	} catch (error) {
		status = "fail";
		errorMessage = error.message;
		failures.push(`${key}: ${error.message}`);
		message = `FAIL parity ${key}`;
	}

	const timingRecord = createTimingRecord("parity", key, status, durationSince(startedAt), errorMessage);
	timingRecords.push(timingRecord);
	console.log(`${message} (${formatDuration(timingRecord.durationMs)})`);
}

const suiteStartedAt = process.hrtime.bigint();
const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "ui5-cli-on-bun-fixtures-"));
const failures = [];
const timingRecords = [];
let buildCount = 0;
let serverCount = 0;
let expectedFailureCount = 0;
let parityCount = 0;
let selectedFixtureCount = 0;
let suiteError;

try {
	for (const [category, fixtures] of Object.entries(buildFixturesByCategory)) {
		for (const name of fixtures) {
			const key = fixtureKey(category, name);
			if (!shouldRunFixture("build", key)) {
				continue;
			}
			if (expectedBuildFailures.has(fixtureKey(category, name))) {
				expectedFailureCount += 1;
			}
			buildCount += 1;
			selectedFixtureCount += 1;
			await runBuildFixture(category, name, tmpRoot, failures, timingRecords);
		}
	}

	let nextPort = 31080;
	for (const [category, fixtures] of Object.entries(serveFixturesByCategory)) {
		for (const name of fixtures) {
			const key = fixtureKey(category, name);
			if (!shouldRunFixture("serve", key)) {
				nextPort += 1;
				continue;
			}
			serverCount += 1;
			selectedFixtureCount += 1;
			await runServerFixture(category, name, nextPort, failures, timingRecords);
			nextPort += 1;
		}
	}

	for (const parityCheck of parityChecks) {
		if (!shouldRunFixture("parity", parityCheck.key)) {
			continue;
		}
		parityCount += 1;
		selectedFixtureCount += 1;
		await runParityCheck(parityCheck, failures, timingRecords);
	}
} finally {
	await rm(tmpRoot, {recursive: true, force: true});
}

if (!selectedFixtureCount) {
	suiteError = new Error(`No fixture steps matched filters: ${fixtureFilters.join(", ")}`);
} else if (failures.length) {
	suiteError = new Error(`Fixture suite failed:\n- ${failures.join("\n- ")}`);
}

const suiteDurationMs = durationSince(suiteStartedAt);
const phaseTotals = getPhaseTotals(timingRecords);

const fixtureReport = {
	runtimeMode,
	filters: fixtureFilters,
	summary: {
		buildCount,
		serverCount,
		parityCount,
		expectedFailureCount,
		selectedFixtureCount,
		totalWallTimeMs: suiteDurationMs,
		phaseTotals,
	},
	results: timingRecords,
};

if (fixtureReportPath) {
	await writeFile(fixtureReportPath, JSON.stringify(fixtureReport, null, 2));
}

printTimingSummary(timingRecords, suiteDurationMs);

if (suiteError) {
	throw suiteError;
}

console.log(
	`Fixture suite passed for ${runtimeMode}. Built ${buildCount} fixtures, served ${serverCount} fixtures, ` +
	`ran ${parityCount} parity checks, validated ${expectedFailureCount} expected build failure, ` +
	`and completed in ${formatDuration(suiteDurationMs)}.`
);