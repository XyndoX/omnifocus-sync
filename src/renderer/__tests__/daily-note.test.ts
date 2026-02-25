import { describe, it, expect } from "vitest";
import { generateDailyNoteSection } from "../daily-note";
import type { OFTask } from "../../types";
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

const DATE = "2026-02-25";

describe("generateDailyNoteSection", () => {
	it("renders all sections with (none) when no tasks match", () => {
		const result = generateDailyNoteSection([], DATE, DEFAULT_SETTINGS);

		expect(result).toContain("## OmniFocus");
		expect(result).toContain("### Due Today");
		expect(result).toContain("### Overdue");
		expect(result).toContain("### Flagged");

		const sections = result.split("### ");
		const dueToday = sections.find((s) => s.startsWith("Due Today"));
		expect(dueToday).toContain("(none)");

		const overdue = sections.find((s) => s.startsWith("Overdue"));
		expect(overdue).toContain("(none)");

		const flagged = sections.find((s) => s.startsWith("Flagged"));
		expect(flagged).toContain("(none)");
	});

	it("places tasks due on the given date in Due Today", () => {
		const tasks = [
			makeTask({
				id: "t1",
				name: "Due today task",
				dueDate: "2026-02-25T17:00:00Z",
			}),
		];

		const result = generateDailyNoteSection(tasks, DATE, DEFAULT_SETTINGS);

		const sections = result.split("### ");
		const dueToday = sections.find((s) => s.startsWith("Due Today"));
		expect(dueToday).toContain("Due today task");
	});

	it("places tasks due before the given date in Overdue", () => {
		const tasks = [
			makeTask({
				id: "t1",
				name: "Overdue task",
				dueDate: "2026-02-20T00:00:00Z",
			}),
		];

		const result = generateDailyNoteSection(tasks, DATE, DEFAULT_SETTINGS);

		const sections = result.split("### ");
		const overdue = sections.find((s) => s.startsWith("Overdue"));
		expect(overdue).toContain("Overdue task");
	});

	it("places flagged tasks (without due dates) in Flagged", () => {
		const tasks = [
			makeTask({
				id: "t1",
				name: "Flagged task",
				flagged: true,
			}),
		];

		const result = generateDailyNoteSection(tasks, DATE, DEFAULT_SETTINGS);

		const sections = result.split("### ");
		const flagged = sections.find((s) => s.startsWith("Flagged"));
		expect(flagged).toContain("Flagged task");
	});

	it("does not duplicate flagged tasks that are also due today", () => {
		const tasks = [
			makeTask({
				id: "t1",
				name: "Flagged and due",
				flagged: true,
				dueDate: "2026-02-25T17:00:00Z",
			}),
		];

		const result = generateDailyNoteSection(tasks, DATE, DEFAULT_SETTINGS);

		const sections = result.split("### ");
		const dueToday = sections.find((s) => s.startsWith("Due Today"));
		expect(dueToday).toContain("Flagged and due");

		const flagged = sections.find((s) => s.startsWith("Flagged"));
		expect(flagged).toContain("(none)");
	});

	it("does not duplicate flagged overdue tasks in Flagged section", () => {
		const tasks = [
			makeTask({
				id: "t1",
				name: "Flagged overdue",
				flagged: true,
				dueDate: "2026-02-20T00:00:00Z",
			}),
		];

		const result = generateDailyNoteSection(tasks, DATE, DEFAULT_SETTINGS);

		const sections = result.split("### ");
		const overdue = sections.find((s) => s.startsWith("Overdue"));
		expect(overdue).toContain("Flagged overdue");

		const flagged = sections.find((s) => s.startsWith("Flagged"));
		expect(flagged).toContain("(none)");
	});

	it("excludes completed tasks", () => {
		const tasks = [
			makeTask({
				id: "t1",
				name: "Completed task",
				completed: true,
				completionDate: "2026-02-24T00:00:00Z",
				dueDate: "2026-02-25T00:00:00Z",
			}),
		];

		const result = generateDailyNoteSection(tasks, DATE, DEFAULT_SETTINGS);

		const sections = result.split("### ");
		const dueToday = sections.find((s) => s.startsWith("Due Today"));
		expect(dueToday).toContain("(none)");
	});

	it("renders task lines using renderTaskLine format", () => {
		const tasks = [
			makeTask({
				id: "t1",
				name: "Buy milk",
				dueDate: "2026-02-25T00:00:00Z",
			}),
		];

		const result = generateDailyNoteSection(tasks, DATE, DEFAULT_SETTINGS);

		// Should contain the standard task line format with checkbox and OF comment
		expect(result).toContain("- [ ] Buy milk");
		expect(result).toContain("<!-- of:t1 -->");
	});

	it("handles tasks due in the future (not included in any section)", () => {
		const tasks = [
			makeTask({
				id: "t1",
				name: "Future task",
				dueDate: "2026-03-15T00:00:00Z",
			}),
		];

		const result = generateDailyNoteSection(tasks, DATE, DEFAULT_SETTINGS);

		expect(result).not.toContain("Future task");
	});

	it("handles mixed tasks across all sections", () => {
		const tasks = [
			makeTask({
				id: "t1",
				name: "Overdue item",
				dueDate: "2026-02-20T00:00:00Z",
			}),
			makeTask({
				id: "t2",
				name: "Today item",
				dueDate: "2026-02-25T12:00:00Z",
			}),
			makeTask({
				id: "t3",
				name: "Flagged item",
				flagged: true,
			}),
			makeTask({
				id: "t4",
				name: "Future item",
				dueDate: "2026-03-01T00:00:00Z",
			}),
		];

		const result = generateDailyNoteSection(tasks, DATE, DEFAULT_SETTINGS);

		const sections = result.split("### ");
		const dueToday = sections.find((s) => s.startsWith("Due Today"));
		expect(dueToday).toContain("Today item");

		const overdue = sections.find((s) => s.startsWith("Overdue"));
		expect(overdue).toContain("Overdue item");

		const flagged = sections.find((s) => s.startsWith("Flagged"));
		expect(flagged).toContain("Flagged item");

		// Future task should not appear anywhere
		expect(result).not.toContain("Future item");
	});
});
