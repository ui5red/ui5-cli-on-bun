import "./load-local-env.mjs";
import {spawn} from "node:child_process";
import {access} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export async function pathExists(targetPath) {
	try {
		await access(targetPath);
		return true;
	} catch {
		return false;
	}
}

export function createQuietBunEnv(baseEnv = process.env) {
	const env = {...baseEnv};

	for (const key of Object.keys(env)) {
		if (key === "BUN_DEBUG" || key.startsWith("BUN_DEBUG_")) {
			delete env[key];
		}
	}

	env.BUN_DEBUG_QUIET_LOGS = "1";
	return env;
}

export function getBootstrapBunCommand() {
	return process.env.BOOTSTRAP_BUN || "bun";
}

export function getBootstrapBunMissingMessage() {
	return "A Bun executable is required to bootstrap the custom Bun fork. " +
		"Install Bun and make sure `bun` is on PATH, or set BOOTSTRAP_BUN to an explicit executable path.";
}

export function runCommand(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: options.stdio || "inherit",
			cwd: options.cwd || process.cwd(),
			env: options.env || process.env,
		});

		child.on("error", (error) => {
			if (error.code === "ENOENT" && options.missingCommandMessage) {
				reject(new Error(options.missingCommandMessage));
				return;
			}
			reject(error);
		});

		child.on("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`${command} terminated with signal ${signal}`));
				return;
			}
			if (code !== 0) {
				reject(new Error(`${command} exited with code ${code}`));
				return;
			}
			resolve();
		});
	});
}

export async function ensureClone({name, repoDir, repoUrl}) {
	const gitDir = path.join(repoDir, ".git");
	if (await pathExists(gitDir)) {
		console.log(`Reusing existing ${name} checkout at ${repoDir}`);
		return;
	}

	if (await pathExists(repoDir)) {
		throw new Error(`${name} target path already exists but is not a git checkout: ${repoDir}`);
	}

	console.log(`Cloning ${name} from ${repoUrl} into ${repoDir}`);
	await runCommand("git", ["clone", repoUrl, repoDir], {
		cwd: path.dirname(repoDir)
	});
}

export async function ensureGitCheckout({name, repoDir}) {
	if (await pathExists(path.join(repoDir, ".git"))) {
		return;
	}

	throw new Error(`${name} checkout not found at ${repoDir}. Run \`npm run setup:forks\` first.`);
}

export async function ensureNpmInstall({name, repoDir}) {
	if (await pathExists(path.join(repoDir, "node_modules"))) {
		console.log(`Reusing existing ${name} npm dependencies at ${repoDir}`);
		return;
	}

	console.log(`Installing ${name} npm dependencies in ${repoDir}`);
	await runCommand("npm", ["install"], {
		cwd: repoDir
	});
}

export async function ensureBunInstall({name, repoDir}) {
	if (await pathExists(path.join(repoDir, "node_modules"))) {
		console.log(`Reusing existing ${name} Bun dependencies at ${repoDir}`);
		return;
	}

	console.log(`Installing ${name} Bun dependencies in ${repoDir}`);
	await runCommand(getBootstrapBunCommand(), ["install"], {
		cwd: repoDir,
		env: createQuietBunEnv(process.env),
		missingCommandMessage: getBootstrapBunMissingMessage(),
	});
}