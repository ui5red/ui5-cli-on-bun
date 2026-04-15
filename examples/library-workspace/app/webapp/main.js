(function() {
	async function showLibraryAsset() {
		const response = await fetch("/resources/ui5bun/example/library/message.txt", {cache: "no-store"});
		const text = (await response.text()).trim();
		const target = document.querySelector("[data-library]");
		if (target) {
			target.textContent = text;
		}
	}

	showLibraryAsset().catch((error) => {
		const target = document.querySelector("[data-library]");
		if (target) {
			target.textContent = `error: ${error.message}`;
		}
	});
})();