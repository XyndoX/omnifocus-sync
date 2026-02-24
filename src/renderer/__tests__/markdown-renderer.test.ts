import { describe, it, expect } from "vitest";
import {
	renderTaskLine,
	renderProjectFile,
	renderInboxFile,
	sortTasks,
} from "../markdown-renderer";
import type { OFTask, ProjectWithTasks, PluginSettings } from "../../types";
import { DEFAULT_SETTINGS } from "../../types";

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

describe("renderTaskLine", () => {
	it("renders a simple uncompleted task", () => {
		const task = makeTask({ id: "abc123", name: "Buy milk" });
		const line = renderTaskLine(task, DEFAULT_SETTINGS);
		expect(line).toBe("- [ ] Buy milk <!-- of:abc123 -->");
	});

	it("renders a completed task with completion date", () => {
		const task = makeTask({
			id: "def456",
			name: "Done task",
			completed: true,
			completionDate: "2025-03-10T00:00:00.000Z",
		});
		const line = renderTaskLine(task, DEFAULT_SETTINGS);
		expect(line).toContain("- [x] Done task");
		expect(line).toContain("✅ 2025-03-10");
		expect(line).toContain("<!-- of:def456 -->");
	});

	it("renders due date when enabled", () => {
		const task = makeTask({ dueDate: "2025-03-15T00:00:00.000Z" });
		const line = renderTaskLine(task, DEFAULT_SETTINGS);
		expect(line).toContain("📅 2025-03-15");
	});

	it("hides due date when disabled", () => {
		const task = makeTask({ dueDate: "2025-03-15T00:00:00.000Z" });
		const settings = { ...DEFAULT_SETTINGS, showDueDate: false };
		const line = renderTaskLine(task, settings);
		expect(line).not.toContain("📅");
	});

	it("renders tags with prefix", () => {
		const task = makeTask({
			tags: [
				{ id: "t1", name: "Work" },
				{ id: "t2", name: "Urgent" },
			],
		});
		const line = renderTaskLine(task, DEFAULT_SETTINGS);
		expect(line).toContain("🏷️ #of/Work #of/Urgent");
	});

	it("renders flagged indicator", () => {
		const task = makeTask({ flagged: true });
		const line = renderTaskLine(task, DEFAULT_SETTINGS);
		expect(line).toContain("🚩");
	});

	it("renders estimated minutes", () => {
		const task = makeTask({ estimatedMinutes: 30 });
		const line = renderTaskLine(task, DEFAULT_SETTINGS);
		expect(line).toContain("⏱️ 30min");
	});

	it("hides estimate when disabled", () => {
		const task = makeTask({ estimatedMinutes: 30 });
		const settings = { ...DEFAULT_SETTINGS, showEstimate: false };
		const line = renderTaskLine(task, settings);
		expect(line).not.toContain("⏱️");
	});

	it("sanitizes tag names with spaces", () => {
		const task = makeTask({
			tags: [{ id: "t1", name: "High Priority" }],
		});
		const line = renderTaskLine(task, DEFAULT_SETTINGS);
		expect(line).toContain("#of/High-Priority");
		expect(line).not.toContain("#of/High Priority");
	});

	it("renders OmniFocus deep link when enabled", () => {
		const task = makeTask({ id: "abc123" });
		const settings = { ...DEFAULT_SETTINGS, showOFLink: true };
		const line = renderTaskLine(task, settings);
		expect(line).toContain("[OF](omnifocus:///task/abc123)");
	});

	it("hides OmniFocus deep link when disabled", () => {
		const task = makeTask({ id: "abc123" });
		const line = renderTaskLine(task, DEFAULT_SETTINGS);
		expect(line).not.toContain("omnifocus:///task/");
	});
});

describe("sortTasks", () => {
	it("puts active tasks before completed tasks", () => {
		const tasks = [
			makeTask({ id: "1", name: "Completed", completed: true }),
			makeTask({ id: "2", name: "Active", completed: false }),
		];
		const sorted = sortTasks(tasks);
		expect(sorted[0]!.name).toBe("Active");
		expect(sorted[1]!.name).toBe("Completed");
	});

	it("puts flagged tasks first among active", () => {
		const tasks = [
			makeTask({ id: "1", name: "Normal" }),
			makeTask({ id: "2", name: "Flagged", flagged: true }),
		];
		const sorted = sortTasks(tasks);
		expect(sorted[0]!.name).toBe("Flagged");
	});

	it("sorts by due date (earliest first) after flag", () => {
		const tasks = [
			makeTask({ id: "1", name: "Later", dueDate: "2025-03-20T00:00:00Z" }),
			makeTask({ id: "2", name: "Sooner", dueDate: "2025-03-15T00:00:00Z" }),
			makeTask({ id: "3", name: "No date" }),
		];
		const sorted = sortTasks(tasks);
		expect(sorted[0]!.name).toBe("Sooner");
		expect(sorted[1]!.name).toBe("Later");
		expect(sorted[2]!.name).toBe("No date");
	});
});

describe("renderProjectFile", () => {
	it("renders frontmatter and task list", () => {
		const project: ProjectWithTasks = {
			id: "proj1",
			name: "Website Redesign",
			note: null,
			status: "active",
			dueDate: null,
			deferDate: null,
			sequential: false,
			folderName: null,
			tasks: [
				makeTask({ id: "t1", name: "Design mockups", flagged: true }),
				makeTask({ id: "t2", name: "Write copy", dueDate: "2025-03-18T00:00:00Z" }),
			],
		};

		const md = renderProjectFile(project, "2025-03-15T10:30:00Z", DEFAULT_SETTINGS);
		expect(md).toContain('omnifocus-project-id: "proj1"');
		expect(md).toContain('omnifocus-status: "active"');
		expect(md).toContain("# Website Redesign");
		expect(md).toContain("Design mockups");
		expect(md).toContain("Write copy");
	});
});

describe("renderInboxFile", () => {
	it("renders inbox with frontmatter", () => {
		const tasks = [makeTask({ id: "t1", name: "Random thought" })];
		const md = renderInboxFile(tasks, "2025-03-15T10:30:00Z", DEFAULT_SETTINGS);
		expect(md).toContain("omnifocus-last-sync:");
		expect(md).toContain("# Inbox");
		expect(md).toContain("Random thought");
	});
});
