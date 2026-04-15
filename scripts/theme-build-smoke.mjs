import {access, mkdtemp, readFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {getSampleRoot, runUi5} from "./local-forks.mjs";

const sampleRoot = getSampleRoot();
const fixtureRoot = path.join(sampleRoot, "test", "builder", "theme.heavy.library");
const destRoot = await mkdtemp(path.join(os.tmpdir(), "ui5-cli-on-bun-theme-smoke-"));
const destDir = path.join(destRoot, "dist");

const expectedFiles = [
	"resources/theme/heavy/library/themes/base/library.css",
	"resources/theme/heavy/library/themes/base/library-RTL.css",
	"resources/theme/heavy/library/themes/base/library-parameters.json",
	"resources/theme/heavy/library/themes/base/css_variables.css",
	"resources/theme/heavy/library/themes/base/css_variables.source.less",
	"resources/theme/heavy/library/themes/base/library_skeleton.css",
	"resources/theme/heavy/library/themes/ocean/library.css",
	"resources/theme/heavy/library/themes/contrast/library.css",
];

try {
	await runUi5([
		"build",
		"--all",
		"--dest",
		destDir,
		"--experimental-css-variables",
	], {
		cwd: fixtureRoot,
	});

	await Promise.all(expectedFiles.map(async (relativePath) => {
		await access(path.join(destDir, relativePath));
	}));

	const cssVariables = await readFile(
		path.join(destDir, "resources", "theme", "heavy", "library", "themes", "base", "css_variables.css"),
		"utf8"
	);
	const baseThemeCss = await readFile(
		path.join(destDir, "resources", "theme", "heavy", "library", "themes", "base", "library.css"),
		"utf8"
	);

	if (!cssVariables.trim()) {
		throw new Error("Expected non-empty css_variables.css output for the theme-heavy fixture.");
	}
	if (!baseThemeCss.includes(".themeHeavySurface")) {
		throw new Error("Expected compiled library.css output for the theme-heavy fixture was not produced.");
	}

	console.log("Theme build smoke test passed.");
} finally {
	await rm(destRoot, {recursive: true, force: true});
}