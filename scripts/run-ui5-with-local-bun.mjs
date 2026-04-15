import process from "node:process";
import {spawnUi5} from "./local-forks.mjs";

function parseArgs(argv) {
	const args = [...argv];
	let cwd = process.cwd();

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--cwd" || arg === "--project") {
			const targetCwd = args[index + 1];
			if (!targetCwd) {
				throw new Error(`Missing value for ${arg}`);
			}
			cwd = targetCwd;
			args.splice(index, 2);
			index -= 1;
			continue;
		}

		if (arg === "--help" || arg === "-h") {
			console.log("Usage: node ./scripts/run-ui5-with-local-bun.mjs [--cwd <project-dir>] <ui5-args...>");
			console.log("Example: npm run ui5 -- --cwd /path/to/project serve");
			process.exit(0);
		}
	}

	return {
		cwd,
		args,
	};
}

const {cwd, args} = parseArgs(process.argv.slice(2));

const child = await spawnUi5(args, {
	stdio: "inherit",
	cwd,
	env: process.env
});

child.on("error", (error) => {
	console.error(error.message);
	process.exit(1);
});

child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exit(code ?? 1);
});
