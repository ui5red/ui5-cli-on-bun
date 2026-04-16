import {mkdtemp, readFile, stat, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {findBunBinary, getSampleRoot, runUi5, spawnBun} from "./local-forks.mjs";

const sampleRoot = getSampleRoot();
const spikeRoot = path.join(sampleRoot, "examples", "self-contained-bundler-spike");
const webappRoot = path.join(spikeRoot, "webapp");
const outputRoot = await mkdtemp(path.join(os.tmpdir(), "ui5-cli-on-bun-self-contained-spike-"));
const ui5OutDir = path.join(outputRoot, "ui5-self-contained");
const bunOutDir = path.join(outputRoot, "bun-build");
const bunBuildScriptPath = path.join(outputRoot, "bun-build-spike.mjs");

function formatDuration(milliseconds) {
	return `${(milliseconds / 1000).toFixed(2)} s`;
}

function durationSince(startTime) {
	return Number(process.hrtime.bigint() - startTime) / 1_000_000;
}

async function runBunBuild() {
	const bunBinary = await findBunBinary();
	const buildScript = `
const result = await Bun.build({
	entrypoints: ["${path.join(webappRoot, "index.html").replaceAll("\\", "/")}"],
	outdir: "${bunOutDir.replaceAll("\\", "/")}",
	target: "browser",
	sourcemap: "external",
	minify: false,
});

if (!result.success) {
	for (const log of result.logs) {
		console.error(log.message);
	}
	process.exit(1);
}

console.log(JSON.stringify(result.outputs.map((output) => output.path), null, 2));
`;

	await writeFile(bunBuildScriptPath, buildScript, "utf8");

	const child = await spawnBun([bunBuildScriptPath], {
		cwd: spikeRoot,
		stdio: ["ignore", "pipe", "pipe"],
		env: {
			...process.env,
			PATH: `${path.dirname(bunBinary)}:${process.env.PATH || ""}`,
		}
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
				reject(new Error(`Bun.build spike terminated with signal ${signal}\nSTDERR:\n${stderr}`));
				return;
			}
			if (code !== 0) {
				reject(new Error(`Bun.build spike exited with code ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
				return;
			}
			resolve({stdout, stderr});
		});
	});
}

async function getFileSize(targetPath) {
	const details = await stat(targetPath);
	return details.size;
}

function findFirstLineContaining(source, needle) {
	const lines = source.split(/\r?\n/u);
	return lines.find((line) => line.includes(needle)) || null;
}

const ui5StartedAt = process.hrtime.bigint();
await runUi5([
	"build",
	"self-contained",
	"--all",
	"--config",
	path.join(spikeRoot, "ui5.yaml"),
	"--dest",
	ui5OutDir,
], {
	cwd: spikeRoot,
	stdio: "inherit",
	runtimeMode: "bun"
});
const ui5DurationMs = durationSince(ui5StartedAt);

const bunStartedAt = process.hrtime.bigint();
const bunBuildResult = await runBunBuild();
const bunDurationMs = durationSince(bunStartedAt);

const ui5IndexPath = path.join(ui5OutDir, "index.html");
const ui5BundlePath = path.join(ui5OutDir, "resources", "sap-ui-custom.js");
const bunIndexPath = path.join(bunOutDir, "index.html");

const ui5Index = await readFile(ui5IndexPath, "utf8");
const bunIndex = await readFile(bunIndexPath, "utf8");
const ui5BundleSize = await getFileSize(ui5BundlePath);

const bunOutputPaths = JSON.parse(bunBuildResult.stdout);
const bunScriptOutputPath = bunOutputPaths.find((targetPath) => targetPath.endsWith(".js"));
if (!bunScriptOutputPath) {
	throw new Error("Bun.build spike did not emit a JavaScript bundle");
}
const bunBundleSize = await getFileSize(bunScriptOutputPath);

const summary = {
	ui5: {
		durationMs: ui5DurationMs,
		indexPath: ui5IndexPath,
		bundlePath: ui5BundlePath,
		bundleSize: ui5BundleSize,
		bootstrapLine: findFirstLineContaining(ui5Index, "sap-ui-custom.js"),
	},
	bun: {
		durationMs: bunDurationMs,
		indexPath: bunIndexPath,
		bundlePath: bunScriptOutputPath,
		bundleSize: bunBundleSize,
		bootstrapLine: findFirstLineContaining(bunIndex, "<script"),
	},
	observation: "The Bun.build spike only demonstrates native HTML+ESM bundling on a dedicated app. It does not cover UI5 preload semantics, sap.ui.define resource graphs, or bootstrap rewriting beyond a plain module script.",
};

console.log("UI5 self-contained build:");
console.log(`- Duration: ${formatDuration(summary.ui5.durationMs)}`);
console.log(`- Bundle: ${summary.ui5.bundlePath}`);
console.log(`- Bundle size: ${summary.ui5.bundleSize} bytes`);
console.log(`- Bootstrap line: ${summary.ui5.bootstrapLine}`);
console.log("");
console.log("Bun.build spike:");
console.log(`- Duration: ${formatDuration(summary.bun.durationMs)}`);
console.log(`- Bundle: ${summary.bun.bundlePath}`);
console.log(`- Bundle size: ${summary.bun.bundleSize} bytes`);
console.log(`- Bootstrap line: ${summary.bun.bootstrapLine}`);
console.log(`- Output root: ${outputRoot}`);
console.log("");
console.log(`Observation: ${summary.observation}`);