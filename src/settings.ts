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
		new Setting(containerEl).setName("Connection").setHeading();

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
		new Setting(containerEl).setName("Data").setHeading();

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

		// Sync section
		new Setting(containerEl).setName("Sync").setHeading();

		new Setting(containerEl)
			.setName("Sync interval")
			.setDesc("How often to automatically sync with OmniFocus.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("manual", "Manual")
					.addOption("1", "Every 1 minute")
					.addOption("5", "Every 5 minutes")
					.addOption("15", "Every 15 minutes")
					.addOption("30", "Every 30 minutes")
					.setValue(this.plugin.settings.syncInterval)
					.onChange(async (value) => {
						this.plugin.settings.syncInterval = value as "manual" | "1" | "5" | "15" | "30";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Sync on startup")
			.setDesc("Automatically sync when Obsidian starts.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.syncOnStartup).onChange(async (value) => {
					this.plugin.settings.syncOnStartup = value;
					await this.plugin.saveSettings();
				})
			);

		// Rendering section
		new Setting(containerEl).setName("Rendering").setHeading();

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
		new Setting(containerEl).setName("Actions").setHeading();

		new Setting(containerEl)
			.setName("Sync now")
			.setDesc("Pull latest data from OmniFocus.")
			.addButton((btn) =>
				btn
					.setButtonText("Sync now")
					.setCta()
					.onClick(() => {
						this.plugin.syncNow();
					})
			);
	}
}
