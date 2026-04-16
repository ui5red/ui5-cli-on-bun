import {renderMessage} from "./message.js";

const root = document.getElementById("app");

if (!root) {
	throw new Error("App root not found");
}

root.textContent = renderMessage();