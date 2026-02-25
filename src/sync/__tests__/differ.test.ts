import { describe, it, expect } from "vitest";
import { diffTasks, diffProjects, computeDiff } from "../differ";
import type { OFTask, OFProject, CacheData, ProjectWithTasks } from "../../types";

function makeTask(overrides: Partial<OFTask> = {}): OFTask {
	return {
		id: "t1",
		name: "Test Task",
		note: null,
		completed: false,
		completionDate: null,
		dueDate: null,
		deferDate: null,
		flagged: false,
		estimatedMinutes: null,
		taskStatus: "Available",
		projectId: null,
		projectName: null,
		tags: [],
		added: null,
		modified: null,
		...overrides,
	};
}

function makeProject(overrides: Partial<OFProject> = {}): OFProject {
	return {
		id: "p1",
		name: "Test Project",
		note: null,
		status: "active",
		dueDate: null,
		deferDate: null,
		sequential: false,
		folderName: null,
		folderPath: null,
		...overrides,
	};
}

function makeCacheData(
	projects: ProjectWithTasks[] = [],
	inboxTasks: OFTask[] = []
): CacheData {
	return {
		syncedAt: "2025-01-01T00:00:00.000Z",
		projects,
		inboxTasks,
		tags: [],
	};
}

describe("diffTasks", () => {
	it("returns empty array when both lists are empty", () => {
		const changes = diffTasks([], []);
		expect(changes).toEqual([]);
	});

	it("treats all tasks as added when cached list is empty", () => {
		const fresh = [makeTask({ id: "t1" }), makeTask({ id: "t2" })];
		const changes = diffTasks(fresh, []);

		expect(changes).toHaveLength(2);
		expect(changes[0]).toEqual({ taskId: "t1", type: "added" });
		expect(changes[1]).toEqual({ taskId: "t2", type: "added" });
	});

	it("returns empty when fresh and cached are identical", () => {
		const task = makeTask({ id: "t1", name: "Same" });
		const changes = diffTasks([task], [task]);
		expect(changes).toEqual([]);
	});

	it("detects an added task", () => {
		const existing = makeTask({ id: "t1" });
		const newTask = makeTask({ id: "t2", name: "New Task" });
		const changes = diffTasks([existing, newTask], [existing]);

		const added = changes.filter((c) => c.type === "added");
		expect(added).toHaveLength(1);
		expect(added[0]!.taskId).toBe("t2");
	});

	it("detects a removed task", () => {
		const remaining = makeTask({ id: "t1" });
		const removed = makeTask({ id: "t2", name: "Old Task" });
		const changes = diffTasks([remaining], [remaining, removed]);

		const removedChanges = changes.filter((c) => c.type === "removed");
		expect(removedChanges).toHaveLength(1);
		expect(removedChanges[0]!.taskId).toBe("t2");
	});

	it("detects modified task name", () => {
		const cached = makeTask({ id: "t1", name: "Old Name" });
		const fresh = makeTask({ id: "t1", name: "New Name" });
		const changes = diffTasks([fresh], [cached]);

		expect(changes).toHaveLength(1);
		expect(changes[0]).toEqual({
			taskId: "t1",
			type: "modified",
			field: "name",
			oldValue: "Old Name",
			newValue: "New Name",
		});
	});

	it("detects modified task completed status", () => {
		const cached = makeTask({ id: "t1", completed: false });
		const fresh = makeTask({ id: "t1", completed: true });
		const changes = diffTasks([fresh], [cached]);

		const completedChange = changes.find((c) => c.field === "completed");
		expect(completedChange).toBeDefined();
		expect(completedChange!.oldValue).toBe(false);
		expect(completedChange!.newValue).toBe(true);
	});

	it("detects modified task dueDate", () => {
		const cached = makeTask({ id: "t1", dueDate: null });
		const fresh = makeTask({ id: "t1", dueDate: "2025-06-01T00:00:00.000Z" });
		const changes = diffTasks([fresh], [cached]);

		const dueDateChange = changes.find((c) => c.field === "dueDate");
		expect(dueDateChange).toBeDefined();
		expect(dueDateChange!.oldValue).toBeNull();
		expect(dueDateChange!.newValue).toBe("2025-06-01T00:00:00.000Z");
	});

	it("detects modified task flagged status", () => {
		const cached = makeTask({ id: "t1", flagged: false });
		const fresh = makeTask({ id: "t1", flagged: true });
		const changes = diffTasks([fresh], [cached]);

		const flaggedChange = changes.find((c) => c.field === "flagged");
		expect(flaggedChange).toBeDefined();
		expect(flaggedChange!.oldValue).toBe(false);
		expect(flaggedChange!.newValue).toBe(true);
	});

	it("detects added tag", () => {
		const cached = makeTask({ id: "t1", tags: [] });
		const fresh = makeTask({
			id: "t1",
			tags: [{ id: "tag1", name: "urgent" }],
		});
		const changes = diffTasks([fresh], [cached]);

		const tagChange = changes.find((c) => c.field === "tags");
		expect(tagChange).toBeDefined();
		expect(tagChange!.type).toBe("modified");
		expect(tagChange!.oldValue).toEqual([]);
		expect(tagChange!.newValue).toEqual(["urgent"]);
	});

	it("detects removed tag", () => {
		const cached = makeTask({
			id: "t1",
			tags: [
				{ id: "tag1", name: "urgent" },
				{ id: "tag2", name: "work" },
			],
		});
		const fresh = makeTask({
			id: "t1",
			tags: [{ id: "tag1", name: "urgent" }],
		});
		const changes = diffTasks([fresh], [cached]);

		const tagChange = changes.find((c) => c.field === "tags");
		expect(tagChange).toBeDefined();
		expect(tagChange!.type).toBe("modified");
		expect(tagChange!.oldValue).toEqual(["urgent", "work"]);
		expect(tagChange!.newValue).toEqual(["urgent"]);
	});
});

describe("diffProjects", () => {
	it("returns empty array when both lists are empty", () => {
		const changes = diffProjects([], []);
		expect(changes).toEqual([]);
	});

	it("detects added project", () => {
		const fresh = [makeProject({ id: "p1" })];
		const changes = diffProjects(fresh, []);

		expect(changes).toHaveLength(1);
		expect(changes[0]).toEqual({ projectId: "p1", type: "added" });
	});

	it("detects removed project", () => {
		const cached = [makeProject({ id: "p1" })];
		const changes = diffProjects([], cached);

		expect(changes).toHaveLength(1);
		expect(changes[0]).toEqual({ projectId: "p1", type: "removed" });
	});

	it("returns empty when fresh and cached are identical", () => {
		const project = makeProject({ id: "p1" });
		const changes = diffProjects([project], [project]);
		expect(changes).toEqual([]);
	});

	it("detects modified project status", () => {
		const cached = makeProject({ id: "p1", status: "active" });
		const fresh = makeProject({ id: "p1", status: "onHold" });
		const changes = diffProjects([fresh], [cached]);

		expect(changes).toHaveLength(1);
		expect(changes[0]).toEqual({
			projectId: "p1",
			type: "modified",
			field: "status",
			oldValue: "active",
			newValue: "onHold",
		});
	});

	it("detects modified project name", () => {
		const cached = makeProject({ id: "p1", name: "Old" });
		const fresh = makeProject({ id: "p1", name: "New" });
		const changes = diffProjects([fresh], [cached]);

		expect(changes).toHaveLength(1);
		expect(changes[0]!.field).toBe("name");
	});

	it("detects modified project dueDate", () => {
		const cached = makeProject({ id: "p1", dueDate: null });
		const fresh = makeProject({
			id: "p1",
			dueDate: "2025-12-01T00:00:00.000Z",
		});
		const changes = diffProjects([fresh], [cached]);

		expect(changes).toHaveLength(1);
		expect(changes[0]!.field).toBe("dueDate");
	});

	it("detects modified project deferDate", () => {
		const cached = makeProject({
			id: "p1",
			deferDate: "2025-01-01T00:00:00.000Z",
		});
		const fresh = makeProject({
			id: "p1",
			deferDate: "2025-06-01T00:00:00.000Z",
		});
		const changes = diffProjects([fresh], [cached]);

		expect(changes).toHaveLength(1);
		expect(changes[0]!.field).toBe("deferDate");
	});
});

describe("computeDiff", () => {
	it("treats everything as added when cache is null", () => {
		const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2" })];
		const projects = [makeProject({ id: "p1" })];

		const result = computeDiff({ tasks, projects }, null);

		expect(result.hasChanges).toBe(true);
		expect(result.taskChanges).toHaveLength(2);
		expect(result.taskChanges.every((c) => c.type === "added")).toBe(true);
		expect(result.projectChanges).toHaveLength(1);
		expect(result.projectChanges[0]!.type).toBe("added");
	});

	it("returns no changes when data is identical", () => {
		const task = makeTask({ id: "t1", projectId: "p1" });
		const project = makeProject({ id: "p1" });
		const projectWithTasks: ProjectWithTasks = { ...project, tasks: [task] };

		const cachedData = makeCacheData([projectWithTasks], []);
		const result = computeDiff(
			{ tasks: [task], projects: [project] },
			cachedData
		);

		expect(result.hasChanges).toBe(false);
		expect(result.taskChanges).toHaveLength(0);
		expect(result.projectChanges).toHaveLength(0);
	});

	it("detects changes from inbox tasks in cache", () => {
		const inboxTask = makeTask({ id: "t1", name: "Old Name" });
		const cachedData = makeCacheData([], [inboxTask]);

		const freshTask = makeTask({ id: "t1", name: "New Name" });
		const result = computeDiff(
			{ tasks: [freshTask], projects: [] },
			cachedData
		);

		expect(result.hasChanges).toBe(true);
		expect(result.taskChanges).toHaveLength(1);
		expect(result.taskChanges[0]!.field).toBe("name");
	});

	it("combines task and project changes", () => {
		const task = makeTask({ id: "t1", projectId: "p1" });
		const project = makeProject({ id: "p1" });
		const projectWithTasks: ProjectWithTasks = { ...project, tasks: [task] };
		const cachedData = makeCacheData([projectWithTasks], []);

		// Modify both the task and add a new project
		const modifiedTask = makeTask({
			id: "t1",
			projectId: "p1",
			flagged: true,
		});
		const newProject = makeProject({ id: "p2", name: "New Project" });

		const result = computeDiff(
			{
				tasks: [modifiedTask],
				projects: [project, newProject],
			},
			cachedData
		);

		expect(result.hasChanges).toBe(true);
		expect(result.taskChanges.length).toBeGreaterThan(0);
		expect(result.projectChanges.length).toBeGreaterThan(0);

		const addedProject = result.projectChanges.find(
			(c) => c.type === "added"
		);
		expect(addedProject).toBeDefined();
		expect(addedProject!.projectId).toBe("p2");
	});
});
