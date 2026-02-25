import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseCodeblockConfig, filterTasksByView } from "../codeblock-handler";
import type { OFTask } from "../../types";

const makeTask = (overrides: Partial<OFTask> = {}): OFTask => ({
	id: "task1",
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
});

describe("parseCodeblockConfig", () => {
	it("parses view and format", () => {
		const config = parseCodeblockConfig("view: due-today\nformat: list");
		expect(config.view).toBe("due-today");
		expect(config.format).toBe("list");
	});

	it("parses table format with show columns", () => {
		const config = parseCodeblockConfig(
			"view: flagged\nformat: table\nshow: name, dueDate, project, tags"
		);
		expect(config.format).toBe("table");
		expect(config.show).toEqual(["name", "dueDate", "project", "tags"]);
	});

	it("parses project name with quotes", () => {
		const config = parseCodeblockConfig(
			'view: project\nproject: "Website Redesign"'
		);
		expect(config.view).toBe("project");
		expect(config.project).toBe("Website Redesign");
	});

	it("uses defaults for missing fields", () => {
		const config = parseCodeblockConfig("");
		expect(config.view).toBe("all-active");
		expect(config.format).toBe("list");
		expect(config.show).toEqual(["name", "dueDate", "project", "tags"]);
	});

	it("ignores invalid show columns", () => {
		const config = parseCodeblockConfig("show: name, invalid, dueDate");
		expect(config.show).toEqual(["name", "dueDate"]);
	});

	it("falls back to default columns when all show values are invalid", () => {
		const config = parseCodeblockConfig("show: foo, bar, baz");
		expect(config.show).toEqual(["name", "dueDate", "project", "tags"]);
	});

	it("ignores comment lines", () => {
		const config = parseCodeblockConfig("# this is a comment\nview: flagged");
		expect(config.view).toBe("flagged");
	});

	it("handles extra whitespace", () => {
		const config = parseCodeblockConfig("  view:   due-this-week  \n  format:   table  ");
		expect(config.view).toBe("due-this-week");
		expect(config.format).toBe("table");
	});
});

describe("filterTasksByView", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-25T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("due-today returns tasks due today or overdue", () => {
		const tasks = [
			makeTask({ id: "t1", name: "Due today", dueDate: "2026-02-25T17:00:00Z" }),
			makeTask({ id: "t2", name: "Overdue", dueDate: "2026-02-20T00:00:00Z" }),
			makeTask({ id: "t3", name: "Future", dueDate: "2026-03-01T00:00:00Z" }),
			makeTask({ id: "t4", name: "No date" }),
		];

		const config = parseCodeblockConfig("view: due-today");
		const result = filterTasksByView(tasks, config);

		expect(result.map((t) => t.name)).toEqual(
			expect.arrayContaining(["Due today", "Overdue"])
		);
		expect(result.map((t) => t.name)).not.toContain("Future");
		expect(result.map((t) => t.name)).not.toContain("No date");
	});

	it("due-this-week returns tasks due within 7 days", () => {
		const tasks = [
			makeTask({ id: "t1", name: "Today", dueDate: "2026-02-25T00:00:00Z" }),
			makeTask({ id: "t2", name: "In 3 days", dueDate: "2026-02-28T00:00:00Z" }),
			makeTask({ id: "t3", name: "In 10 days", dueDate: "2026-03-07T00:00:00Z" }),
		];

		const config = parseCodeblockConfig("view: due-this-week");
		const result = filterTasksByView(tasks, config);

		expect(result.map((t) => t.name)).toContain("Today");
		expect(result.map((t) => t.name)).toContain("In 3 days");
		expect(result.map((t) => t.name)).not.toContain("In 10 days");
	});

	it("flagged returns only flagged active tasks", () => {
		const tasks = [
			makeTask({ id: "t1", name: "Flagged", flagged: true }),
			makeTask({ id: "t2", name: "Not flagged", flagged: false }),
			makeTask({ id: "t3", name: "Flagged done", flagged: true, completed: true }),
		];

		const config = parseCodeblockConfig("view: flagged");
		const result = filterTasksByView(tasks, config);

		expect(result).toHaveLength(1);
		expect(result[0]!.name).toBe("Flagged");
	});

	it("all-active returns all non-completed tasks", () => {
		const tasks = [
			makeTask({ id: "t1", name: "Active" }),
			makeTask({ id: "t2", name: "Completed", completed: true }),
		];

		const config = parseCodeblockConfig("view: all-active");
		const result = filterTasksByView(tasks, config);

		expect(result).toHaveLength(1);
		expect(result[0]!.name).toBe("Active");
	});

	it("project filters by project name (case-insensitive)", () => {
		const tasks = [
			makeTask({ id: "t1", name: "Task A", projectName: "Website Redesign" }),
			makeTask({ id: "t2", name: "Task B", projectName: "Other Project" }),
			makeTask({ id: "t3", name: "Task C", projectName: "website redesign" }),
		];

		const config = parseCodeblockConfig('view: project\nproject: "Website Redesign"');
		const result = filterTasksByView(tasks, config);

		expect(result).toHaveLength(2);
		expect(result.map((t) => t.name)).toContain("Task A");
		expect(result.map((t) => t.name)).toContain("Task C");
	});

	it("project view returns empty array when no project specified", () => {
		const tasks = [makeTask({ id: "t1", name: "Task A", projectName: "Foo" })];

		const config = parseCodeblockConfig("view: project");
		const result = filterTasksByView(tasks, config);

		expect(result).toHaveLength(0);
	});
});
