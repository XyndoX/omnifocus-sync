export function buildFetchTasksScript(): string {
	return `(() => {
	var seen = {};
	var tasks = [];
	function addTask(t) {
		try {
			var key = t.id.primaryKey;
			if (seen[key]) return;
			if (t.taskStatus === Task.Status.Dropped) return;
			if (t.completed) return;
			seen[key] = true;
			tasks.push({
				id: key,
				name: t.name,
				note: t.note || null,
				completed: false,
				completionDate: null,
				dueDate: t.dueDate ? t.dueDate.toISOString() : null,
				deferDate: t.deferDate ? t.deferDate.toISOString() : null,
				flagged: t.flagged,
				estimatedMinutes: t.estimatedMinutes || null,
				taskStatus: String(t.taskStatus),
				projectId: t.containingProject ? t.containingProject.id.primaryKey : null,
				projectName: t.containingProject ? t.containingProject.name : null,
				tags: t.tags.map(tag => ({ id: tag.id.primaryKey, name: tag.name })),
				added: t.added ? t.added.toISOString() : null,
				modified: t.modificationDate ? t.modificationDate.toISOString() : null
			});
		} catch (e) {}
	}
	var allTasks = flattenedTasks;
	for (var i = 0; i < allTasks.length; i++) { addTask(allTasks[i]); }
	try {
		var inboxItems = inbox;
		for (var j = 0; j < inboxItems.length; j++) { addTask(inboxItems[j]); }
	} catch (e) {}
	return JSON.stringify(tasks);
})()`;
}

/**
 * Build a JXA script that checks the status of specific task IDs.
 * Used to detect whether "missing" tasks were completed or deleted.
 */
export function buildCheckTaskStatusScript(taskIds: string[]): string {
	const idsJson = JSON.stringify(taskIds);
	return `(() => {
	var ids = ${idsJson};
	var lookup = {};
	for (var i = 0; i < ids.length; i++) { lookup[ids[i]] = true; }
	var remaining = ids.length;
	var found = {};
	var allTasks = flattenedTasks;
	for (var i = 0; i < allTasks.length; i++) {
		if (remaining === 0) break;
		var t = allTasks[i];
		try {
			var key = t.id.primaryKey;
			if (lookup[key]) {
				found[key] = {
					completed: t.completed,
					completionDate: t.completionDate ? t.completionDate.toISOString() : null,
					name: t.name,
					flagged: t.flagged,
					dueDate: t.dueDate ? t.dueDate.toISOString() : null,
					deferDate: t.deferDate ? t.deferDate.toISOString() : null,
					note: t.note || null,
					estimatedMinutes: t.estimatedMinutes || null,
					taskStatus: String(t.taskStatus),
					projectId: t.containingProject ? t.containingProject.id.primaryKey : null,
					projectName: t.containingProject ? t.containingProject.name : null,
					tags: t.tags.map(tag => ({ id: tag.id.primaryKey, name: tag.name })),
					added: t.added ? t.added.toISOString() : null,
					modified: t.modificationDate ? t.modificationDate.toISOString() : null
				};
				delete lookup[key];
				remaining--;
			}
		} catch (e) {}
	}
	try {
		var inboxItems = inbox;
		for (var j = 0; j < inboxItems.length; j++) {
			if (remaining === 0) break;
			var t = inboxItems[j];
			try {
				var key = t.id.primaryKey;
				if (lookup[key]) {
					found[key] = {
						completed: t.completed,
						completionDate: t.completionDate ? t.completionDate.toISOString() : null,
						name: t.name,
						flagged: t.flagged,
						dueDate: t.dueDate ? t.dueDate.toISOString() : null,
						deferDate: t.deferDate ? t.deferDate.toISOString() : null,
						note: t.note || null,
						estimatedMinutes: t.estimatedMinutes || null,
						taskStatus: String(t.taskStatus),
						projectId: t.containingProject ? t.containingProject.id.primaryKey : null,
						projectName: t.containingProject ? t.containingProject.name : null,
						tags: t.tags.map(tag => ({ id: tag.id.primaryKey, name: tag.name })),
						added: t.added ? t.added.toISOString() : null,
						modified: t.modificationDate ? t.modificationDate.toISOString() : null
					};
					delete lookup[key];
					remaining--;
				}
			} catch (e) {}
		}
	} catch (e) {}
	return JSON.stringify(found);
})()`;
}

export function buildFetchProjectsScript(): string {
	return `(() => {
	function getFolderPath(folder) {
		const parts = [];
		let f = folder;
		while (f) {
			parts.unshift(f.name);
			f = f.parent;
		}
		return parts.join("/");
	}
	const allProjects = flattenedProjects;
	const projects = [];
	for (let i = 0; i < allProjects.length; i++) {
		const p = allProjects[i];
		try {
			if (p.status !== Project.Status.Active && p.status !== Project.Status.OnHold) continue;
			projects.push({
				id: p.id.primaryKey,
				name: p.name,
				note: p.note || null,
				status: p.status === Project.Status.Active ? "active" :
				        p.status === Project.Status.OnHold ? "onHold" :
				        p.status === Project.Status.Completed ? "completed" : "dropped",
				dueDate: p.dueDate ? p.dueDate.toISOString() : null,
				deferDate: p.deferDate ? p.deferDate.toISOString() : null,
				sequential: p.sequential,
				folderName: p.parentFolder ? p.parentFolder.name : null,
				folderPath: p.parentFolder ? getFolderPath(p.parentFolder) : null
			});
		} catch (e) {
			// Skip projects that fail to read
		}
	}
	return JSON.stringify(projects);
})()`;
}

export function buildFetchTagsScript(): string {
	return `(() => {
	const allTags = flattenedTags;
	const tags = [];
	for (let i = 0; i < allTags.length; i++) {
		const t = allTags[i];
		try {
			tags.push({
				id: t.id.primaryKey,
				name: t.name,
				parentName: t.parent ? t.parent.name : null,
				active: t.active
			});
		} catch (e) {
			// Skip tags that fail to read
		}
	}
	return JSON.stringify(tags);
})()`;
}

export function buildConnectionTestScript(): string {
	return `(() => {
	return JSON.stringify({ version: app.version, name: app.name });
})()`;
}
