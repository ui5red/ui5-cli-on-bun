import {spawn} from "node:child_process";
import {mkdtemp, open, readFile, readdir, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const sampleRoot = path.resolve(import.meta.dirname, "..");
const testRoot = path.join(sampleRoot, "test");
const fixtureRunner = path.join(sampleRoot, "scripts", "run-runtime-fixtures.mjs");
const compareLockPath = path.join(sampleRoot, ".compare-fixtures.lock");

let compareLockHandle;

async function acquireComparisonLock() {
	try {
		compareLockHandle = await open(compareLockPath, "wx");
		await compareLockHandle.writeFile(`${process.pid}\n`, "utf8");
	} catch (error) {
		if (error.code === "EEXIST") {
			throw new Error(
				`Another runtime comparison appears to be active. Remove ${compareLockPath} if that run is stale.`
			);
		}
		throw error;
	}
}

async function releaseComparisonLock() {
	await compareLockHandle?.close();
	await rm(compareLockPath, {force: true});
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

function formatSignedDuration(milliseconds) {
	return milliseconds >= 0 ? `+${formatDuration(milliseconds)}` : `-${formatDuration(Math.abs(milliseconds))}`;
}

function summarize(nodeDuration, bunDuration) {
	const delta = nodeDuration - bunDuration;
	if (delta > 0) {
		const speedup = nodeDuration / bunDuration;
		const improvement = (delta / nodeDuration) * 100;
		return `Bun was faster by ${formatDuration(delta)} (${speedup.toFixed(2)}x, ${improvement.toFixed(1)}% less wall time).`;
	}
	if (delta < 0) {
		const slowdown = bunDuration / nodeDuration;
		const regression = (Math.abs(delta) / nodeDuration) * 100;
		return `Node was faster by ${formatDuration(Math.abs(delta))} (${slowdown.toFixed(2)}x, Bun took ${regression.toFixed(1)}% more wall time).`;
	}
	return "Bun and Node finished in the same wall-clock time.";
}

function formatFixtureDelta(entry) {
	const ratio = entry.nodeDurationMs > 0 ? `${(entry.bunDurationMs / entry.nodeDurationMs).toFixed(2)}x` : "n/a";
	const detailParts = [];
	if (entry.kind === "build" && entry.nodeDetails?.subphaseTotals && entry.bunDetails?.subphaseTotals) {
		const prepDeltaMs = (entry.bunDetails.subphaseTotals.prepareMs ?? 0) - (entry.nodeDetails.subphaseTotals.prepareMs ?? 0);
		const ui5BuildDeltaMs = (entry.bunDetails.subphaseTotals.ui5BuildMs ?? 0) - (entry.nodeDetails.subphaseTotals.ui5BuildMs ?? 0);
		detailParts.push(`prep ${formatSignedDuration(prepDeltaMs)}`);
		detailParts.push(`ui5 ${formatSignedDuration(ui5BuildDeltaMs)}`);
	}

	const detailSuffix = detailParts.length ? ` [${detailParts.join(", ")}]` : "";
	return `${entry.kind} ${entry.key}: Node ${formatDuration(entry.nodeDurationMs)}, ` +
		`Bun ${formatDuration(entry.bunDurationMs)}, delta ${formatSignedDuration(entry.deltaMs)} (${ratio})${detailSuffix}`;
}

function collectFixtureDeltas(nodeReport, bunReport) {
	const nodeRecords = new Map(nodeReport.results.map((record) => [`${record.kind}:${record.key}`, record]));
	const bunRecords = new Map(bunReport.results.map((record) => [`${record.kind}:${record.key}`, record]));
	const deltas = [];

	for (const [compositeKey, nodeRecord] of nodeRecords) {
		const bunRecord = bunRecords.get(compositeKey);
		if (!bunRecord) {
			continue;
		}
		deltas.push({
			kind: nodeRecord.kind,
			key: nodeRecord.key,
			nodeDurationMs: nodeRecord.durationMs,
			bunDurationMs: bunRecord.durationMs,
			deltaMs: bunRecord.durationMs - nodeRecord.durationMs,
			nodeDetails: nodeRecord.details,
			bunDetails: bunRecord.details,
		});
	}

	return deltas;
}

function printBuildSubphaseTotals(nodeReport, bunReport) {
	const nodeBuildSubphaseTotals = nodeReport.summary.buildSubphaseTotals;
	const bunBuildSubphaseTotals = bunReport.summary.buildSubphaseTotals;
	if (!nodeBuildSubphaseTotals || !bunBuildSubphaseTotals) {
		return;
	}

	console.log("\nBuild subphases");
	for (const [label, key] of [["prepare", "prepareMs"], ["ui5", "ui5BuildMs"]]) {
		const nodeDuration = nodeBuildSubphaseTotals[key] ?? 0;
		const bunDuration = bunBuildSubphaseTotals[key] ?? 0;
		console.log(`${label}: Node ${formatDuration(nodeDuration)}, Bun ${formatDuration(bunDuration)}, delta ${formatSignedDuration(bunDuration - nodeDuration)}`);
	}
}

function printPhaseTotals(nodeReport, bunReport) {
	console.log("\nPhase totals");
	for (const kind of ["build", "serve", "parity"]) {
		const nodeDuration = nodeReport.summary.phaseTotals[kind] ?? 0;
		const bunDuration = bunReport.summary.phaseTotals[kind] ?? 0;
		const delta = bunDuration - nodeDuration;
		const deltaLabel = delta >= 0 ? `+${formatDuration(delta)}` : `-${formatDuration(Math.abs(delta))}`;
		console.log(`${kind}: Node ${formatDuration(nodeDuration)}, Bun ${formatDuration(bunDuration)}, delta ${deltaLabel}`);
	}
}

function printFixtureDeltaSummary(nodeReport, bunReport) {
	const deltas = collectFixtureDeltas(nodeReport, bunReport);
	const regressions = deltas.filter((entry) => entry.deltaMs > 0).sort((left, right) => right.deltaMs - left.deltaMs).slice(0, 8);
	const wins = deltas.filter((entry) => entry.deltaMs < 0).sort((left, right) => left.deltaMs - right.deltaMs).slice(0, 5);

	console.log("\nLargest Bun regressions");
	if (!regressions.length) {
		console.log("No Bun regressions detected in per-fixture timings.");
	} else {
		for (const entry of regressions) {
			console.log(`- ${formatFixtureDelta(entry)}`);
		}
	}

	if (!wins.length) {
		return;
	}

	console.log("\nLargest Bun wins");
	for (const entry of wins) {
		console.log(`- ${formatFixtureDelta(entry)}`);
	}
}

async function runSuite(runtimeMode, reportPath) {
	await removeGeneratedNodeModules(testRoot);

	const start = process.hrtime.bigint();
	const child = spawn(process.execPath, [fixtureRunner, runtimeMode, "--report", reportPath], {
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
			const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
			if (signal) {
				reject(new Error(`${runtimeMode} comparison run terminated with signal ${signal}`));
				return;
			}
			if (code !== 0) {
				reject(new Error(`${runtimeMode} comparison run failed with code ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
				return;
			}
			resolve(durationMs);
		});
	});
}

await acquireComparisonLock();

let reportDir;

try {
	reportDir = await mkdtemp(path.join(os.tmpdir(), "ui5-cli-on-bun-compare-"));
	const nodeReportPath = path.join(reportDir, "node-report.json");
	const bunReportPath = path.join(reportDir, "bun-report.json");
	let nodeReport;
	let bunReport;

	console.log("Running Node fixture suite...");
	const nodeDuration = await runSuite("node", nodeReportPath);
	nodeReport = JSON.parse(await readFile(nodeReportPath, "utf8"));

	console.log("\nRunning Bun fixture suite...");
	const bunDuration = await runSuite("bun", bunReportPath);
	bunReport = JSON.parse(await readFile(bunReportPath, "utf8"));

	await removeGeneratedNodeModules(testRoot);

	console.log("\nRuntime comparison summary");
	console.log(`Node: ${formatDuration(nodeDuration)}`);
	console.log(`Bun:  ${formatDuration(bunDuration)}`);
	console.log(summarize(nodeDuration, bunDuration));
	printPhaseTotals(nodeReport, bunReport);
	printBuildSubphaseTotals(nodeReport, bunReport);
	printFixtureDeltaSummary(nodeReport, bunReport);
} finally {
	if (reportDir) {
		await rm(reportDir, {recursive: true, force: true});
	}
	await releaseComparisonLock();
}