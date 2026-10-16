// src/renderer/dashboard.ts
import { TFile, type Vault } from "obsidian";
import type { OFTask, PluginSettings, CacheData } from "../types";
import type { CacheManager } from "../data/cache-manager";
import { renderTaskLine, sortTasks } from "./markdown-renderer";

/**
 * Collect all tasks from cache data (projects + inbox).
 */
function getAllTasks(cacheData: CacheData): OFTask[] {
	const tasks: OFTask[] = [];
	for (const project of cacheData.projects) {
		tasks.push(...project.tasks);
	}
	tasks.push(...cacheData.inboxTasks);
	return tasks;
}

/**
 * Build the full dashboard markdown string from cache data.
 * Exported for testing.
 */
export function buildDashboardMarkdown(
	cacheData: CacheData,
	settings: PluginSettings
): string {
	const today = new Date().toISOString().slice(0, 10);

	const weekEnd = new Date();
	weekEnd.setDate(weekEnd.getDate() + 7);
	const weekEndStr = weekEnd.toISOString().slice(0, 10);

	const allTasks = getAllTasks(cacheData);
	const activeTasks = allTasks.filter((t) => !t.completed);

	// Categorize tasks
	const overdue = sortTasks(
		activeTasks.filter((t) => {
			if (!t.dueDate) return false;
			return t.dueDate.slice(0, 10) < today;
		})
	);

	const dueToday = sortTasks(
		activeTasks.filter((t) => {
			if (!t.dueDate) return false;
			return t.dueDate.slice(0, 10) === today;
		})
	);

	const dueThisWeek = sortTasks(
		activeTasks.filter((t) => {
			if (!t.dueDate) return false;
			const due = t.dueDate.slice(0, 10);
			return due > today && due <= weekEndStr;
		})
	);

	// Flagged tasks not already in due sections
	const dueSectionIds = new Set([
		...overdue.map((t) => t.id),
		...dueToday.map((t) => t.id),
		...dueThisWeek.map((t) => t.id),
	]);

	const flagged = sortTasks(
		activeTasks.filter((t) => t.flagged && !dueSectionIds.has(t.id))
	);

	// Statistics
	const totalOpen = activeTasks.length;
	const overdueCount = overdue.length;

	// Completed this week: tasks completed within the last 7 days
	const weekAgo = new Date();
	weekAgo.setDate(weekAgo.getDate() - 7);
	const weekAgoStr = weekAgo.toISOString().slice(0, 10);

	const completedThisWeek = allTasks.filter((t) => {
		if (!t.completed || !t.completionDate) return false;
		return t.completionDate.slice(0, 10) >= weekAgoStr;
	}).length;

	// Build markdown
	const lines: string[] = [];

	lines.push("---");
	lines.push(`omnifocus-dashboard: true`);
	lines.push(`omnifocus-last-sync: "${cacheData.syncedAt}"`);
	lines.push("---");
	lines.push("");
	lines.push("# OmniFocus Dashboard");
	lines.push("");

	// Overdue
	lines.push("## Overdue");
	lines.push("");
	if (overdue.length === 0) {
		lines.push("(none)");
	} else {
		for (const task of overdue) {
			lines.push(renderTaskLine(task, settings));
		}
	}
	lines.push("");

	// Due Today
	lines.push("## Due Today");
	lines.push("");
	if (dueToday.length === 0) {
		lines.push("(none)");
	} else {
		for (const task of dueToday) {
			lines.push(renderTaskLine(task, settings));
		}
	}
	lines.push("");

	// Due This Week
	lines.push("## Due This Week");
	lines.push("");
	if (dueThisWeek.length === 0) {
		lines.push("(none)");
	} else {
		for (const task of dueThisWeek) {
			lines.push(renderTaskLine(task, settings));
		}
	}
	lines.push("");

	// Flagged
	lines.push("## Flagged");
	lines.push("");
	if (flagged.length === 0) {
		lines.push("(none)");
	} else {
		for (const task of flagged) {
			lines.push(renderTaskLine(task, settings));
		}
	}
	lines.push("");

	// Statistics
	lines.push("## Statistics");
	lines.push("");
	lines.push(`- **Total Open:** ${totalOpen}`);
	lines.push(`- **Completed This Week:** ${completedThisWeek}`);
	lines.push(`- **Overdue:** ${overdueCount}`);
	lines.push("");

	return lines.join("\n");
}

/**
 * Generate or update the OmniFocus Dashboard.md file.
 */
export async function generateDashboard(
	vault: Vault,
	cache: CacheManager,
	settings: PluginSettings
): Promise<void> {
	const cacheData = await cache.load();
	if (!cacheData) {
		throw new Error("No OmniFocus data available. Run a sync first.");
	}

	const markdown = buildDashboardMarkdown(cacheData, settings);
	const dashboardPath = `${settings.syncFolderPath}/Dashboard.md`;

	// Ensure the sync folder exists
	if (!vault.getAbstractFileByPath(settings.syncFolderPath)) {
		await vault.createFolder(settings.syncFolderPath);
	}

	// Write or overwrite dashboard file
	const file = vault.getAbstractFileByPath(dashboardPath);
	if (file instanceof TFile) {
		await vault.modify(file, markdown);
	} else {
		await vault.create(dashboardPath, markdown);
	}
}
