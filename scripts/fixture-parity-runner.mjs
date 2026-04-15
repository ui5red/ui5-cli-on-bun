import assert from "node:assert/strict";
import {Buffer} from "node:buffer";
import {mkdtemp, cp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {promisify} from "node:util";
import {pathToFileURL} from "node:url";

const [, , scenario, sampleRootArg, cliRepoDirArg] = process.argv;

if (!scenario || !sampleRootArg || !cliRepoDirArg) {
	throw new Error("Usage: fixture-parity-runner.mjs <scenario> <sampleRoot> <cliRepoDir>");
}

const sampleRoot = path.resolve(sampleRootArg);
const cliRepoDir = path.resolve(cliRepoDirArg);

function toModuleUrl(filePath) {
	return pathToFileURL(filePath).href;
}

async function importCliModule(relativePath) {
	return import(toModuleUrl(path.join(cliRepoDir, relativePath)));
}

function getPaths(resources) {
	return resources.map((resource) => resource.getPath()).sort();
}

function assertResourceSet(resources, expectedPaths) {
	assert.deepStrictEqual(getPaths(resources), [...expectedPaths].sort());
}

async function runCliInitApplication() {
	const {default: init} = await importCliModule("packages/cli/lib/init/init.js");
	const config = await init({
		cwd: path.join(sampleRoot, "test", "cli", "init.application")
	});

	assert.deepStrictEqual(config, {
		specVersion: "5.0",
		type: "application",
		metadata: {
			name: "init-application"
		}
	});
}

async function runFsInterfaceParity() {
	const {default: fsInterface} = await importCliModule("packages/fs/lib/fsInterface.js");
	const {default: FsAdapter} = await importCliModule("packages/fs/lib/adapters/FileSystem.js");

	const adapter = new FsAdapter({
		virBasePath: "/",
		fsBasePath: path.join(sampleRoot, "test", "fs", "fsInterfáce")
	});
	const fs = fsInterface(adapter);
	const readFileCallback = promisify(fs.readFile);
	const statCallback = promisify(fs.stat);

	const content = await readFileCallback(path.join("/", "bâr.txt"), "utf8");
	assert.equal(content, "content");

	const stats = await statCallback(path.join("/", "foo.txt"));
	assert.equal(stats.isFile(), true);
	assert.equal(stats.isDirectory(), false);
	assert.equal(stats.isBlockDevice(), false);
	assert.equal(stats.isCharacterDevice(), false);
	assert.equal(stats.isSymbolicLink(), false);
	assert.equal(stats.isFIFO(), false);
	assert.equal(stats.isSocket(), false);
}

async function withTempFsGlobFixture(callback) {
	const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "ui5-cli-on-bun-fs-glob-"));
	const globRoot = path.join(tmpRoot, "glob");

	try {
		await cp(path.join(sampleRoot, "test", "fs", "glob.application.a"), path.join(globRoot, "application.a"), {
			recursive: true
		});
		await cp(path.join(sampleRoot, "test", "fs", "glob.application.b"), path.join(globRoot, "application.b"), {
			recursive: true
		});
		await writeFile(path.join(globRoot, "package.json"), "");

		return await callback(globRoot);
	} finally {
		await rm(tmpRoot, {recursive: true, force: true});
	}
}

async function runFsGlobParity() {
	const {default: FsAdapter} = await importCliModule("packages/fs/lib/adapters/FileSystem.js");

	await withTempFsGlobFixture(async (globRoot) => {
		const adapter = new FsAdapter({
			fsBasePath: globRoot,
			virBasePath: "/test-resources/"
		});

		let resources = await adapter.byGlob("/**/*.*");
		assert.equal(resources.length, 16);

		resources = await adapter.byGlob("/*/*.*");
		assertResourceSet(resources, ["/test-resources/package.json"]);

		resources = await adapter.byGlob(["/**/*.yaml", "/test-resources/**/i18n_de.properties"]);
		assertResourceSet(resources, [
			"/test-resources/application.a/ui5.yaml",
			"/test-resources/application.b/ui5.yaml",
			"/test-resources/application.b/webapp/embedded/i18n/i18n_de.properties",
			"/test-resources/application.b/webapp/i18n/i18n_de.properties",
		]);

		resources = await adapter.byGlob([
			"/**/*.json",
			"!/**/*package.json",
			"!/**/embedded/manifest.json"
		]);
		assertResourceSet(resources, ["/test-resources/application.b/webapp/manifest.json"]);
	});
}

async function runFsAdapterParity() {
	const {
		createAdapter,
		createFilterReader,
		createFlatReader,
		createLinkReader,
	} = await importCliModule("packages/fs/lib/resourceFactory.js");

	const applicationAWebapp = path.join(sampleRoot, "test", "fs", "application.a", "webapp");
	const applicationBWebapp = path.join(sampleRoot, "test", "fs", "application.b", "webapp");
	const libraryLRoot = path.join(sampleRoot, "test", "fs", "library.l");

	let reader = createAdapter({
		fsBasePath: applicationAWebapp,
		virBasePath: "/app/"
	});
	let resources = await reader.byGlob("/app/**/*.html");
	assert.equal(resources.length, 1);

	reader = createAdapter({
		fsBasePath: applicationAWebapp,
		virBasePath: "/resources/app/"
	});
	const resource = await reader.byPath("/resources/app/index.html", {nodir: true});
	assert.ok(resource);
	assert.equal(await resource.getString(), await readFile(path.join(applicationAWebapp, "index.html"), "utf8"));

	const filteredReader = createFilterReader({
		reader,
		callback: (entry) => entry.getPath().endsWith(".js")
	});
	resources = await filteredReader.byGlob("**");
	assert.equal(resources.length, 1);
	assert.equal(resources[0].getPath(), "/resources/app/test.js");

	const flatReader = createFlatReader({
		reader,
		namespace: "app"
	});
	resources = await flatReader.byGlob("**/*.js");
	assert.equal(resources.length, 1);
	assert.equal(resources[0].getPath(), "/test.js");

	const linkReader = createLinkReader({
		reader,
		pathMapping: {
			linkPath: "/wow/this/is/a/beautiful/path/just/wow/",
			targetPath: "/resources/"
		}
	});
	resources = await linkReader.byGlob("**/*.js");
	assert.equal(resources.length, 1);
	assert.equal(resources[0].getPath(), "/wow/this/is/a/beautiful/path/just/wow/app/test.js");

	const excludedReader = createAdapter({
		fsBasePath: applicationBWebapp,
		virBasePath: "/resources/app/",
		excludes: [
			"!/resources/app/i18n/**",
			"/resources/app/**",
			"!/resources/app/manifest.json"
		]
	});
	const [manifest, i18n, i18nNested] = await Promise.all([
		excludedReader.byPath("/resources/app/manifest.json", {nodir: true}),
		excludedReader.byPath("/resources/app/i18n.properties", {nodir: true}),
		excludedReader.byPath("/resources/app/i18n/i18n.properties", {nodir: true})
	]);
	assert.ok(manifest);
	assert.equal(i18n, null);
	assert.equal(i18nNested, null);

	const libraryReader = createAdapter({
		fsBasePath: libraryLRoot,
		virBasePath: "/"
	});
	await assert.rejects(
		libraryReader.byGlob("/test/library/l/Test.html/*", {nodir: true}),
		/ENOTDIR/
	);
}

async function runProjectWorkspaceParity() {
	const {default: Workspace} = await importCliModule("packages/project/lib/graph/Workspace.js");
	const projectRoot = path.join(sampleRoot, "test", "project");

	let workspace = new Workspace({
		cwd: projectRoot,
		configuration: {
			specVersion: "workspace/1.0",
			metadata: {
				name: "workspace-name"
			},
			dependencyManagement: {
				resolutions: [{
					path: "collection"
				}]
			}
		}
	});

	let modules = await workspace.getModules();
	assert.deepStrictEqual(modules.map((module) => module.getId()), ["library.a", "library.b", "library.c"]);
	assert.equal((await workspace.getModuleByProjectName("library.a")).getPath(), path.join(projectRoot, "collection", "library.a"));
	assert.equal((await workspace.getModuleByNodeId("library.c")).getPath(), path.join(projectRoot, "collection", "library.c"));

	workspace = new Workspace({
		cwd: projectRoot,
		configuration: {
			specVersion: "workspace/1.0",
			metadata: {
				name: "workspace-name"
			},
			dependencyManagement: {
				resolutions: [{
					path: "collection.b"
				}]
			}
		}
	});

	modules = await workspace.getModules();
	assert.deepStrictEqual(modules.map((module) => module.getId()), ["library.a", "library.b", "library.c", "library.d"]);
	assert.equal((await workspace.getModuleByProjectName("library.d")).getPath(), path.join(projectRoot, "library.d"));
	assert.equal((await workspace.getModuleByNodeId("library.b")).getPath(), path.join(projectRoot, "collection.b", "library.b"));
}

const scenarioHandlers = {
	"cli-init-application": runCliInitApplication,
	"fs-interface": runFsInterfaceParity,
	"fs-glob": runFsGlobParity,
	"fs-adapter": runFsAdapterParity,
	"project-workspace": runProjectWorkspaceParity,
};

const scenarioHandler = scenarioHandlers[scenario];

if (!scenarioHandler) {
	throw new Error(`Unknown parity scenario: ${scenario}`);
}

await scenarioHandler();