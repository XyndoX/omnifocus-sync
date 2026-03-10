// src/main.ts
import { Plugin, Notice, Platform } from "obsidian";
import type { PluginSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { OmniFocusBridgeSettingTab } from "./settings";
import { SyncEngine } from "./sync/sync-engine";
import { SyncScheduler } from "./sync/scheduler";
import { CacheManager } from "./data/cache-manager";
import { IDMapper } from "./data/id-mapper";
import { ChangeDetector } from "./sync/change-detector";
import { registerTaskCommands } from "./commands/task-actions";
import { registerCodeblockHandler } from "./renderer/codeblock-handler";
import { generateDashboard } from "./renderer/dashboard";
import { OmniFocusView, VIEW_TYPE } from "./ui/omnifocus-view";

const PLUGIN_ID = "omnifocus-bridge";

/**
 * Returns true when running on macOS Desktop where OmniFocus is available.
 */
function isMacOS(): boolean {
	// Obsidian's Platform API is the most reliable check.
	if (typeof Platform !== "undefined") {
		return Platform.isMacOS === true;
	}
	// Fallback for environments where Platform is unavailable (e.g. tests).
	if (typeof process !== "undefined") {
		return process.platform === "darwin";
	}
	return false;
}

export default class OmniFocusBridgePlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	private statusBarEl: HTMLElement | null = null;
	private syncEngine: SyncEngine | null = null;
	private scheduler: SyncScheduler | null = null;
	private cache: CacheManager | null = null;
	private changeDetector: ChangeDetector | null = null;
	private stopChangeDetector: (() => void) | null = null;
	private isSyncing = false;
	private lastFileOpenSync = 0;
	private omnifocusView: OmniFocusView | null = null;

	async onload() {
		await this.loadSettings();

		// Platform check — plugin still loads but does nothing on non-macOS
		if (!isMacOS()) {
			new Notice(
				"OmniFocus Bridge requires macOS Desktop. " +
				"The plugin is disabled on this platform."
			);
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

		// Initialize change detector
		this.changeDetector = new ChangeDetector(
			this.app.vault,
			this.cache,
			this.settings
		);
		this.stopChangeDetector = this.changeDetector.start();

		// Link change detector to sync engine for mutual coordination
		this.syncEngine.setChangeDetector(this.changeDetector);

		// Register task action commands
		registerTaskCommands(
			this,
			this.cache,
			this.settings,
			() => this.syncNow()
		);

		// Register codeblock handler for ```omnifocus blocks
		registerCodeblockHandler(this, this.cache, this.settings);

		// Settings tab
		this.addSettingTab(new OmniFocusBridgeSettingTab(this.app, this));

		// Side panel view
		this.registerView(VIEW_TYPE, (leaf) => {
			this.omnifocusView = new OmniFocusView(
				leaf,
				this.cache!,
				this.settings,
				() => this.syncNow()
			);
			return this.omnifocusView;
		});

		// Status bar
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("omnifocus-bridge-status");
		this.registerDomEvent(this.statusBarEl, "click", () => this.syncNow());
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

		this.addCommand({
			id: "omnifocus-open-panel",
			name: "Open OmniFocus Panel",
			callback: () => this.activatePanel(),
		});

		this.addCommand({
			id: "omnifocus-generate-dashboard",
			name: "OmniFocus: Generate Dashboard",
			callback: async () => {
				if (!this.cache) {
					new Notice("OmniFocus Bridge is not initialized.");
					return;
				}
				try {
					await generateDashboard(
						this.app.vault,
						this.cache,
						this.settings
					);
					new Notice("OmniFocus Dashboard generated.");
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					new Notice(`Dashboard failed: ${msg}`);
				}
			},
		});

		// Scheduler
		this.scheduler = new SyncScheduler(
			() => this.syncNow(),
			this.settings
		);
		this.scheduler.start();

		// Sync on startup (with delay to let Obsidian finish loading)
		if (this.settings.syncOnStartup) {
			const startupTimerId = window.setTimeout(() => {
				this.syncNow();
			}, 2000);
			this.register(() => window.clearTimeout(startupTimerId));
		}

		// Sync on file open (debounced with 30-second cooldown)
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (!file) return;
				if (!file.path.startsWith(this.settings.syncFolderPath + "/")) return;
				if (!file.path.endsWith(".md")) return;

				const now = Date.now();
				if (now - this.lastFileOpenSync < 30_000) return;

				this.lastFileOpenSync = now;
				this.syncNow();
			})
		);
	}

	async activatePanel(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]!);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	onunload() {
		if (this.scheduler) {
			this.scheduler.stop();
			this.scheduler = null;
		}
		if (this.stopChangeDetector) {
			this.stopChangeDetector();
			this.stopChangeDetector = null;
		}
		this.changeDetector = null;
		this.statusBarEl = null;
		this.syncEngine = null;
	}

	async syncNow(): Promise<void> {
		if (!this.syncEngine) {
			new Notice("OmniFocus Bridge is not initialized.");
			return;
		}

		if (this.isSyncing) {
			new Notice("Sync already in progress.");
			return;
		}

		this.isSyncing = true;
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
			// Refresh the side panel if open
			if (this.omnifocusView) {
				this.omnifocusView.refresh();
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error("OmniFocus sync failed:", err);
			new Notice(`Sync failed: ${msg}`);
			this.setStatusBar("error");
		} finally {
			this.isSyncing = false;
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
		if (this.scheduler) {
			this.scheduler.updateSettings(this.settings);
		}
	}
}
