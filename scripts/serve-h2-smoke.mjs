import http2 from "node:http2";
import {once} from "node:events";
import {getCertificatePaths, getSampleRoot, spawnUi5} from "./local-forks.mjs";
import {ensureCertificates} from "./ensure-certificates.mjs";

const sampleRoot = getSampleRoot();
const {keyPath, certPath} = getCertificatePaths();

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
			const match = stdout.match(/URL:\s+(https:\/\/localhost:(\d+))/);
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

async function fetchOverHttp2(origin) {
	const client = http2.connect(origin, {
		rejectUnauthorized: false
	});

	try {
		return await new Promise((resolve, reject) => {
			const request = client.request({
				[http2.constants.HTTP2_HEADER_METHOD]: http2.constants.HTTP2_METHOD_GET,
				[http2.constants.HTTP2_HEADER_PATH]: "/index.html"
			});

			let headers;
			let body = "";
			request.setEncoding("utf8");
			request.on("response", (responseHeaders) => {
				headers = responseHeaders;
			});
			request.on("data", (chunk) => {
				body += chunk;
			});
			request.on("end", () => {
				resolve({headers, body});
			});
			request.on("error", reject);
			request.end();
		});
	} finally {
		client.close();
	}
}

async function stopServer(child) {
	if (child.exitCode !== null || child.signalCode !== null) {
		return;
	}
	child.kill("SIGTERM");
	await once(child, "exit");
}

await ensureCertificates();

const child = await spawnUi5([
	"serve",
	"--h2",
	"--port",
	"30443",
	"--key",
	keyPath,
	"--cert",
	certPath
], {
	cwd: sampleRoot,
	stdio: ["ignore", "pipe", "pipe"]
});

try {
	const {url} = await waitForServerUrl(child);
	const {headers, body} = await fetchOverHttp2(url);

	if (headers["x-bun-validation-middleware"] !== "active") {
		throw new Error(`Expected x-bun-validation-middleware header, got ${JSON.stringify(headers)}`);
	}
	if (headers[http2.constants.HTTP2_HEADER_STATUS] !== 200) {
		throw new Error(`Expected HTTP 200, got ${headers[http2.constants.HTTP2_HEADER_STATUS]}`);
	}
	if (!body.includes("UI5 CLI on Bun")) {
		throw new Error("Expected validation app HTML response body was not returned.");
	}

	console.log("HTTP/2 smoke test passed.");
} finally {
	await stopServer(child);
}
