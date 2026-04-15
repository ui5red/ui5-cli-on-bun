import {spawn} from "node:child_process";
import {access} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {getBunRepoDir, getCliRepoDir, getSampleRoot} from "./local-forks.mjs";

function run(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: "inherit",
			cwd: options.cwd || process.cwd(),
			env: options.env || process.env,
		});

		child.on("error", reject);
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

async function exists(targetPath) {
	try {
		await access(targetPath);
		return true;
	} catch {
		return false;
	}
}

async function ensureClone({name, repoDir, repoUrl}) {
	const gitDir = path.join(repoDir, ".git");
	if (await exists(gitDir)) {
		console.log(`Reusing existing ${name} checkout at ${repoDir}`);
		return;
	}

	if (await exists(repoDir)) {
		throw new Error(`${name} target path already exists but is not a git checkout: ${repoDir}`);
	}

	console.log(`Cloning ${name} from ${repoUrl} into ${repoDir}`);
	await run("git", ["clone", repoUrl, repoDir], {
		cwd: path.dirname(repoDir)
	});
}

const sampleRoot = getSampleRoot();
const bunRepoDir = getBunRepoDir();
const cliRepoDir = getCliRepoDir();

const bunRepoUrl = process.env.BUN_GIT_URL || "https://github.com/ui5red/bun.git";
const cliRepoUrl = process.env.UI5_CLI_GIT_URL || "https://github.com/ui5red/cli.git";

console.log(`Sample repo: ${sampleRoot}`);
await ensureClone({
	name: "Bun fork",
	repoDir: bunRepoDir,
	repoUrl: bunRepoUrl
});
await ensureClone({
	name: "UI5 CLI fork",
	repoDir: cliRepoDir,
	repoUrl: cliRepoUrl
});

console.log("Fork bootstrap completed.");