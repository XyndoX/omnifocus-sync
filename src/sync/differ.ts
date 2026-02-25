import type { OFTask, OFProject, CacheData } from "../types";

export interface TaskChange {
	taskId: string;
	type: "added" | "removed" | "modified";
	field?: string;
	oldValue?: unknown;
	newValue?: unknown;
}

export interface ProjectChange {
	projectId: string;
	type: "added" | "removed" | "modified";
	field?: string;
	oldValue?: unknown;
	newValue?: unknown;
}

export interface DiffResult {
	taskChanges: TaskChange[];
	projectChanges: ProjectChange[];
	hasChanges: boolean;
}

/**
 * Compare two tag arrays by extracting sorted tag names.
 * Returns true if they differ.
 */
function tagsChanged(
	freshTags: { name: string }[],
	cachedTags: { name: string }[]
): boolean {
	const freshNames = freshTags.map((t) => t.name).sort();
	const cachedNames = cachedTags.map((t) => t.name).sort();
	if (freshNames.length !== cachedNames.length) return true;
	return freshNames.some((name, i) => name !== cachedNames[i]);
}

/**
 * Compare fresh tasks against cached tasks and return a list of changes.
 */
export function diffTasks(fresh: OFTask[], cached: OFTask[]): TaskChange[] {
	const changes: TaskChange[] = [];
	const cachedMap = new Map<string, OFTask>();
	for (const t of cached) {
		cachedMap.set(t.id, t);
	}

	const freshIds = new Set<string>();

	for (const freshTask of fresh) {
		freshIds.add(freshTask.id);
		const cachedTask = cachedMap.get(freshTask.id);

		if (!cachedTask) {
			changes.push({ taskId: freshTask.id, type: "added" });
			continue;
		}

		// Check each tracked field for modifications
		const fieldsToCheck: (keyof OFTask)[] = [
			"name",
			"completed",
			"dueDate",
			"deferDate",
			"flagged",
			"note",
		];

		for (const field of fieldsToCheck) {
			const oldVal = cachedTask[field];
			const newVal = freshTask[field];
			if (oldVal !== newVal) {
				changes.push({
					taskId: freshTask.id,
					type: "modified",
					field,
					oldValue: oldVal,
					newValue: newVal,
				});
			}
		}

		// Check tags separately (compare by name)
		if (tagsChanged(freshTask.tags, cachedTask.tags)) {
			const oldNames = cachedTask.tags.map((t) => t.name).sort();
			const newNames = freshTask.tags.map((t) => t.name).sort();
			changes.push({
				taskId: freshTask.id,
				type: "modified",
				field: "tags",
				oldValue: oldNames,
				newValue: newNames,
			});
		}
	}

	// Detect removed tasks
	for (const cachedTask of cached) {
		if (!freshIds.has(cachedTask.id)) {
			changes.push({ taskId: cachedTask.id, type: "removed" });
		}
	}

	return changes;
}

/**
 * Compare fresh projects against cached projects and return a list of changes.
 */
export function diffProjects(
	fresh: OFProject[],
	cached: OFProject[]
): ProjectChange[] {
	const changes: ProjectChange[] = [];
	const cachedMap = new Map<string, OFProject>();
	for (const p of cached) {
		cachedMap.set(p.id, p);
	}

	const freshIds = new Set<string>();

	for (const freshProj of fresh) {
		freshIds.add(freshProj.id);
		const cachedProj = cachedMap.get(freshProj.id);

		if (!cachedProj) {
			changes.push({ projectId: freshProj.id, type: "added" });
			continue;
		}

		// Check each tracked field for modifications
		const fieldsToCheck: (keyof OFProject)[] = [
			"name",
			"status",
			"dueDate",
			"deferDate",
		];

		for (const field of fieldsToCheck) {
			const oldVal = cachedProj[field];
			const newVal = freshProj[field];
			if (oldVal !== newVal) {
				changes.push({
					projectId: freshProj.id,
					type: "modified",
					field,
					oldValue: oldVal,
					newValue: newVal,
				});
			}
		}
	}

	// Detect removed projects
	for (const cachedProj of cached) {
		if (!freshIds.has(cachedProj.id)) {
			changes.push({ projectId: cachedProj.id, type: "removed" });
		}
	}

	return changes;
}

/**
 * Compute a full diff between fresh OmniFocus data and the cached state.
 * If no cache exists (first sync), all items are treated as "added".
 */
export function computeDiff(
	freshData: { tasks: OFTask[]; projects: OFProject[] },
	cachedData: CacheData | null
): DiffResult {
	let cachedTasks: OFTask[] = [];
	let cachedProjects: OFProject[] = [];

	if (cachedData) {
		// Collect all tasks from cached projects + inbox
		cachedTasks = [
			...cachedData.inboxTasks,
			...cachedData.projects.flatMap((p) => p.tasks),
		];
		cachedProjects = cachedData.projects.map(
			({ tasks: _tasks, ...project }) => project
		);
	}

	const taskChanges = diffTasks(freshData.tasks, cachedTasks);
	const projectChanges = diffProjects(freshData.projects, cachedProjects);

	return {
		taskChanges,
		projectChanges,
		hasChanges: taskChanges.length > 0 || projectChanges.length > 0,
	};
}
