// src/renderer/daily-note.ts
import type { OFTask, PluginSettings } from "../types";
import { renderTaskLine, sortTasks } from "./markdown-renderer";

/**
 * Generate an OmniFocus section for a daily note.
 *
 * Filters tasks that are:
 * - Due on the given date
 * - Due before the given date (overdue)
 * - Flagged
 *
 * Returns a markdown string with "Due Today", "Overdue", and "Flagged" sections.
 */
export function generateDailyNoteSection(
	tasks: OFTask[],
	date: string,
	settings: PluginSettings
): string {
	const activeTasks = tasks.filter((t) => !t.completed);

	const dueToday = sortTasks(
		activeTasks.filter((t) => {
			if (!t.dueDate) return false;
			return t.dueDate.slice(0, 10) === date;
		})
	);

	const overdue = sortTasks(
		activeTasks.filter((t) => {
			if (!t.dueDate) return false;
			return t.dueDate.slice(0, 10) < date;
		})
	);

	// Flagged tasks not already in due/overdue sections
	const dueSectionIds = new Set([
		...dueToday.map((t) => t.id),
		...overdue.map((t) => t.id),
	]);

	const flagged = sortTasks(
		activeTasks.filter((t) => t.flagged && !dueSectionIds.has(t.id))
	);

	const lines: string[] = [];

	lines.push("## OmniFocus");
	lines.push("");

	lines.push("### Due Today");
	lines.push("");
	if (dueToday.length === 0) {
		lines.push("(none)");
	} else {
		for (const task of dueToday) {
			lines.push(renderTaskLine(task, settings));
		}
	}
	lines.push("");

	lines.push("### Overdue");
	lines.push("");
	if (overdue.length === 0) {
		lines.push("(none)");
	} else {
		for (const task of overdue) {
			lines.push(renderTaskLine(task, settings));
		}
	}
	lines.push("");

	lines.push("### Flagged");
	lines.push("");
	if (flagged.length === 0) {
		lines.push("(none)");
	} else {
		for (const task of flagged) {
			lines.push(renderTaskLine(task, settings));
		}
	}
	lines.push("");

	return lines.join("\n");
}
