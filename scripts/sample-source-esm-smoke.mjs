import {once} from "node:events";
import path from "node:path";
import {evaluateInHeadlessChrome} from "./chrome-devtools.mjs";
import {getSampleRoot, runUi5, spawnBun} from "./local-forks.mjs";

const sampleRoot = getSampleRoot();
const sampleAppRoot = path.join(sampleRoot, "examples", "sample.ts.app");
const staticServerRoot = path.join(sampleRoot, "esm-migration-poc", "ui5.v1.shopping.cart");
const staticServerScript = path.join(staticServerRoot, "serve.js");
const staticServerPort = 30482;
const sourceVariants = [
	{
		label: "source-root",
		url: `http://localhost:${staticServerPort}/esm-source-bridge-free/index-esm.html`,
	},
	{
		label: "release",
		url: `http://localhost:${staticServerPort}/dist-esm-source-release/index-esm.html`,
	},
];

const probeExpression = buildRenderedUi5ProbeExpression({
	expectedText: "Say Hello",
	timeoutMs: 30000,
});

function buildRenderedUi5ProbeExpression({expectedText, timeoutMs}) {
	return `(${probeRenderedUi5Page.toString()})(${JSON.stringify({expectedText, timeoutMs})})`;
}

async function probeRenderedUi5Page({expectedText, timeoutMs}) {
	const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	const start = Date.now();
	const normalizedExpectedText = String(expectedText).replace(/\s+/g, " ").trim().toLowerCase();

	function getErrorText() {
		return document.getElementById("esm-errors")?.textContent?.trim() ?? "";
	}

	function getUi5Controls() {
		const registry = globalThis.sap?.ui?.core?.Element?.registry;
		if (!registry) {
			return [];
		}

		if (typeof registry.forEach === "function") {
			const controls = [];
			registry.forEach((control) => controls.push(control));
			return controls;
		}

		const allControls = typeof registry.all === "function" ? registry.all() : registry.all;
		if (!allControls) {
			return [];
		}

		if (typeof allControls.values === "function") {
			return [...allControls.values()];
		}

		return Object.values(allControls);
	}

	function normalizeText(value) {
		return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
	}

	function isExpectedTextMatch(value) {
		return normalizeText(value).toLowerCase() === normalizedExpectedText;
	}

	function findRenderedButtonInDom() {
		const candidates = document.querySelectorAll("button, [role='button'], .sapMBtn, .sapMBtnInner");
		for (const element of candidates) {
			const text = normalizeText(element.textContent);
			if (isExpectedTextMatch(text)) {
				return {
					className: element.className || "",
					id: element.id || null,
					text,
				};
			}
		}

		return null;
	}

	function findRenderedButtonInUi5Controls() {
		for (const control of getUi5Controls()) {
			if (typeof control?.getText !== "function") {
				continue;
			}

			try {
				const text = normalizeText(control.getText());
				if (isExpectedTextMatch(text)) {
					return {
						id: typeof control.getId === "function" ? control.getId() : null,
						text,
						type: control.getMetadata?.().getName?.() ?? null,
					};
				}
			} catch {
				// Ignore controls that throw while reading getText during startup.
			}
		}

		return null;
	}

	function getDebugSnapshot() {
		return {
			bodyText: normalizeText(document.body.textContent).slice(0, 500),
			containerPresent: !!document.querySelector(".sapUiComponentContainer"),
			domButtons: [...document.querySelectorAll("button, [role='button'], .sapMBtn, .sapMBtnInner")]
				.slice(0, 10)
				.map((element) => ({
					id: element.id || null,
					text: normalizeText(element.textContent),
				})),
			ui5ControlTexts: getUi5Controls()
				.slice(0, 100)
				.flatMap((control) => {
					if (typeof control?.getText !== "function") {
						return [];
					}

					try {
						const text = normalizeText(control.getText());
						return text ? [{
							id: typeof control.getId === "function" ? control.getId() : null,
							text,
							type: control.getMetadata?.().getName?.() ?? null,
						}] : [];
					} catch {
						return [];
					}
				})
				.slice(0, 10),
		};
	}

	while (Date.now() - start < timeoutMs) {
		const errorText = getErrorText();
		if (errorText) {
			return {
				elapsedMs: Date.now() - start,
				errorText,
				ok: false,
				reason: "esm-errors",
			};
		}

		const container = document.querySelector(".sapUiComponentContainer");
		const domMatch = findRenderedButtonInDom();
		const controlMatch = findRenderedButtonInUi5Controls();

		if (container && (domMatch || controlMatch)) {
			return {
				containerId: container.id || null,
				controlMatch,
				domMatch,
				elapsedMs: Date.now() - start,
				ok: true,
			};
		}

		await wait(100);
	}

	return {
		...getDebugSnapshot(),
		elapsedMs: Date.now() - start,
		errorText: getErrorText(),
		ok: false,
		reason: "timeout",
	};
}

function waitForStaticServerUrl(child) {
	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error(`Timed out waiting for the static server to start.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
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
			const match = stdout.match(/http:\/\/localhost:(\d+)/);
			if (!match) {
				return;
			}

			cleanup();
			resolve({
				port: Number(match[1]),
				stderr,
				stdout,
			});
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
			reject(new Error(
				`Static server exited before becoming ready (code: ${code}, signal: ${signal}).\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
			));
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

function formatProbeFailure(label, result) {
	return [
		`${label} probe failed: ${result.reason}`,
		result.errorText ? `esm-errors: ${result.errorText}` : null,
		result.bodyText ? `bodyText: ${result.bodyText}` : null,
		result.domButtons?.length ? `domButtons: ${JSON.stringify(result.domButtons)}` : null,
		result.ui5ControlTexts?.length ? `ui5ControlTexts: ${JSON.stringify(result.ui5ControlTexts)}` : null,
	].filter(Boolean).join("\n");
}

await runUi5([
	"build",
	"experimental-source-esm",
	"--all",
	"--clean-dest",
], {
	cwd: sampleAppRoot,
	stdio: "inherit",
});

const server = await spawnBun([
	staticServerScript,
	"--dir",
	"../../examples/sample.ts.app",
	"--port",
	String(staticServerPort),
], {
	cwd: staticServerRoot,
	stdio: ["ignore", "pipe", "pipe"],
});

try {
	await waitForStaticServerUrl(server);

	for (const variant of sourceVariants) {
		const result = await evaluateInHeadlessChrome({
			expression: probeExpression,
			timeoutMs: 40000,
			url: variant.url,
		});

		if (!result?.ok) {
			throw new Error(formatProbeFailure(variant.label, result ?? {reason: "missing-result"}));
		}

		console.log(`${variant.label} sample source ESM smoke passed in ${result.elapsedMs} ms.`);
	}

	console.log("Sample source ESM smoke test passed.");
} finally {
	await stopServer(server);
}