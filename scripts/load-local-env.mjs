import {spawn} from "node:child_process";
import {access, readFile, realpath, writeFile} from "node:fs/promises";
import path from "node:path";

export const sampleRoot = path.resolve(import.meta.dirname, "..");
export const envFilePath = path.join(sampleRoot, ".env.local");

async function pathExists(targetPath) {
	try {
		await access(targetPath);
		return true;
	} catch {
		return false;
	}
}

function captureCommandOutput(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ["ignore", "pipe", "pipe"]
		});

		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		child.on("error", reject);
		child.on("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`${command} terminated with signal ${signal}`));
				return;
			}
			if (code !== 0) {
				reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
				return;
			}
			resolve(stdout.trim());
		});
	});
}

async function resolveExecutablePath(command) {
	if (path.isAbsolute(command) || command.includes(path.sep)) {
		const resolvedPath = path.resolve(command);
		await access(resolvedPath);
		return realpath(resolvedPath).catch(() => resolvedPath);
	}

	const locatedPath = await captureCommandOutput("which", [command]);
	return realpath(locatedPath).catch(() => locatedPath);
}

function parseEnvLine(line) {
	const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
	if (!match) {
		return null;
	}

	let value = match[2];
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		value = value.slice(1, -1);
	}

	return {
		key: match[1],
		value,
	};
}

export async function ensureLocalBootstrapEnvFile() {
	if (process.env.BOOTSTRAP_BUN) {
		return {
			created: false,
			path: process.env.BOOTSTRAP_BUN,
			source: "environment"
		};
	}

	if (await pathExists(envFilePath)) {
		return {
			created: false,
			path: process.env.BOOTSTRAP_BUN,
			source: "env-file"
		};
	}

	const bootstrapBunPath = await resolveExecutablePath("bun");
	process.env.BOOTSTRAP_BUN = bootstrapBunPath;

	const fileText = [
		"# Local-only bootstrap Bun path for ui5-cli-on-bun",
		"# This file is gitignored and only affects this repository.",
		`BOOTSTRAP_BUN=${bootstrapBunPath}`,
		""
	].join("\n");

	await writeFile(envFilePath, fileText, "utf8");

	return {
		created: true,
		path: bootstrapBunPath,
		source: "generated"
	};
}

try {
	const envFile = await readFile(envFilePath, "utf8");
	for (const rawLine of envFile.split(/\r?\n/u)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}

		const parsed = parseEnvLine(rawLine);
		if (!parsed) {
			continue;
		}

		if (process.env[parsed.key] === undefined) {
			process.env[parsed.key] = parsed.value;
		}
	}
} catch (error) {
	if (error && error.code !== "ENOENT") {
		throw error;
	}
}