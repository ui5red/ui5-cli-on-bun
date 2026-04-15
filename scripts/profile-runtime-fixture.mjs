import {spawn} from "node:child_process";
import {mkdtemp, readFile, readdir, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const sampleRoot = path.resolve(import.meta.dirname, "..");
const testRoot = path.join(sampleRoot, "test");
const fixtureRunner = path.join(sampleRoot, "scripts", "run-runtime-fixtures.mjs");

const cliArgs = process.argv.slice(2);
const runtimeMode = cliArgs[0] === "node" ? "node" : "bun";
const optionArgs = cliArgs[0] === "node" || cliArgs[0] === "bun" ? cliArgs.slice(1) : cliArgs;

let repeatCount = 3;
const fixtureFilters = [];

for (let index = 0; index < optionArgs.length; index += 1) {
	const arg = optionArgs[index];
	switch (arg) {
	case "--only": {
		const filter = optionArgs[index + 1];
		if (!filter) {
			throw new Error("Missing value for --only");
		}
		fixtureFilters.push(filter);
		index += 1;
		break;
	}
	case "--repeat": {
		const rawRepeatCount = optionArgs[index + 1];
		if (!rawRepeatCount) {
			throw new Error("Missing value for --repeat");
		}
		repeatCount = Number.parseInt(rawRepeatCount, 10);
		if (!Number.isFinite(repeatCount) || repeatCount < 1) {
			throw new Error(`Invalid value for --repeat: ${rawRepeatCount}`);
		}
		index += 1;
		break;
	}
	default:
		throw new Error(`Unknown argument: ${arg}`);
	}
}

if (!fixtureFilters.length) {
	throw new Error("Provide at least one --only filter when profiling fixture timings");
}

async function removeGeneratedNodeModules(rootDir) {
	const entries = await readdir(rootDir, {withFileTypes: true});

	await Promise.all(entries.map(async (entry) => {
		const fullPath = path.join(rootDir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules") {
				await rm(fullPath, {recursive: true, force: true});
				return;
			}
			await removeGeneratedNodeModules(fullPath);
		}
	}));
}

function formatDuration(milliseconds) {
	return `${(milliseconds / 1000).toFixed(2)} s`;
}

async function runProfilePass(reportPath) {
	await removeGeneratedNodeModules(testRoot);

	const child = spawn(process.execPath, [
		fixtureRunner,
		runtimeMode,
		"--report",
		reportPath,
		"--top",
		"5",
		...fixtureFilters.flatMap((filter) => ["--only", filter]),
	], {
		cwd: sampleRoot,
		env: process.env,
		stdio: ["ignore", "pipe", "pipe"],
	});

	return await new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (chunk) => {
			const text = chunk.toString();
			stdout += text;
			process.stdout.write(text);
		});
		child.stderr?.on("data", (chunk) => {
			const text = chunk.toString();
			stderr += text;
			process.stderr.write(text);
		});

		child.on("error", reject);
		child.on("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`${runtimeMode} profile run terminated with signal ${signal}`));
				return;
			}
			if (code !== 0) {
				reject(new Error(`${runtimeMode} profile run failed with code ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
				return;
			}
			resolve();
		});
	});
}

function summarizeReports(reports) {
	const fixtureStats = new Map();
	const suiteDurations = [];

	for (const report of reports) {
		suiteDurations.push(report.summary.totalWallTimeMs);
		for (const record of report.results) {
			const compositeKey = `${record.kind}:${record.key}`;
			const durations = fixtureStats.get(compositeKey) ?? [];
			durations.push(record.durationMs);
			fixtureStats.set(compositeKey, durations);
		}
	}

	console.log("\nProfile summary");
	console.log(
		`Suite total: avg ${formatDuration(suiteDurations.reduce((sum, value) => sum + value, 0) / suiteDurations.length)}, ` +
		`min ${formatDuration(Math.min(...suiteDurations))}, max ${formatDuration(Math.max(...suiteDurations))}`
	);

	const sortedEntries = [...fixtureStats.entries()].sort((left, right) => {
		const leftAverage = left[1].reduce((sum, value) => sum + value, 0) / left[1].length;
		const rightAverage = right[1].reduce((sum, value) => sum + value, 0) / right[1].length;
		return rightAverage - leftAverage;
	});

	for (const [compositeKey, durations] of sortedEntries) {
		const average = durations.reduce((sum, value) => sum + value, 0) / durations.length;
		console.log(
			`- ${compositeKey.replace(":", " ")}: avg ${formatDuration(average)}, ` +
			`min ${formatDuration(Math.min(...durations))}, max ${formatDuration(Math.max(...durations))}`
		);
	}
}

const reportDir = await mkdtemp(path.join(os.tmpdir(), "ui5-cli-on-bun-profile-"));
const reports = [];

try {
	for (let runIndex = 0; runIndex < repeatCount; runIndex += 1) {
		const reportPath = path.join(reportDir, `profile-${runIndex + 1}.json`);
		console.log(`Run ${runIndex + 1}/${repeatCount} for ${runtimeMode} (${fixtureFilters.join(", ")})`);
		await runProfilePass(reportPath);
		reports.push(JSON.parse(await readFile(reportPath, "utf8")));
	}

	await removeGeneratedNodeModules(testRoot);
	summarizeReports(reports);
} finally {
	await rm(reportDir, {recursive: true, force: true});
}