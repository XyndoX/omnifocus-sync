// src/settings.ts
import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type OmniFocusBridgePlugin from "./main";
import { isOmniFocusAvailable } from "./bridge/jxa-runner";

export class OmniFocusBridgeSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: OmniFocusBridgePlugin
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Connection section
		containerEl.createEl("h3", { text: "Connection" });

		new Setting(containerEl)
			.setName("Test Connection")
			.setDesc("Verify that OmniFocus is running and accessible.")
			.addButton((btn) =>
				btn.setButtonText("Test").onClick(async () => {
					btn.setDisabled(true);
					btn.setButtonText("Testing...");
					const ok = await isOmniFocusAvailable();
					if (ok) {
						new Notice("Connected to OmniFocus successfully!");
					} else {
						new Notice("Could not connect to OmniFocus. Is it running?");
					}
					btn.setDisabled(false);
					btn.setButtonText("Test");
				})
			);

		// Data section
		containerEl.createEl("h3", { text: "Data" });

		new Setting(containerEl)
			.setName("Sync folder")
			.setDesc("Vault folder where OmniFocus data is stored.")
			.addText((text) =>
				text
					.setPlaceholder("OmniFocus")
					.setValue(this.plugin.settings.syncFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.syncFolderPath = value || "OmniFocus";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Tag prefix")
			.setDesc("Prefix for OmniFocus tags (e.g. #of/TagName).")
			.addText((text) =>
				text
					.setPlaceholder("of")
					.setValue(this.plugin.settings.tagPrefix)
					.onChange(async (value) => {
						this.plugin.settings.tagPrefix = value || "of";
						await this.plugin.saveSettings();
					})
			);

		// Rendering section
		containerEl.createEl("h3", { text: "Rendering" });

		new Setting(containerEl)
			.setName("Show due date")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showDueDate).onChange(async (value) => {
					this.plugin.settings.showDueDate = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Show tags")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showTags).onChange(async (value) => {
					this.plugin.settings.showTags = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Show time estimate")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showEstimate).onChange(async (value) => {
					this.plugin.settings.showEstimate = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Show OmniFocus link")
			.setDesc("Add deep link to each task (opens task in OmniFocus).")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showOFLink).onChange(async (value) => {
					this.plugin.settings.showOFLink = value;
					await this.plugin.saveSettings();
				})
			);

		// Actions section
		containerEl.createEl("h3", { text: "Actions" });

		new Setting(containerEl)
			.setName("Sync now")
			.setDesc("Pull latest data from OmniFocus.")
			.addButton((btn) =>
				btn
					.setButtonText("Sync Now")
					.setCta()
					.onClick(() => {
						this.plugin.syncNow();
					})
			);
	}
}
