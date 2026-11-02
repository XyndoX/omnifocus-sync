// src/settings.ts
import { Notice, PluginSettingTab } from "obsidian";
import type { App, SettingDefinitionItem } from "obsidian";
import type OmniFocusBridgePlugin from "./main";
import type { PluginSettings } from "./types";
import { isOmniFocusAvailable } from "./bridge/jxa-runner";

const required = (value: string) => (value.trim() ? undefined : "This field is required.");

export class OmniFocusBridgeSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: OmniFocusBridgePlugin
	) {
		super(app, plugin);
	}

	override getSettingDefinitions(): SettingDefinitionItem<keyof PluginSettings>[] {
		return [
			{
				type: "group",
				heading: "Connection",
				items: [
					{
						name: "Test connection",
						desc: "Verify that OmniFocus is running and accessible.",
						render: (setting) => {
							setting.addButton((btn) =>
								btn.setButtonText("Test").onClick(async () => {
									btn.setDisabled(true);
									btn.setButtonText("Testing...");
									const ok = await isOmniFocusAvailable();
									new Notice(
										ok
											? "Connected to OmniFocus successfully!"
											: "Could not connect to OmniFocus. Is it running?"
									);
									btn.setDisabled(false);
									btn.setButtonText("Test");
								})
							);
						},
					},
				],
			},
			{
				type: "group",
				heading: "Data",
				items: [
					{
						name: "Sync folder",
						desc: "Vault folder where OmniFocus data is stored.",
						control: { type: "text", key: "syncFolderPath", placeholder: "OmniFocus", validate: required },
					},
					{
						name: "Tag prefix",
						desc: "Prefix for OmniFocus tags (e.g. #of/TagName).",
						control: { type: "text", key: "tagPrefix", placeholder: "of", validate: required },
					},
				],
			},
			{
				type: "group",
				heading: "Sync",
				items: [
					{
						name: "Sync interval",
						desc: "How often to automatically sync with OmniFocus.",
						control: {
							type: "dropdown",
							key: "syncInterval",
							options: {
								manual: "Manual",
								"1": "Every 1 minute",
								"5": "Every 5 minutes",
								"15": "Every 15 minutes",
								"30": "Every 30 minutes",
							},
						},
					},
					{
						name: "Sync on startup",
						desc: "Automatically sync when Obsidian starts.",
						control: { type: "toggle", key: "syncOnStartup" },
					},
				],
			},
			{
				type: "group",
				heading: "Rendering",
				items: [
					{ name: "Show due date", control: { type: "toggle", key: "showDueDate" } },
					{ name: "Show tags", control: { type: "toggle", key: "showTags" } },
					{ name: "Show time estimate", control: { type: "toggle", key: "showEstimate" } },
					{
						name: "Show OmniFocus link",
						desc: "Add deep link to each task (opens task in OmniFocus).",
						control: { type: "toggle", key: "showOFLink" },
					},
				],
			},
			{
				type: "group",
				heading: "Actions",
				items: [
					{
						name: "Sync now",
						desc: "Pull latest data from OmniFocus.",
						render: (setting) => {
							setting.addButton((btn) =>
								btn
									.setButtonText("Sync now")
									.setCta()
									.onClick(() => void this.plugin.syncNow())
							);
						},
					},
				],
			},
		];
	}

	override getControlValue(key: keyof PluginSettings): unknown {
		return this.plugin.settings[key];
	}

	// saveSettings also restarts the scheduler, which the default persistence would skip.
	override async setControlValue(key: keyof PluginSettings, value: unknown): Promise<void> {
		Object.assign(this.plugin.settings, { [key]: value });
		await this.plugin.saveSettings();
	}
}
