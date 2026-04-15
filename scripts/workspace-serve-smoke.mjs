import {once} from "node:events";
import path from "node:path";
import {getSampleRoot, spawnUi5} from "./local-forks.mjs";

const sampleRoot = getSampleRoot();
const workspaceAppRoot = path.join(sampleRoot, "examples", "library-workspace", "app");
const expectedBody = "Library asset resolved through the forked UI5 CLI workspace graph.";

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
					stderr
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
	"30481"
], {
	cwd: workspaceAppRoot,
	stdio: ["ignore", "pipe", "pipe"]
});

try {
	const {url} = await waitForServerUrl(child);
	const response = await fetch(`${url}/resources/ui5bun/example/library/message.txt`);
	const body = await response.text();

	if (response.status !== 200) {
		throw new Error(`Expected HTTP 200, got ${response.status}`);
	}
	if (body.trim() !== expectedBody) {
		throw new Error(`Expected workspace library asset body ${JSON.stringify(expectedBody)}, got ${JSON.stringify(body.trim())}`);
	}

	console.log("Workspace serve smoke test passed.");
} finally {
	await stopServer(child);
}