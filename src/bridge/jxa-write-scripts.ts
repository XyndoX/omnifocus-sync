/**
 * JXA write-back scripts for OmniFocus Omni Automation API.
 *
 * Each function returns a string containing an Omni Automation script
 * (IIFE) that runs inside OmniFocus via evaluateJavascript().
 *
 * Conventions (matching jxa-scripts.ts):
 *   - Scripts are self-contained IIFEs: (() => { ... })()
 *   - Top-level globals: flattenedTasks, flattenedProjects, flattenedTags, inbox, Task, Project
 *   - Task lookup by id.primaryKey via iteration
 *   - Every script returns JSON.stringify(result)
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape a string so it can be safely embedded in a JS string literal
 * (single-quoted) inside the generated script. Prevents injection.
 */
function escapeForJS(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/\t/g, "\\t");
}

/**
 * Common snippet: find a task by its primaryKey or throw.
 */
function findTaskSnippet(taskId: string): string {
	const safeId = escapeForJS(taskId);
	return `var task = null;
	for (var i = 0; i < flattenedTasks.length; i++) {
		if (flattenedTasks[i].id.primaryKey === '${safeId}') {
			task = flattenedTasks[i];
			break;
		}
	}
	if (!task) { throw new Error('Task not found: ${safeId}'); }`;
}

// ---------------------------------------------------------------------------
// Mark complete / incomplete
// ---------------------------------------------------------------------------

export function buildMarkCompleteScript(taskId: string): string {
	return `(() => {
	${findTaskSnippet(taskId)}
	task.markComplete();
	return JSON.stringify({ success: true, id: task.id.primaryKey });
})()`;
}

export function buildMarkIncompleteScript(taskId: string): string {
	return `(() => {
	${findTaskSnippet(taskId)}
	task.markIncomplete();
	return JSON.stringify({ success: true, id: task.id.primaryKey });
})()`;
}

// ---------------------------------------------------------------------------
// Create task
// ---------------------------------------------------------------------------

export function buildCreateTaskScript(opts: {
	name: string;
	projectId?: string;
	dueDate?: string;
	deferDate?: string;
	flagged?: boolean;
	tagNames?: string[];
	note?: string;
}): string {
	const safeName = escapeForJS(opts.name);
	const safeNote = opts.note !== undefined ? escapeForJS(opts.note) : null;

	// Build the property assignments that follow Task construction
	const propLines: string[] = [];

	if (opts.dueDate) {
		propLines.push(`	newTask.dueDate = new Date('${escapeForJS(opts.dueDate)}');`);
	}
	if (opts.deferDate) {
		propLines.push(`	newTask.deferDate = new Date('${escapeForJS(opts.deferDate)}');`);
	}
	if (opts.flagged !== undefined) {
		propLines.push(`	newTask.flagged = ${opts.flagged ? "true" : "false"};`);
	}
	if (safeNote !== null) {
		propLines.push(`	newTask.note = '${safeNote}';`);
	}

	// Tag assignment block
	let tagBlock = "";
	if (opts.tagNames && opts.tagNames.length > 0) {
		const tagList = opts.tagNames
			.map((t) => `'${escapeForJS(t)}'`)
			.join(", ");
		tagBlock = `
	var tagNames = [${tagList}];
	for (var ti = 0; ti < tagNames.length; ti++) {
		var found = null;
		for (var si = 0; si < flattenedTags.length; si++) {
			if (flattenedTags[si].name === tagNames[ti]) {
				found = flattenedTags[si];
				break;
			}
		}
		if (found) { newTask.addTag(found); }
	}`;
	}

	// Target: project or inbox
	let targetSnippet: string;
	if (opts.projectId) {
		const safeProjectId = escapeForJS(opts.projectId);
		targetSnippet = `var proj = null;
	for (var pi = 0; pi < flattenedProjects.length; pi++) {
		if (flattenedProjects[pi].id.primaryKey === '${safeProjectId}') {
			proj = flattenedProjects[pi];
			break;
		}
	}
	if (!proj) { throw new Error('Project not found: ${safeProjectId}'); }
	var newTask = new Task('${safeName}', proj);`;
	} else {
		targetSnippet = `var newTask = new Task('${safeName}', inbox);`;
	}

	return `(() => {
	${targetSnippet}
${propLines.join("\n")}${tagBlock}
	return JSON.stringify({ id: newTask.id.primaryKey });
})()`;
}

// ---------------------------------------------------------------------------
// Set flagged
// ---------------------------------------------------------------------------

export function buildSetFlagScript(taskId: string, flagged: boolean): string {
	return `(() => {
	${findTaskSnippet(taskId)}
	task.flagged = ${flagged ? "true" : "false"};
	return JSON.stringify({ success: true, id: task.id.primaryKey, flagged: task.flagged });
})()`;
}

// ---------------------------------------------------------------------------
// Set due date
// ---------------------------------------------------------------------------

export function buildSetDueDateScript(taskId: string, date: string | null): string {
	const dateLine = date === null
		? "task.dueDate = null;"
		: `task.dueDate = new Date('${escapeForJS(date)}');`;

	return `(() => {
	${findTaskSnippet(taskId)}
	${dateLine}
	return JSON.stringify({ success: true, id: task.id.primaryKey, dueDate: task.dueDate ? task.dueDate.toISOString() : null });
})()`;
}

// ---------------------------------------------------------------------------
// Set defer date
// ---------------------------------------------------------------------------

export function buildSetDeferDateScript(taskId: string, date: string | null): string {
	const dateLine = date === null
		? "task.deferDate = null;"
		: `task.deferDate = new Date('${escapeForJS(date)}');`;

	return `(() => {
	${findTaskSnippet(taskId)}
	${dateLine}
	return JSON.stringify({ success: true, id: task.id.primaryKey, deferDate: task.deferDate ? task.deferDate.toISOString() : null });
})()`;
}

// ---------------------------------------------------------------------------
// Add tag
// ---------------------------------------------------------------------------

export function buildAddTagScript(taskId: string, tagName: string): string {
	const safeName = escapeForJS(tagName);

	return `(() => {
	${findTaskSnippet(taskId)}
	var tag = null;
	for (var i = 0; i < flattenedTags.length; i++) {
		if (flattenedTags[i].name === '${safeName}') {
			tag = flattenedTags[i];
			break;
		}
	}
	if (!tag) { throw new Error('Tag not found: ${safeName}'); }
	task.addTag(tag);
	return JSON.stringify({ success: true, id: task.id.primaryKey, tag: tag.name });
})()`;
}

// ---------------------------------------------------------------------------
// Remove tag
// ---------------------------------------------------------------------------

export function buildRemoveTagScript(taskId: string, tagName: string): string {
	const safeName = escapeForJS(tagName);

	return `(() => {
	${findTaskSnippet(taskId)}
	var tag = null;
	for (var i = 0; i < flattenedTags.length; i++) {
		if (flattenedTags[i].name === '${safeName}') {
			tag = flattenedTags[i];
			break;
		}
	}
	if (!tag) { throw new Error('Tag not found: ${safeName}'); }
	task.removeTag(tag);
	return JSON.stringify({ success: true, id: task.id.primaryKey, tag: tag.name });
})()`;
}
