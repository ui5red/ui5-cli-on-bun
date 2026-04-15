import {getBunRepoDir, getCliRepoDir, getSampleRoot} from "./local-forks.mjs";
import {ensureBunInstall, ensureClone, ensureNpmInstall} from "./fork-helpers.mjs";

const sampleRoot = getSampleRoot();
const bunRepoDir = getBunRepoDir();
const cliRepoDir = getCliRepoDir();

const bunRepoUrl = process.env.BUN_GIT_URL || "https://github.com/ui5red/bun.git";
const cliRepoUrl = process.env.UI5_CLI_GIT_URL || "https://github.com/ui5red/cli.git";

console.log(`Sample repo: ${sampleRoot}`);
await ensureClone({
	name: "Bun fork",
	repoDir: bunRepoDir,
	repoUrl: bunRepoUrl
});
await ensureClone({
	name: "UI5 CLI fork",
	repoDir: cliRepoDir,
	repoUrl: cliRepoUrl
});
await ensureBunInstall({
	name: "Bun fork",
	repoDir: bunRepoDir,
});
await ensureNpmInstall({
	name: "UI5 CLI fork",
	repoDir: cliRepoDir,
});

console.log("Fork bootstrap completed.");