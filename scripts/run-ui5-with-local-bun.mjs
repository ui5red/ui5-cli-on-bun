import process from "node:process";
import {spawnUi5} from "./local-forks.mjs";

const child = await spawnUi5(process.argv.slice(2), {
	stdio: "inherit",
	cwd: process.cwd(),
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
