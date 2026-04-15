import {once} from "node:events";
import {getSampleRoot, spawnUi5} from "./local-forks.mjs";

const sampleRoot = getSampleRoot();

function waitForServerUrl(child) {
	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";

		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error(`Timed out waiting for the UI5 server to start.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
		}, 20000);

		function cleanup() {
			clearTimeout(timeout);
			child.stdout?.off("data", onStdout);
			child.stderr?.off("data", onStderr);
			child.off("error", onError);
			child.off("exit", onExit);
		}

		function onStdout(chunk) {
			stdout += chunk.toString();
			const match = stdout.match(/URL:\s+(http:\/\/localhost:(\d+))/);
			if (match) {
				cleanup();
				resolve({
					url: match[1],
					port: Number(match[2]),
					stdout,
					stderr,
				});
			}
		}

		function onStderr(chunk) {
			stderr += chunk.toString();
		}

		function onError(error) {
			cleanup();
			reject(error);
		}

		function onExit(code, signal) {
			cleanup();
			reject(new Error(`UI5 server exited before becoming ready (code: ${code}, signal: ${signal}).\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
		}

		child.stdout?.on("data", onStdout);
		child.stderr?.on("data", onStderr);
		child.on("error", onError);
		child.on("exit", onExit);
	});
}

async function stopServer(child) {
	if (child.exitCode !== null || child.signalCode !== null) {
		return;
	}
	child.kill("SIGTERM");
	await once(child, "exit");
}

const child = await spawnUi5([
	"serve",
	"--port",
	"30480",
], {
	cwd: sampleRoot,
	stdio: ["ignore", "pipe", "pipe"],
});

try {
	const {url} = await waitForServerUrl(child);
	const response = await fetch(`${url}/index.html`, {
		signal: AbortSignal.timeout(10000),
	});

	if (response.headers.get("x-bun-validation-middleware") !== "active") {
		throw new Error(`Expected x-bun-validation-middleware header, got ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);
	}
	if (!response.ok) {
		throw new Error(`Expected HTTP 200, got ${response.status}`);
	}

	const body = await response.text();
	if (!body.includes("UI5 CLI on Bun")) {
		throw new Error("Expected validation app HTML response body was not returned.");
	}

	console.log("Native Bun serve smoke test passed.");
} finally {
	await stopServer(child);
}