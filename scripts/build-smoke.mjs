import {access, readFile, rm} from "node:fs/promises";
import path from "node:path";
import {getSampleRoot, runUi5} from "./local-forks.mjs";

const sampleRoot = getSampleRoot();
const distDir = path.join(sampleRoot, "dist");
const markerPath = path.join(distDir, "custom-task-marker.txt");
const indexPath = path.join(distDir, "index.html");

await rm(distDir, {recursive: true, force: true});
await runUi5(["build", "--all", "--dest", distDir], {
	cwd: sampleRoot,
	stdio: "inherit"
});

await access(indexPath);
const markerContent = await readFile(markerPath, "utf8");
if (markerContent.trim() !== "ui5-cli-on-bun-task") {
	throw new Error(`Unexpected custom task marker content: ${JSON.stringify(markerContent)}`);
}

console.log("Build smoke test passed.");
