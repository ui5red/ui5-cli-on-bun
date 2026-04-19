/**
 * Simple static file server for testing UI5 builds.
 * Usage: bun run serve.js [--dir <directory>] [--port <port>]
 */

import path from "node:path";

const args = process.argv.slice(2);
let dir = "dist";
let port = 8080;

for (let i = 0; i < args.length; i++) {
	if (args[i] === "--dir" && args[i + 1]) {
		dir = args[++i];
	} else if (args[i] === "--port" && args[i + 1]) {
		port = parseInt(args[++i], 10);
	}
}

// Resolve to absolute path relative to this script's directory
const baseDir = path.resolve(import.meta.dirname, dir);

const server = Bun.serve({
	port,
	async fetch(req) {
		const url = new URL(req.url);
		let pathname = url.pathname;

		// Default to index.html
		if (pathname === "/") {
			pathname = "/index.html";
		}

		const filePath = path.join(baseDir, pathname);

		// Prevent directory traversal
		if (!filePath.startsWith(baseDir)) {
			return new Response("Forbidden", { status: 403 });
		}

		const file = Bun.file(filePath);

		if (await file.exists()) {
			return new Response(file);
		}

		return new Response("Not Found", { status: 404 });
	},
});

console.log(`Serving '${baseDir}' at http://localhost:${server.port}`);
