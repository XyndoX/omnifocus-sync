import { Notice } from "obsidian";
import type { Vault, TAbstractFile, TFile, EventRef } from "obsidian";
import type { PluginSettings, OFTask, CacheData } from "../types";
import type { CacheManager } from "../data/cache-manager";
import { runJXA } from "../bridge/jxa-runner";
import {
	buildMarkCompleteScript,
	buildMarkIncompleteScript,
} from "../bridge/jxa-write-scripts";

/**
 * Regex to extract task lines from synced markdown files.
 * Captures:
 *   [1] = checkbox state: " " (unchecked) or "x" (checked)
 *   [2] = OmniFocus task ID from the HTML comment anchor
 */
const TASK_LINE_RE = /- \[([ x])\] .+?<!-- of:([a-zA-Z0-9_-]+) -->/g;

interface ParsedTask {
	id: string;
	checked: boolean;
}

/**
 * Detects checkbox changes in synced markdown files and writes them
 * back to OmniFocus via JXA.
 */
export class ChangeDetector {
	private eventRef: EventRef | null = null;
	private debounceTimers: Map<string, ReturnType<typeof setTimeout>> =
		new Map();
	private readonly DEBOUNCE_MS = 500;

	constructor(
		private vault: Vault,
		private cache: CacheManager,
		private settings: PluginSettings
	) {}

	/**
	 * Start listening for file modifications.
	 * Returns a cleanup function that stops listening.
	 */
	start(): () => void {
		this.eventRef = this.vault.on("modify", (file: TAbstractFile) => {
			this.onFileModified(file);
		});

		return () => this.stop();
	}

	/** Stop listening and clear all pending debounce timers. */
	stop(): void {
		if (this.eventRef) {
			this.vault.offref(this.eventRef);
			this.eventRef = null;
		}
		for (const timer of this.debounceTimers.values()) {
			clearTimeout(timer);
		}
		this.debounceTimers.clear();
	}

	// -----------------------------------------------------------------------
	// Internal
	// -----------------------------------------------------------------------

	private onFileModified(file: TAbstractFile): void {
		// Only process .md files inside the sync folder
		if (!file.path.endsWith(".md")) return;
		if (!file.path.startsWith(this.settings.syncFolderPath + "/") &&
			file.path !== this.settings.syncFolderPath) {
			return;
		}

		// Per-file debounce
		const existing = this.debounceTimers.get(file.path);
		if (existing) {
			clearTimeout(existing);
		}

		const timer = setTimeout(() => {
			this.debounceTimers.delete(file.path);
			this.processFile(file as TFile).catch((err) => {
				console.error("ChangeDetector: error processing file", err);
			});
		}, this.DEBOUNCE_MS);

		this.debounceTimers.set(file.path, timer);
	}

	/** Read file, extract tasks, compare against cache, and write back changes. */
	async processFile(file: TFile): Promise<void> {
		const content = await this.vault.read(file);
		const fileTasks = this.parseTaskLines(content);

		if (fileTasks.length === 0) return;

		const cacheData = await this.cache.load();
		if (!cacheData) return;

		const cachedTaskMap = this.buildCachedTaskMap(cacheData);

		let cacheUpdated = false;

		for (const fileTask of fileTasks) {
			const cachedTask = cachedTaskMap.get(fileTask.id);
			if (!cachedTask) continue;

			const wasCompleted = cachedTask.completed;
			const isNowCompleted = fileTask.checked;

			if (wasCompleted === isNowCompleted) continue;

			// State changed -- write back to OmniFocus
			try {
				if (isNowCompleted) {
					await runJXA(buildMarkCompleteScript(fileTask.id));
					new Notice("Task completed in OmniFocus");
				} else {
					await runJXA(buildMarkIncompleteScript(fileTask.id));
					new Notice("Task marked incomplete in OmniFocus");
				}

				// Update the cache so we don't re-process this change
				cachedTask.completed = isNowCompleted;
				cacheUpdated = true;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error(`ChangeDetector: JXA write failed for task ${fileTask.id}`, err);
				new Notice(`Failed to update OmniFocus: ${msg}`);
				// Continue processing remaining tasks
			}
		}

		// Save cache once at the end if any tasks were updated
		if (cacheUpdated) {
			await this.cache.save(cacheData);
		}
	}

	/** Extract all task IDs and their checkbox state from a markdown string. */
	private parseTaskLines(content: string): ParsedTask[] {
		const results: ParsedTask[] = [];
		let match: RegExpExecArray | null;

		// Reset regex state (it has the /g flag)
		TASK_LINE_RE.lastIndex = 0;

		while ((match = TASK_LINE_RE.exec(content)) !== null) {
			results.push({
				id: match[2]!,
				checked: match[1] === "x",
			});
		}

		return results;
	}

	/** Build a lookup map of task ID -> OFTask from the cache data. */
	private buildCachedTaskMap(cacheData: CacheData): Map<string, OFTask> {
		const map = new Map<string, OFTask>();

		for (const project of cacheData.projects) {
			for (const task of project.tasks) {
				map.set(task.id, task);
			}
		}

		for (const task of cacheData.inboxTasks) {
			map.set(task.id, task);
		}

		return map;
	}
}
