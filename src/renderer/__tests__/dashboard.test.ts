import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildDashboardMarkdown } from "../dashboard";
import type { OFTask, CacheData, PluginSettings } from "../../types";
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

const makeCacheData = (tasks: OFTask[]): CacheData => ({
	syncedAt: "2026-02-25T10:00:00Z",
	projects: [
		{
			id: "proj1",
			name: "Test Project",
			note: null,
			status: "active",
			dueDate: null,
			deferDate: null,
			sequential: false,
			folderName: null,
			folderPath: null,
			tasks,
		},
	],
	inboxTasks: [],
	tags: [],
});

describe("buildDashboardMarkdown", () => {
	beforeEach(() => {
		// Fix "today" to 2026-02-25 for deterministic tests
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-25T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("renders all sections with (none) when no tasks", () => {
		const cacheData = makeCacheData([]);
		const md = buildDashboardMarkdown(cacheData, DEFAULT_SETTINGS);

		expect(md).toContain("# OmniFocus Dashboard");
		expect(md).toContain("## Overdue");
		expect(md).toContain("## Due Today");
		expect(md).toContain("## Due This Week");
		expect(md).toContain("## Flagged");
		expect(md).toContain("## Statistics");

		// All sections should show (none)
		const sections = md.split("## ");
		const overdueSection = sections.find((s) => s.startsWith("Overdue"));
		expect(overdueSection).toContain("(none)");

		const dueTodaySection = sections.find((s) => s.startsWith("Due Today"));
		expect(dueTodaySection).toContain("(none)");
	});

	it("places overdue tasks in the Overdue section", () => {
		const cacheData = makeCacheData([
			makeTask({
				id: "t1",
				name: "Overdue task",
				dueDate: "2026-02-20T00:00:00Z",
			}),
		]);

		const md = buildDashboardMarkdown(cacheData, DEFAULT_SETTINGS);

		// The overdue section should contain the task
		const sections = md.split("## ");
		const overdueSection = sections.find((s) => s.startsWith("Overdue"));
		expect(overdueSection).toContain("Overdue task");
	});

	it("places tasks due today in the Due Today section", () => {
		const cacheData = makeCacheData([
			makeTask({
				id: "t1",
				name: "Today task",
				dueDate: "2026-02-25T17:00:00Z",
			}),
		]);

		const md = buildDashboardMarkdown(cacheData, DEFAULT_SETTINGS);

		const sections = md.split("## ");
		const dueTodaySection = sections.find((s) => s.startsWith("Due Today"));
		expect(dueTodaySection).toContain("Today task");
	});

	it("places tasks due this week in the Due This Week section", () => {
		const cacheData = makeCacheData([
			makeTask({
				id: "t1",
				name: "This week task",
				dueDate: "2026-02-28T00:00:00Z",
			}),
		]);

		const md = buildDashboardMarkdown(cacheData, DEFAULT_SETTINGS);

		const sections = md.split("## ");
		const weekSection = sections.find((s) => s.startsWith("Due This Week"));
		expect(weekSection).toContain("This week task");
	});

	it("places flagged tasks not in due sections in Flagged section", () => {
		const cacheData = makeCacheData([
			makeTask({
				id: "t1",
				name: "Flagged no date",
				flagged: true,
			}),
		]);

		const md = buildDashboardMarkdown(cacheData, DEFAULT_SETTINGS);

		const sections = md.split("## ");
		const flaggedSection = sections.find((s) => s.startsWith("Flagged"));
		expect(flaggedSection).toContain("Flagged no date");
	});

	it("does not duplicate flagged tasks that are also due today", () => {
		const cacheData = makeCacheData([
			makeTask({
				id: "t1",
				name: "Flagged and due",
				flagged: true,
				dueDate: "2026-02-25T17:00:00Z",
			}),
		]);

		const md = buildDashboardMarkdown(cacheData, DEFAULT_SETTINGS);

		const sections = md.split("## ");
		const flaggedSection = sections.find((s) => s.startsWith("Flagged"));
		// The flagged section should NOT contain this task because it's in Due Today
		expect(flaggedSection).toContain("(none)");

		const dueTodaySection = sections.find((s) => s.startsWith("Due Today"));
		expect(dueTodaySection).toContain("Flagged and due");
	});

	it("excludes completed tasks from active sections", () => {
		const cacheData = makeCacheData([
			makeTask({
				id: "t1",
				name: "Completed task",
				completed: true,
				completionDate: "2026-02-24T00:00:00Z",
				dueDate: "2026-02-25T00:00:00Z",
			}),
		]);

		const md = buildDashboardMarkdown(cacheData, DEFAULT_SETTINGS);

		const sections = md.split("## ");
		const dueTodaySection = sections.find((s) => s.startsWith("Due Today"));
		expect(dueTodaySection).toContain("(none)");
	});

	it("renders correct statistics", () => {
		const cacheData = makeCacheData([
			makeTask({ id: "t1", name: "Active 1" }),
			makeTask({ id: "t2", name: "Active 2", dueDate: "2026-02-20T00:00:00Z" }),
			makeTask({
				id: "t3",
				name: "Completed",
				completed: true,
				completionDate: "2026-02-22T00:00:00Z",
			}),
		]);

		const md = buildDashboardMarkdown(cacheData, DEFAULT_SETTINGS);

		expect(md).toContain("**Total Open:** 2");
		expect(md).toContain("**Completed This Week:** 1");
		expect(md).toContain("**Overdue:** 1");
	});

	it("includes frontmatter with sync timestamp", () => {
		const cacheData = makeCacheData([]);
		const md = buildDashboardMarkdown(cacheData, DEFAULT_SETTINGS);

		expect(md).toContain("omnifocus-dashboard: true");
		expect(md).toContain('omnifocus-last-sync: "2026-02-25T10:00:00Z"');
	});

	it("includes inbox tasks", () => {
		const cacheData: CacheData = {
			syncedAt: "2026-02-25T10:00:00Z",
			projects: [],
			inboxTasks: [
				makeTask({
					id: "inbox1",
					name: "Inbox overdue",
					dueDate: "2026-02-20T00:00:00Z",
				}),
			],
			tags: [],
		};

		const md = buildDashboardMarkdown(cacheData, DEFAULT_SETTINGS);

		const sections = md.split("## ");
		const overdueSection = sections.find((s) => s.startsWith("Overdue"));
		expect(overdueSection).toContain("Inbox overdue");
	});
});
