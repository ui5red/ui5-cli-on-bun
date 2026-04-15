import {spawn} from "node:child_process";
import {access} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {createQuietBunEnv} from "./fork-helpers.mjs";

const sampleRoot = path.resolve(import.meta.dirname, "..");

function resolveConfiguredPath(configuredPath, defaultPath) {
	return path.resolve(configuredPath || defaultPath);
}

async function assertPathExists(targetPath, description, hint) {
	try {
		await access(targetPath);
		return targetPath;
	} catch {
		throw new Error(`${description} not found at ${targetPath}. ${hint}`);
	}
}

export function getSampleRoot() {
	return sampleRoot;
}

export function getCliRepoDir() {
	return resolveConfiguredPath(process.env.UI5_CLI_REPO, path.join(sampleRoot, "..", "cli"));
}

export function getBunRepoDir() {
	return resolveConfiguredPath(process.env.BUN_REPO, path.join(sampleRoot, "..", "bun"));
}

export function getCertificatePaths() {
	return {
		keyPath: path.join(sampleRoot, "certs", "server.key"),
		certPath: path.join(sampleRoot, "certs", "server.crt")
	};
}

export async function getUi5CliEntry() {
	return assertPathExists(
		path.join(getCliRepoDir(), "packages", "cli", "bin", "ui5.cjs"),
		"UI5 CLI entrypoint",
		"Set UI5_CLI_REPO to the sibling UI5 CLI fork checkout."
	);
}

export async function findBunBinary() {
	const bunRepoDir = getBunRepoDir();
	const candidates = [
		process.env.BUN_FORK_BINARY,
		path.join(bunRepoDir, "build", "debug", "bun-debug"),
		path.join(bunRepoDir, "build", "release", "bun"),
		path.join(bunRepoDir, "build", "release-local", "bun"),
		path.join(bunRepoDir, "build", "debug-local", "bun-debug")
	].filter(Boolean);

	for (const candidate of candidates) {
		try {
			await access(candidate);
			return candidate;
		} catch {
			continue;
		}
	}

	throw new Error(
		"No Bun binary found. Build the sibling Bun fork or set BUN_FORK_BINARY to an explicit executable path."
	);
}

export async function spawnUi5(ui5Args, options = {}) {
	const bunBinary = await findBunBinary();
	const ui5CliEntry = await getUi5CliEntry();

	return spawn(bunBinary, [ui5CliEntry, ...ui5Args], {
		cwd: options.cwd || sampleRoot,
		env: createQuietBunEnv(options.env || process.env),
		stdio: options.stdio || "inherit",
		signal: options.signal
	});
}

export async function runUi5(ui5Args, options = {}) {
	const child = await spawnUi5(ui5Args, options);

	return new Promise((resolve, reject) => {
		child.on("error", reject);
		child.on("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`UI5 process terminated with signal ${signal}`));
				return;
			}
			if (code !== 0) {
				reject(new Error(`UI5 process exited with code ${code}`));
				return;
			}
			resolve(child);
		});
	});
}
