import { Plugin } from "obsidian";

export default class OmniFocusBridgePlugin extends Plugin {
	async onload() {
		console.log("OmniFocus Bridge loaded");
	}

	onunload() {
		console.log("OmniFocus Bridge unloaded");
	}
}
