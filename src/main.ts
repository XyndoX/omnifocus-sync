// src/main.ts
import { Plugin, Notice } from "obsidian";
import type { PluginSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { OmniFocusBridgeSettingTab } from "./settings";
import { SyncEngine } from "./sync/sync-engine";
import { CacheManager } from "./data/cache-manager";
import { IDMapper } from "./data/id-mapper";

const PLUGIN_ID = "omnifocus-bridge";

export default class OmniFocusBridgePlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	private statusBarEl: HTMLElement | null = null;
	private syncEngine: SyncEngine | null = null;
	private cache: CacheManager | null = null;

	async onload() {
		await this.loadSettings();

		// Platform check
		if (typeof process !== "undefined" && process.platform !== "darwin") {
			new Notice("OmniFocus Bridge requires macOS Desktop.");
			return;
		}

		// Initialize data layer
		this.cache = new CacheManager(this.app.vault.adapter, PLUGIN_ID);
		const idMapper = new IDMapper(this.app.vault.adapter, PLUGIN_ID);

		// Initialize sync engine
		this.syncEngine = new SyncEngine(
			this.app.vault,
			this.cache,
			idMapper,
			this.settings
		);

		// Settings tab
		this.addSettingTab(new OmniFocusBridgeSettingTab(this.app, this));

		// Status bar
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("omnifocus-bridge-status");
		this.statusBarEl.addEventListener("click", () => this.syncNow());
		await this.updateStatusBar();

		// Commands
		this.addCommand({
			id: "omnifocus-sync-now",
			name: "Sync Now",
			callback: () => this.syncNow(),
		});

		this.addCommand({
			id: "omnifocus-open-folder",
			name: "Open Sync Folder",
			callback: () => {
				const folder = this.app.vault.getAbstractFileByPath(
					this.settings.syncFolderPath
				);
				if (folder) {
					(this.app as any).internalPlugins?.plugins?.["file-explorer"]?.instance?.revealInFolder(folder);
				} else {
					new Notice(`Sync folder "${this.settings.syncFolderPath}" not found. Run Sync first.`);
				}
			},
		});
	}

	onunload() {
		this.statusBarEl = null;
		this.syncEngine = null;
	}

	async syncNow(): Promise<void> {
		if (!this.syncEngine) {
			new Notice("OmniFocus Bridge is not initialized.");
			return;
		}

		this.setStatusBar("syncing...");
		new Notice("Syncing with OmniFocus...");

		try {
			const result = await this.syncEngine.sync();
			const taskCount = result.projects.reduce(
				(sum, p) => sum + p.tasks.length,
				result.inboxTasks.length
			);
			const projectCount = result.projects.length;

			new Notice(`Synced ${taskCount} tasks across ${projectCount} projects`);
			await this.updateStatusBar();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error("OmniFocus sync failed:", err);
			new Notice(`Sync failed: ${msg}`);
			this.setStatusBar("error");
		}
	}

	private async updateStatusBar(): Promise<void> {
		if (!this.cache) return;

		const lastSync = await this.cache.getLastSyncTime();
		if (!lastSync) {
			this.setStatusBar("not synced");
			return;
		}

		const ago = this.timeAgo(new Date(lastSync));
		this.setStatusBar(`synced ${ago}`);
	}

	private setStatusBar(text: string): void {
		if (this.statusBarEl) {
			this.statusBarEl.setText(`OF: ${text}`);
		}
	}

	private timeAgo(date: Date): string {
		const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
		if (seconds < 60) return "just now";
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		return `${Math.floor(hours / 24)}d ago`;
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
