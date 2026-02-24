import type { OFTask, ProjectWithTasks, PluginSettings } from "../types";

function formatDate(iso: string): string {
	return iso.slice(0, 10);
}

function sanitizeTag(name: string): string {
	return name.replace(/\s+/g, "-");
}

export function renderTaskLine(task: OFTask, settings: PluginSettings): string {
	const checkbox = task.completed ? "- [x]" : "- [ ]";
	const parts: string[] = [checkbox, task.name];

	if (task.flagged) {
		parts.push("🚩");
	}

	if (settings.showDueDate && task.dueDate) {
		parts.push(`📅 ${formatDate(task.dueDate)}`);
	}

	if (settings.showTags && task.tags.length > 0) {
		const tagStr = task.tags
			.map((t) => `#${settings.tagPrefix}/${sanitizeTag(t.name)}`)
			.join(" ");
		parts.push(`🏷️ ${tagStr}`);
	}

	if (settings.showEstimate && task.estimatedMinutes) {
		parts.push(`⏱️ ${task.estimatedMinutes}min`);
	}

	if (task.completed && task.completionDate) {
		parts.push(`✅ ${formatDate(task.completionDate)}`);
	}

	if (settings.showOFLink) {
		parts.push(`[OF](omnifocus:///task/${task.id})`);
	}

	parts.push(`<!-- of:${task.id} -->`);

	return parts.join(" ");
}

export function sortTasks(tasks: OFTask[]): OFTask[] {
	return [...tasks].sort((a, b) => {
		// Active before completed
		if (a.completed !== b.completed) return a.completed ? 1 : -1;

		// Flagged first (among active)
		if (!a.completed && !b.completed) {
			if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;

			// Due date: earliest first, no-date last
			if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
			if (a.dueDate && !b.dueDate) return -1;
			if (!a.dueDate && b.dueDate) return 1;
		}

		// Alphabetical fallback
		return a.name.localeCompare(b.name);
	});
}

export function renderProjectFile(
	project: ProjectWithTasks,
	syncedAt: string,
	settings: PluginSettings
): string {
	const lines: string[] = [];

	// Frontmatter
	lines.push("---");
	lines.push(`omnifocus-project-id: "${project.id}"`);
	lines.push(`omnifocus-status: "${project.status}"`);
	lines.push(`omnifocus-last-sync: "${syncedAt}"`);
	lines.push("---");
	lines.push("");

	// Title
	lines.push(`# ${project.name}`);
	lines.push("");

	// Tasks
	const sorted = sortTasks(project.tasks);
	for (const task of sorted) {
		lines.push(renderTaskLine(task, settings));
	}

	lines.push("");
	return lines.join("\n");
}

export function renderInboxFile(
	tasks: OFTask[],
	syncedAt: string,
	settings: PluginSettings
): string {
	const lines: string[] = [];

	lines.push("---");
	lines.push(`omnifocus-last-sync: "${syncedAt}"`);
	lines.push("---");
	lines.push("");
	lines.push("# Inbox");
	lines.push("");

	const sorted = sortTasks(tasks);
	for (const task of sorted) {
		lines.push(renderTaskLine(task, settings));
	}

	lines.push("");
	return lines.join("\n");
}
