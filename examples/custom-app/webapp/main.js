(function() {
	async function showMiddlewareHeader() {
		const response = await fetch("./index.html", {cache: "no-store"});
		const value = response.headers.get("X-Bun-Validation-Middleware") || "missing";
		const target = document.querySelector("[data-middleware]");
		if (target) {
			target.textContent = value;
		}
	}

	showMiddlewareHeader().catch((error) => {
		const target = document.querySelector("[data-middleware]");
		if (target) {
			target.textContent = `error: ${error.message}`;
		}
	});
})();