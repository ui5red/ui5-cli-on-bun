import path from "node:path";
import process from "node:process";
import {getBunRepoDir} from "./local-forks.mjs";
import {
	createQuietBunEnv,
	ensureBunInstall,
	ensureGitCheckout,
	getBootstrapBunCommand,
	getBootstrapBunMissingMessage,
	pathExists,
	runCommand,
} from "./fork-helpers.mjs";

const bunRepoDir = getBunRepoDir();
const profileArg = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--")) || "release";
const cleanBuild = process.argv.includes("--clean");

const buildProfiles = {
	release: {
		script: "build:release",
		binary: path.join(bunRepoDir, "build", "release", "bun"),
		label: "release",
	},
	debug: {
		script: "bd",
		binary: path.join(bunRepoDir, "build", "debug", "bun-debug"),
		label: "debug",
	},
	"release-local": {
		script: "build:release:local",
		binary: path.join(bunRepoDir, "build", "release-local", "bun"),
		label: "release-local",
	},
	"debug-local": {
		script: "build:local",
		binary: path.join(bunRepoDir, "build", "debug-local", "bun-debug"),
		label: "debug-local",
	},
};

const buildProfile = buildProfiles[profileArg];

if (!buildProfile) {
	throw new Error(
		`Unknown Bun build profile \"${profileArg}\". Supported profiles: ${Object.keys(buildProfiles).join(", ")}`
	);
}

await ensureGitCheckout({
	name: "Bun fork",
	repoDir: bunRepoDir,
});
await ensureBunInstall({
	name: "Bun fork",
	repoDir: bunRepoDir,
});

if (cleanBuild) {
	console.log(`Cleaning Bun fork build outputs in ${bunRepoDir}`);
	await runCommand(getBootstrapBunCommand(), ["run", "clean"], {
		cwd: bunRepoDir,
		env: createQuietBunEnv(process.env),
		missingCommandMessage: getBootstrapBunMissingMessage(),
	});
}

console.log(`Building Bun fork (${buildProfile.label}) in ${bunRepoDir}`);
await runCommand(getBootstrapBunCommand(), ["run", buildProfile.script], {
	cwd: bunRepoDir,
	env: createQuietBunEnv(process.env),
	missingCommandMessage: getBootstrapBunMissingMessage(),
});

const builtBinary = buildProfile.binary;
if (!(await pathExists(builtBinary))) {
	throw new Error(`Expected Bun ${buildProfile.label} binary was not created at ${builtBinary}`);
}

console.log(`Built Bun ${buildProfile.label} binary at ${builtBinary}`);