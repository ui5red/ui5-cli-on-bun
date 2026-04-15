import {readFile} from "node:fs/promises";
import path from "node:path";

const sampleRoot = path.resolve(import.meta.dirname, "..");
const envFilePath = path.join(sampleRoot, ".env.local");

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