import {spawn} from "node:child_process";
import {access, mkdir} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {getCertificatePaths} from "./local-forks.mjs";

async function exists(targetPath) {
	try {
		await access(targetPath);
		return true;
	} catch {
		return false;
	}
}

export async function ensureCertificates() {
	const {keyPath, certPath} = getCertificatePaths();
	await mkdir(path.dirname(keyPath), {recursive: true});

	if (await exists(keyPath) && await exists(certPath)) {
		return {keyPath, certPath, created: false};
	}

	await new Promise((resolve, reject) => {
		const child = spawn("openssl", [
			"req",
			"-x509",
			"-newkey",
			"rsa:2048",
			"-nodes",
			"-keyout",
			keyPath,
			"-out",
			certPath,
			"-days",
			"365",
			"-subj",
			"/CN=localhost"
		], {
			stdio: "inherit",
			cwd: path.dirname(keyPath),
			env: process.env
		});

		child.on("error", (error) => {
			if (error.code === "ENOENT") {
				reject(new Error("openssl is required to generate local test certificates."));
				return;
			}
			reject(error);
		});

		child.on("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`openssl terminated with signal ${signal}`));
				return;
			}
			if (code !== 0) {
				reject(new Error(`openssl exited with code ${code}`));
				return;
			}
			resolve();
		});
	});

	return {keyPath, certPath, created: true};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const result = await ensureCertificates();
	console.log(result.created ? "Created local test certificates." : "Reusing existing local test certificates.");
}
