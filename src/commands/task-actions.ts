// src/commands/task-actions.ts
import { Notice } from "obsidian";
import type { Plugin, MarkdownView } from "obsidian";
import type { OFTask, PluginSettings } from "../types";
import type { CacheManager } from "../data/cache-manager";
import { runJXA } from "../bridge/jxa-runner";
import {
	buildMarkCompleteScript,
	buildMarkIncompleteScript,
	buildSetFlagScript,
	buildSetDueDateScript,
	buildSetDeferDateScript,
} from "../bridge/jxa-write-scripts";
import { QuickAddModal } from "../ui/quick-add-modal";
import { DateInputModal } from "../ui/date-input-modal";
import { generateDailyNoteSection } from "../renderer/daily-note";

/**
 * Extract an OmniFocus task ID from a markdown line containing <!-- of:xxx -->.
 */
function getTaskIdFromLine(line: string): string | null {
	const match = line.match(/<!-- of:([a-zA-Z0-9_-]+) -->/);
	return match?.[1] ?? null;
}

/**
 * Get the current editor line text, or null if no active editor.
 */
function getCurrentLine(plugin: Plugin): string | null {
	const view = plugin.app.workspace.getActiveViewOfType(
		// We need the class at runtime but only for getActiveViewOfType.
		// Using a string-based approach to avoid importing the runtime class.
		null as unknown as new (...args: unknown[]) => MarkdownView
	);

	// Fallback: try to access the markdown editor directly
	const activeView = plugin.app.workspace.activeEditor;
	if (activeView?.editor) {
		const cursor = activeView.editor.getCursor();
		return activeView.editor.getLine(cursor.line);
	}
	if (view && "editor" in view) {
		const editor = (view as unknown as { editor: { getCursor: () => { line: number }; getLine: (n: number) => string } }).editor;
		const cursor = editor.getCursor();
		return editor.getLine(cursor.line);
	}
	return null;
}

/**
 * Get the task ID from the current cursor line, showing a Notice if not found.
 */
function getTaskIdFromCurrentLine(plugin: Plugin): string | null {
	const line = getCurrentLine(plugin);
	if (!line) {
		new Notice("No active editor or cursor line.");
		return null;
	}
	const taskId = getTaskIdFromLine(line);
	if (!taskId) {
		new Notice("No OmniFocus task ID found on this line.");
		return null;
	}
	return taskId;
}

/**
 * Register all task action commands on the plugin.
 */
export function registerTaskCommands(
	plugin: Plugin,
	cache: CacheManager,
	settings: PluginSettings,
	triggerSync: () => Promise<void>
): void {
	// -----------------------------------------------------------------
	// Quick Add Task
	// -----------------------------------------------------------------
	plugin.addCommand({
		id: "omnifocus-quick-add",
		name: "OmniFocus: Quick Add Task",
		callback: () => {
			// Try to read default project from current file frontmatter
			let defaultProjectId: string | undefined;
			const activeFile = plugin.app.workspace.getActiveFile();
			if (activeFile) {
				const frontmatter =
					plugin.app.metadataCache.getFileCache(activeFile)?.frontmatter;
				if (frontmatter && typeof frontmatter["omnifocus-project-id"] === "string") {
					defaultProjectId = frontmatter["omnifocus-project-id"];
				}
			}

			new QuickAddModal(
				plugin.app,
				cache,
				defaultProjectId,
				() => {
					triggerSync();
				}
			).open();
		},
	});

	// -----------------------------------------------------------------
	// Complete / Reopen Task
	// -----------------------------------------------------------------
	plugin.addCommand({
		id: "omnifocus-toggle-complete",
		name: "OmniFocus: Complete/Reopen Task",
		editorCallback: (editor) => {
			const cursor = editor.getCursor();
			const line = editor.getLine(cursor.line);
			const taskId = getTaskIdFromLine(line);
			if (!taskId) {
				new Notice("No OmniFocus task ID found on this line.");
				return;
			}

			// Determine current checkbox state from the line
			const isChecked = /- \[x\]/.test(line);
			const script = isChecked
				? buildMarkCompleteScript(taskId)
				: buildMarkIncompleteScript(taskId);
			const action = isChecked ? "completed" : "reopened";

			runJXA(script)
				.then(() => {
					new Notice(`Task ${action} in OmniFocus.`);
					return triggerSync();
				})
				.catch((err: unknown) => {
					const msg = err instanceof Error ? err.message : String(err);
					new Notice(`Failed to update task: ${msg}`);
				});
		},
	});

	// -----------------------------------------------------------------
	// Toggle Flag
	// -----------------------------------------------------------------
	plugin.addCommand({
		id: "omnifocus-toggle-flag",
		name: "OmniFocus: Toggle Flag",
		editorCallback: (editor) => {
			const cursor = editor.getCursor();
			const line = editor.getLine(cursor.line);
			const taskId = getTaskIdFromLine(line);
			if (!taskId) {
				new Notice("No OmniFocus task ID found on this line.");
				return;
			}

			// Read current flag state from cache
			cache
				.load()
				.then((cacheData) => {
					let currentFlagged = false;
					if (cacheData) {
						for (const project of cacheData.projects) {
							for (const task of project.tasks) {
								if (task.id === taskId) {
									currentFlagged = task.flagged;
								}
							}
						}
						for (const task of cacheData.inboxTasks) {
							if (task.id === taskId) {
								currentFlagged = task.flagged;
							}
						}
					}

					const newFlagged = !currentFlagged;
					return runJXA(buildSetFlagScript(taskId, newFlagged)).then(
						() => newFlagged
					);
				})
				.then((newFlagged) => {
					new Notice(
						newFlagged
							? "Task flagged in OmniFocus."
							: "Task unflagged in OmniFocus."
					);
					return triggerSync();
				})
				.catch((err: unknown) => {
					const msg = err instanceof Error ? err.message : String(err);
					new Notice(`Failed to toggle flag: ${msg}`);
				});
		},
	});

	// -----------------------------------------------------------------
	// Set Due Date
	// -----------------------------------------------------------------
	plugin.addCommand({
		id: "omnifocus-set-due-date",
		name: "OmniFocus: Set Due Date",
		editorCallback: (editor) => {
			const cursor = editor.getCursor();
			const line = editor.getLine(cursor.line);
			const taskId = getTaskIdFromLine(line);
			if (!taskId) {
				new Notice("No OmniFocus task ID found on this line.");
				return;
			}

			// Try to read current due date from cache
			let currentDueDate: string | null = null;
			cache.load().then((cacheData) => {
				if (cacheData) {
					for (const project of cacheData.projects) {
						for (const task of project.tasks) {
							if (task.id === taskId) {
								currentDueDate = task.dueDate;
							}
						}
					}
					for (const task of cacheData.inboxTasks) {
						if (task.id === taskId) {
							currentDueDate = task.dueDate;
						}
					}
				}

				new DateInputModal(
					plugin.app,
					"Set Due Date",
					currentDueDate,
					(date) => {
						runJXA(buildSetDueDateScript(taskId, date))
							.then(() => {
								new Notice(
									date
										? `Due date set to ${date}.`
										: "Due date cleared."
								);
								return triggerSync();
							})
							.catch((err: unknown) => {
								const msg =
									err instanceof Error
										? err.message
										: String(err);
								new Notice(`Failed to set due date: ${msg}`);
							});
					}
				).open();
			});
		},
	});

	// -----------------------------------------------------------------
	// Set Defer Date
	// -----------------------------------------------------------------
	plugin.addCommand({
		id: "omnifocus-set-defer-date",
		name: "OmniFocus: Set Defer Date",
		editorCallback: (editor) => {
			const cursor = editor.getCursor();
			const line = editor.getLine(cursor.line);
			const taskId = getTaskIdFromLine(line);
			if (!taskId) {
				new Notice("No OmniFocus task ID found on this line.");
				return;
			}

			let currentDeferDate: string | null = null;
			cache.load().then((cacheData) => {
				if (cacheData) {
					for (const project of cacheData.projects) {
						for (const task of project.tasks) {
							if (task.id === taskId) {
								currentDeferDate = task.deferDate;
							}
						}
					}
					for (const task of cacheData.inboxTasks) {
						if (task.id === taskId) {
							currentDeferDate = task.deferDate;
						}
					}
				}

				new DateInputModal(
					plugin.app,
					"Set Defer Date",
					currentDeferDate,
					(date) => {
						runJXA(buildSetDeferDateScript(taskId, date))
							.then(() => {
								new Notice(
									date
										? `Defer date set to ${date}.`
										: "Defer date cleared."
								);
								return triggerSync();
							})
							.catch((err: unknown) => {
								const msg =
									err instanceof Error
										? err.message
										: String(err);
								new Notice(
									`Failed to set defer date: ${msg}`
								);
							});
					}
				).open();
			});
		},
	});

	// -----------------------------------------------------------------
	// Open in OmniFocus
	// -----------------------------------------------------------------
	plugin.addCommand({
		id: "omnifocus-open-task",
		name: "OmniFocus: Open in OmniFocus",
		editorCallback: (editor) => {
			const cursor = editor.getCursor();
			const line = editor.getLine(cursor.line);
			const taskId = getTaskIdFromLine(line);
			if (!taskId) {
				new Notice("No OmniFocus task ID found on this line.");
				return;
			}

			window.open(`omnifocus:///task/${taskId}`);
		},
	});

	// -----------------------------------------------------------------
	// Insert Daily Summary
	// -----------------------------------------------------------------
	plugin.addCommand({
		id: "omnifocus-insert-daily-summary",
		name: "OmniFocus: Insert Daily Summary",
		editorCallback: (editor) => {
			const today = new Date().toISOString().slice(0, 10);

			cache
				.load()
				.then((cacheData) => {
					if (!cacheData) {
						new Notice("No OmniFocus data available. Run a sync first.");
						return;
					}

					// Collect all tasks from cache
					const allTasks: OFTask[] = [];
					for (const project of cacheData.projects) {
						allTasks.push(...project.tasks);
					}
					allTasks.push(...cacheData.inboxTasks);

					const section = generateDailyNoteSection(allTasks, today, settings);

					const cursor = editor.getCursor();
					editor.replaceRange(section, cursor);

					new Notice("Daily summary inserted.");
				})
				.catch((err: unknown) => {
					const msg = err instanceof Error ? err.message : String(err);
					new Notice(`Failed to insert daily summary: ${msg}`);
				});
		},
	});
}
