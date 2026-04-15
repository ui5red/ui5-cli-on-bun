import path from "node:path";
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

await ensureGitCheckout({
	name: "Bun fork",
	repoDir: bunRepoDir,
});
await ensureBunInstall({
	name: "Bun fork",
	repoDir: bunRepoDir,
});

console.log(`Building Bun fork in ${bunRepoDir}`);
await runCommand(getBootstrapBunCommand(), ["run", "bd"], {
	cwd: bunRepoDir,
	env: createQuietBunEnv(process.env),
	missingCommandMessage: getBootstrapBunMissingMessage(),
});

const builtBinary = path.join(bunRepoDir, "build", "debug", "bun-debug");
if (!(await pathExists(builtBinary))) {
	throw new Error(`Expected Bun debug binary was not created at ${builtBinary}`);
}

console.log(`Built Bun debug binary at ${builtBinary}`);