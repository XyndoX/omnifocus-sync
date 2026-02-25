export function buildFetchTasksScript(): string {
	return `(() => {
	const allTasks = flattenedTasks;
	const tasks = [];
	for (let i = 0; i < allTasks.length; i++) {
		const t = allTasks[i];
		try {
			if (t.taskStatus === Task.Status.Dropped || t.completed) continue;
			tasks.push({
				id: t.id.primaryKey,
				name: t.name,
				note: t.note || null,
				completed: t.completed,
				completionDate: t.completionDate ? t.completionDate.toISOString() : null,
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
		} catch (e) {
			// Skip tasks that fail to read
		}
	}
	return JSON.stringify(tasks);
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
