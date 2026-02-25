// src/renderer/codeblock-handler.ts
import type { Plugin } from "obsidian";
import type { OFTask, PluginSettings } from "../types";
import type { CacheManager } from "../data/cache-manager";

interface CodeblockConfig {
	view: string;
	format: "list" | "table";
	show: string[];
	project?: string;
}

const DEFAULT_COLUMNS = ["name", "dueDate", "project", "tags"];

const VALID_COLUMNS = new Set([
	"name",
	"dueDate",
	"deferDate",
	"project",
	"tags",
	"estimate",
	"flagged",
]);

/**
 * Parse the YAML-like config from a codeblock source string.
 */
export function parseCodeblockConfig(source: string): CodeblockConfig {
	const config: CodeblockConfig = {
		view: "all-active",
		format: "list",
		show: [...DEFAULT_COLUMNS],
	};

	for (const line of source.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const colonIdx = trimmed.indexOf(":");
		if (colonIdx === -1) continue;

		const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
		const value = trimmed.slice(colonIdx + 1).trim();

		switch (key) {
			case "view":
				config.view = value.toLowerCase();
				break;
			case "format":
				if (value.toLowerCase() === "table" || value.toLowerCase() === "list") {
					config.format = value.toLowerCase() as "list" | "table";
				}
				break;
			case "show":
				config.show = value
					.split(",")
					.map((s) => s.trim())
					.filter((s) => VALID_COLUMNS.has(s));
				if (config.show.length === 0) {
					config.show = [...DEFAULT_COLUMNS];
				}
				break;
			case "project":
				config.project = value.replace(/^["']|["']$/g, "");
				break;
		}
	}

	return config;
}

/**
 * Collect all tasks from cache data (projects + inbox).
 */
function getAllTasks(cacheData: { projects: { tasks: OFTask[] }[]; inboxTasks: OFTask[] }): OFTask[] {
	const tasks: OFTask[] = [];
	for (const project of cacheData.projects) {
		tasks.push(...project.tasks);
	}
	tasks.push(...cacheData.inboxTasks);
	return tasks;
}

/**
 * Filter tasks based on the view type.
 */
export function filterTasksByView(
	tasks: OFTask[],
	config: CodeblockConfig
): OFTask[] {
	const today = new Date().toISOString().slice(0, 10);

	// Compute end-of-week date (7 days from today)
	const weekEnd = new Date();
	weekEnd.setDate(weekEnd.getDate() + 7);
	const weekEndStr = weekEnd.toISOString().slice(0, 10);

	const active = tasks.filter((t) => !t.completed);

	switch (config.view) {
		case "due-today":
			return active.filter((t) => {
				if (!t.dueDate) return false;
				const due = t.dueDate.slice(0, 10);
				return due <= today;
			});

		case "due-this-week":
			return active.filter((t) => {
				if (!t.dueDate) return false;
				const due = t.dueDate.slice(0, 10);
				return due <= weekEndStr;
			});

		case "flagged":
			return active.filter((t) => t.flagged);

		case "all-active":
			return active;

		case "project":
			if (!config.project) return [];
			return active.filter(
				(t) =>
					t.projectName?.toLowerCase() === config.project?.toLowerCase()
			);

		default:
			return active;
	}
}

function formatDate(iso: string | null): string {
	if (!iso) return "";
	return iso.slice(0, 10);
}

/**
 * Render a list of tasks as checkboxes into the given HTMLElement.
 */
function renderAsList(
	el: HTMLElement,
	tasks: OFTask[],
	settings: PluginSettings
): void {
	const ul = el.createEl("ul", { cls: "omnifocus-codeblock-list" });

	for (const task of tasks) {
		const li = ul.createEl("li");
		const checkbox = li.createEl("input", { type: "checkbox" });
		checkbox.checked = task.completed;
		checkbox.disabled = true;

		const span = li.createEl("span", { text: ` ${task.name}` });

		if (task.flagged) {
			li.createEl("span", { text: " \uD83D\uDEA9", cls: "omnifocus-flag" });
		}

		if (settings.showDueDate && task.dueDate) {
			li.createEl("span", {
				text: ` \uD83D\uDCC5 ${formatDate(task.dueDate)}`,
				cls: "omnifocus-due",
			});
		}

		if (settings.showTags && task.tags.length > 0) {
			const tagStr = task.tags.map((t) => t.name).join(", ");
			li.createEl("span", {
				text: ` \uD83C\uDFF7\uFE0F ${tagStr}`,
				cls: "omnifocus-tags",
			});
		}

		if (settings.showEstimate && task.estimatedMinutes) {
			li.createEl("span", {
				text: ` \u23F1\uFE0F ${task.estimatedMinutes}min`,
				cls: "omnifocus-estimate",
			});
		}
	}
}

/**
 * Render a list of tasks as an HTML table into the given HTMLElement.
 */
function renderAsTable(
	el: HTMLElement,
	tasks: OFTask[],
	columns: string[]
): void {
	const table = el.createEl("table", { cls: "omnifocus-codeblock-table" });

	// Header
	const thead = table.createEl("thead");
	const headerRow = thead.createEl("tr");
	for (const col of columns) {
		const label = columnLabel(col);
		headerRow.createEl("th", { text: label });
	}

	// Body
	const tbody = table.createEl("tbody");
	for (const task of tasks) {
		const row = tbody.createEl("tr");
		for (const col of columns) {
			const td = row.createEl("td");
			td.setText(cellValue(task, col));
		}
	}
}

function columnLabel(col: string): string {
	switch (col) {
		case "name": return "Name";
		case "dueDate": return "Due Date";
		case "deferDate": return "Defer Date";
		case "project": return "Project";
		case "tags": return "Tags";
		case "estimate": return "Estimate";
		case "flagged": return "Flagged";
		default: return col;
	}
}

function cellValue(task: OFTask, col: string): string {
	switch (col) {
		case "name": return task.name;
		case "dueDate": return formatDate(task.dueDate);
		case "deferDate": return formatDate(task.deferDate);
		case "project": return task.projectName ?? "";
		case "tags": return task.tags.map((t) => t.name).join(", ");
		case "estimate": return task.estimatedMinutes ? `${task.estimatedMinutes}min` : "";
		case "flagged": return task.flagged ? "Yes" : "";
		default: return "";
	}
}

/**
 * Register the `omnifocus` codeblock processor on the plugin.
 */
export function registerCodeblockHandler(
	plugin: Plugin,
	cache: CacheManager,
	settings: PluginSettings
): void {
	plugin.registerMarkdownCodeBlockProcessor(
		"omnifocus",
		async (source: string, el: HTMLElement) => {
			const config = parseCodeblockConfig(source);

			const cacheData = await cache.load();
			if (!cacheData) {
				el.createEl("p", {
					text: "No OmniFocus data available. Run a sync first.",
					cls: "omnifocus-codeblock-empty",
				});
				return;
			}

			const allTasks = getAllTasks(cacheData);
			const filtered = filterTasksByView(allTasks, config);

			if (filtered.length === 0) {
				el.createEl("p", {
					text: "(none)",
					cls: "omnifocus-codeblock-empty",
				});
				return;
			}

			// Sort: flagged first, then by due date, then alphabetical
			filtered.sort((a, b) => {
				if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
				if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
				if (a.dueDate && !b.dueDate) return -1;
				if (!a.dueDate && b.dueDate) return 1;
				return a.name.localeCompare(b.name);
			});

			if (config.format === "table") {
				renderAsTable(el, filtered, config.show);
			} else {
				renderAsList(el, filtered, settings);
			}
		}
	);
}
