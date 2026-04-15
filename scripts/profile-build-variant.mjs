import {access, mkdtemp, readFile, readdir, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {spawn} from "node:child_process";
import {getSampleRoot, spawnUi5} from "./local-forks.mjs";

const sampleRoot = getSampleRoot();
const testRoot = path.join(sampleRoot, "test");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const cliArgs = process.argv.slice(2);
const runtimeMode = cliArgs[0] === "node" ? "node" : "bun";
const optionArgs = cliArgs[0] === "node" || cliArgs[0] === "bun" ? cliArgs.slice(1) : cliArgs;

let fixtureKey;
let repeatCount = 3;
const includeTasks = [];
const excludeTasks = [];
let cleanInstalls = false;
let cssVariables = false;

for (let index = 0; index < optionArgs.length; index += 1) {
	const arg = optionArgs[index];
	switch (arg) {
	case "--fixture": {
		fixtureKey = optionArgs[index + 1];
		if (!fixtureKey) {
			throw new Error("Missing value for --fixture");
		}
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
	case "--include-task": {
		const taskName = optionArgs[index + 1];
		if (!taskName) {
			throw new Error("Missing value for --include-task");
		}
		includeTasks.push(taskName);
		index += 1;
		break;
	}
	case "--exclude-task": {
		const taskName = optionArgs[index + 1];
		if (!taskName) {
			throw new Error("Missing value for --exclude-task");
		}
		excludeTasks.push(taskName);
		index += 1;
		break;
	}
	case "--clean-installs":
		cleanInstalls = true;
		break;
	case "--css-variables":
		cssVariables = true;
		break;
	default:
		throw new Error(`Unknown argument: ${arg}`);
	}
}

if (!fixtureKey) {
	throw new Error("Provide a fixture via --fixture <category/name>");
}

const fixturePath = path.join(testRoot, fixtureKey);
const preparedPackageDirs = new Set();
const preparingPackageDirs = new Set();

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

function durationSince(startTime) {
	return Number(process.hrtime.bigint() - startTime) / 1_000_000;
}

function formatDuration(milliseconds) {
	return `${(milliseconds / 1000).toFixed(2)} s`;
}

function summarizeDurations(durations) {
	const average = durations.reduce((sum, value) => sum + value, 0) / durations.length;
	return `avg ${formatDuration(average)}, min ${formatDuration(Math.min(...durations))}, max ${formatDuration(Math.max(...durations))}`;
}

async function runUi5Build(destDir) {
	const ui5Args = [
		"build",
		"--all",
		"--dest",
		destDir,
		...(cssVariables ? ["--experimental-css-variables"] : []),
		...includeTasks.flatMap((taskName) => ["--include-task", taskName]),
		...excludeTasks.flatMap((taskName) => ["--exclude-task", taskName]),
	];

	const child = await spawnUi5(ui5Args, {
		cwd: fixturePath,
		runtimeMode,
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

if (cleanInstalls) {
	await removeGeneratedNodeModules(fixturePath);
}

const prepareStartedAt = process.hrtime.bigint();
await prepareFixture(fixturePath);
const prepareDurationMs = durationSince(prepareStartedAt);

const destRoot = await mkdtemp(path.join(os.tmpdir(), "ui5-cli-on-bun-build-variant-"));
const runDurations = [];

try {
	for (let runIndex = 0; runIndex < repeatCount; runIndex += 1) {
		const destDir = path.join(destRoot, `run-${runIndex + 1}`);
		const startedAt = process.hrtime.bigint();
		await runUi5Build(destDir);
		const durationMs = durationSince(startedAt);
		runDurations.push(durationMs);
		console.log(`Run ${runIndex + 1}/${repeatCount}: ${formatDuration(durationMs)}`);
	}

	console.log(`\nFixture: ${fixtureKey}`);
	console.log(`Runtime: ${runtimeMode}`);
	console.log(`Prepare once: ${formatDuration(prepareDurationMs)}`);
	console.log(`Build runs: ${summarizeDurations(runDurations)}`);
	if (cssVariables) {
		console.log("CSS variables: enabled");
	}
	if (includeTasks.length) {
		console.log(`Included tasks: ${includeTasks.join(", ")}`);
	}
	if (excludeTasks.length) {
		console.log(`Excluded tasks: ${excludeTasks.join(", ")}`);
	}
} finally {
	await rm(destRoot, {recursive: true, force: true});
}