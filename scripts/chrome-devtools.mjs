import {spawn} from "node:child_process";
import {access, mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_CHROME_CANDIDATES = [
	process.env.UI5_CHROME_BINARY,
	process.env.CHROME_BINARY,
	process.env.GOOGLE_CHROME_BIN,
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);

export async function evaluateInHeadlessChrome({
	url,
	expression,
	timeoutMs = 30000,
}) {
	const chromeBinary = await resolveChromeBinary();
	const userDataDir = await mkdtemp(path.join(os.tmpdir(), "ui5-chrome-smoke-"));
	const chrome = spawn(chromeBinary, [
		"--headless=new",
		"--disable-gpu",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-background-networking",
		"--disable-default-apps",
		"--remote-debugging-port=0",
		`--user-data-dir=${userDataDir}`,
		"about:blank",
	], {
		stdio: ["ignore", "pipe", "pipe"],
	});

	try {
		const browserWsUrl = await waitForBrowserWebSocketUrl(chrome, timeoutMs);
		const browserPort = Number(new URL(browserWsUrl).port);
		const pageTarget = await waitForPageTarget(browserPort, timeoutMs);
		const cdp = await connectToDevTools(pageTarget.webSocketDebuggerUrl, timeoutMs);

		try {
			await cdp.send("Page.enable");
			await cdp.send("Runtime.enable");
			const loadEvent = cdp.waitForEvent("Page.loadEventFired", timeoutMs);
			await cdp.send("Page.navigate", {url});
			await loadEvent;

			const evaluation = await cdp.send("Runtime.evaluate", {
				awaitPromise: true,
				expression,
				returnByValue: true,
			});

			if (evaluation.exceptionDetails) {
				throw new Error(formatChromeException(evaluation.exceptionDetails));
			}

			return evaluation.result?.value;
		} finally {
			await cdp.close();
		}
	} finally {
		if (chrome.exitCode === null && chrome.signalCode === null) {
			chrome.kill("SIGTERM");
			await onceExit(chrome);
		}

		await rm(userDataDir, {force: true, recursive: true});
	}
}

async function resolveChromeBinary() {
	for (const candidate of DEFAULT_CHROME_CANDIDATES) {
		try {
			await access(candidate);
			return candidate;
		} catch {
			continue;
		}
	}

	throw new Error(
		"Google Chrome not found. Set UI5_CHROME_BINARY to an installed Chrome/Chromium executable path.",
	);
}

function waitForBrowserWebSocketUrl(child, timeoutMs) {
	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		const pattern = /DevTools listening on (ws:\/\/[^\s]+)/;
		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error(
				`Timed out waiting for Chrome DevTools endpoint.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
			));
		}, timeoutMs);

		const onStdout = (chunk) => {
			stdout += chunk.toString();
			matchEndpoint(stdout);
		};
		const onStderr = (chunk) => {
			stderr += chunk.toString();
			matchEndpoint(stderr);
		};
		const onError = (error) => {
			cleanup();
			reject(error);
		};
		const onExit = (code, signal) => {
			cleanup();
			reject(new Error(
				`Chrome exited before exposing DevTools (code: ${code}, signal: ${signal}).\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
			));
		};

		function matchEndpoint(text) {
			const match = text.match(pattern);
			if (!match) {
				return;
			}

			cleanup();
			resolve(match[1]);
		}

		function cleanup() {
			clearTimeout(timeout);
			child.stdout?.off("data", onStdout);
			child.stderr?.off("data", onStderr);
			child.off("error", onError);
			child.off("exit", onExit);
		}

		child.stdout?.on("data", onStdout);
		child.stderr?.on("data", onStderr);
		child.on("error", onError);
		child.on("exit", onExit);
	});
}

async function waitForPageTarget(browserPort, timeoutMs) {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		const response = await fetch(`http://127.0.0.1:${browserPort}/json/list`, {
			signal: AbortSignal.timeout(Math.min(2000, timeoutMs)),
		});
		const targets = await response.json();
		const pageTarget = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
		if (pageTarget) {
			return pageTarget;
		}

		await delay(50);
	}

	throw new Error(`Timed out waiting for a Chrome page target on DevTools port ${browserPort}`);
}

async function connectToDevTools(webSocketUrl, timeoutMs) {
	const socket = new WebSocket(webSocketUrl);
	const pendingRequests = new Map();
	const eventWaiters = new Map();
	let nextId = 0;

	await new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error(`Timed out connecting to Chrome DevTools target ${webSocketUrl}`));
		}, timeoutMs);

		socket.addEventListener("open", () => {
			clearTimeout(timeout);
			resolve();
		}, {once: true});
		socket.addEventListener("error", (event) => {
			clearTimeout(timeout);
			reject(event.error ?? new Error(`Failed to connect to Chrome DevTools target ${webSocketUrl}`));
		}, {once: true});
	});

	socket.addEventListener("message", (event) => {
		const payload = JSON.parse(typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8"));

		if (payload.id != null) {
			const request = pendingRequests.get(payload.id);
			if (!request) {
				return;
			}

			pendingRequests.delete(payload.id);
			if (payload.error) {
				request.reject(new Error(payload.error.message || JSON.stringify(payload.error)));
				return;
			}

			request.resolve(payload.result);
			return;
		}

		if (!payload.method) {
			return;
		}

		const waiters = eventWaiters.get(payload.method);
		if (!waiters?.length) {
			return;
		}

		eventWaiters.delete(payload.method);
		for (const waiter of waiters) {
			waiter(payload.params ?? {});
		}
	});

	return {
		send(method, params = {}) {
			const id = ++nextId;
			return new Promise((resolve, reject) => {
				pendingRequests.set(id, {reject, resolve});
				socket.send(JSON.stringify({id, method, params}));
			});
		},
		waitForEvent(method, timeoutMs) {
			return new Promise((resolve, reject) => {
				const timeout = setTimeout(() => {
					reject(new Error(`Timed out waiting for Chrome DevTools event ${method}`));
				}, timeoutMs);
				const resolveOnce = (params) => {
					clearTimeout(timeout);
					resolve(params);
				};

				const waiters = eventWaiters.get(method) ?? [];
				waiters.push(resolveOnce);
				eventWaiters.set(method, waiters);
			});
		},
		async close() {
			if (socket.readyState === WebSocket.OPEN) {
				socket.close();
			}
			await new Promise((resolve) => {
				if (socket.readyState === WebSocket.CLOSED) {
					resolve();
					return;
				}

				socket.addEventListener("close", () => resolve(), {once: true});
			});
		},
	};
}

function formatChromeException(exceptionDetails) {
	const description = exceptionDetails.exception?.description;
	const text = exceptionDetails.text;
	return [description, text].filter(Boolean).join("\n") || JSON.stringify(exceptionDetails);
}

function onceExit(child) {
	return new Promise((resolve) => {
		child.once("exit", () => resolve());
	});
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}