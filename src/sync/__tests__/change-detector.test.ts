import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChangeDetector } from "../change-detector";
import { DEFAULT_SETTINGS } from "../../types";
import type { CacheData, OFTask, PluginSettings } from "../../types";

// ---------------------------------------------------------------------------
// Mock JXA runner + write scripts
// ---------------------------------------------------------------------------

vi.mock("../../bridge/jxa-runner", () => ({
	runJXA: vi.fn().mockResolvedValue('{"success":true}'),
}));

vi.mock("../../bridge/jxa-write-scripts", () => ({
	buildMarkCompleteScript: vi.fn((id: string) => `complete:${id}`),
	buildMarkIncompleteScript: vi.fn((id: string) => `incomplete:${id}`),
}));

// Mock obsidian Notice
vi.mock("obsidian", () => ({
	Notice: vi.fn(),
}));

import { runJXA } from "../../bridge/jxa-runner";
import {
	buildMarkCompleteScript,
	buildMarkIncompleteScript,
} from "../../bridge/jxa-write-scripts";
import { Notice } from "obsidian";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<OFTask> & { id: string }): OFTask {
	return {
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

function makeCacheData(tasks: OFTask[]): CacheData {
	const inboxTasks = tasks.filter((t) => !t.projectId);
	const projectTasks = tasks.filter((t) => t.projectId);

	return {
		syncedAt: "2026-01-01T00:00:00.000Z",
		projects:
			projectTasks.length > 0
				? [
						{
							id: "p1",
							name: "Test Project",
							note: null,
							status: "active" as const,
							dueDate: null,
							deferDate: null,
							sequential: false,
							folderName: null,
							folderPath: null,
							tasks: projectTasks,
						},
					]
				: [],
		inboxTasks,
		tags: [],
	};
}

/** Builds a markdown file content with task lines. */
function buildMarkdown(
	lines: { checked: boolean; name: string; id: string }[]
): string {
	const taskLines = lines.map(
		(l) => `- [${l.checked ? "x" : " "}] ${l.name} <!-- of:${l.id} -->`
	);
	return ["# Test Project", "", ...taskLines, ""].join("\n");
}

// ---------------------------------------------------------------------------
// Mock vault & cache
// ---------------------------------------------------------------------------

function createMockVault() {
	const listeners: Map<string, ((...args: any[]) => void)[]> = new Map();

	return {
		on: vi.fn((event: string, callback: (...args: any[]) => void) => {
			const existing = listeners.get(event) ?? [];
			existing.push(callback);
			listeners.set(event, existing);
			return { event, callback }; // EventRef
		}),
		offref: vi.fn((ref: { event: string; callback: (...args: any[]) => void }) => {
			const existing = listeners.get(ref.event) ?? [];
			listeners.set(
				ref.event,
				existing.filter((cb) => cb !== ref.callback)
			);
		}),
		read: vi.fn().mockResolvedValue(""),
		// Helper to simulate a file modify event
		_trigger(event: string, ...args: any[]) {
			const cbs = listeners.get(event) ?? [];
			for (const cb of cbs) {
				cb(...args);
			}
		},
	};
}

function createMockCache(data: CacheData | null = null) {
	return {
		load: vi.fn().mockResolvedValue(data),
		save: vi.fn().mockResolvedValue(undefined),
		getLastSyncTime: vi.fn().mockResolvedValue(data?.syncedAt ?? null),
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChangeDetector", () => {
	let mockVault: ReturnType<typeof createMockVault>;
	let mockCache: ReturnType<typeof createMockCache>;
	let settings: PluginSettings;
	let detector: ChangeDetector;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		settings = { ...DEFAULT_SETTINGS };
		mockVault = createMockVault();
		mockCache = createMockCache();
		detector = new ChangeDetector(
			mockVault as any,
			mockCache as any,
			settings
		);
	});

	afterEach(() => {
		detector.stop();
		vi.useRealTimers();
	});

	// -------------------------------------------------------------------
	// File filtering
	// -------------------------------------------------------------------

	describe("file filtering", () => {
		it("only processes .md files inside the sync folder", async () => {
			const task = makeTask({ id: "abc123", completed: false });
			const cache = makeCacheData([task]);
			mockCache.load.mockResolvedValue(cache);
			mockVault.read.mockResolvedValue(
				buildMarkdown([{ checked: true, name: "Task", id: "abc123" }])
			);

			detector.start();

			// File inside sync folder -- should be processed
			mockVault._trigger("modify", {
				path: "OmniFocus/Project.md",
			});

			vi.advanceTimersByTime(600);
			await vi.waitFor(() => {
				expect(mockVault.read).toHaveBeenCalledTimes(1);
			});
		});

		it("ignores files outside the sync folder", async () => {
			detector.start();

			mockVault._trigger("modify", {
				path: "Other/notes.md",
			});

			vi.advanceTimersByTime(600);

			// Should not have attempted to read the file
			expect(mockVault.read).not.toHaveBeenCalled();
		});

		it("ignores non-markdown files inside the sync folder", async () => {
			detector.start();

			mockVault._trigger("modify", {
				path: "OmniFocus/data.json",
			});

			vi.advanceTimersByTime(600);

			expect(mockVault.read).not.toHaveBeenCalled();
		});
	});

	// -------------------------------------------------------------------
	// Checkbox change detection
	// -------------------------------------------------------------------

	describe("checkbox change detection", () => {
		it("detects unchecked -> checked and calls markComplete", async () => {
			const task = makeTask({ id: "task1", completed: false });
			const cache = makeCacheData([task]);
			mockCache.load.mockResolvedValue(cache);

			// File now has the task checked
			mockVault.read.mockResolvedValue(
				buildMarkdown([{ checked: true, name: "Buy milk", id: "task1" }])
			);

			detector.start();

			mockVault._trigger("modify", {
				path: "OmniFocus/Inbox.md",
			});

			vi.advanceTimersByTime(600);

			await vi.waitFor(() => {
				expect(buildMarkCompleteScript).toHaveBeenCalledWith("task1");
				expect(runJXA).toHaveBeenCalledWith("complete:task1");
			});
		});

		it("detects checked -> unchecked and calls markIncomplete", async () => {
			const task = makeTask({
				id: "task2",
				completed: true,
				completionDate: "2026-01-15T00:00:00.000Z",
			});
			const cache = makeCacheData([task]);
			mockCache.load.mockResolvedValue(cache);

			// File now has the task unchecked
			mockVault.read.mockResolvedValue(
				buildMarkdown([
					{ checked: false, name: "Review docs", id: "task2" },
				])
			);

			detector.start();

			mockVault._trigger("modify", {
				path: "OmniFocus/Inbox.md",
			});

			vi.advanceTimersByTime(600);

			await vi.waitFor(() => {
				expect(buildMarkIncompleteScript).toHaveBeenCalledWith("task2");
				expect(runJXA).toHaveBeenCalledWith("incomplete:task2");
			});
		});

		it("does not call JXA when checkbox state matches cache", async () => {
			const task = makeTask({ id: "task3", completed: false });
			const cache = makeCacheData([task]);
			mockCache.load.mockResolvedValue(cache);

			// File still unchecked -- no change
			mockVault.read.mockResolvedValue(
				buildMarkdown([
					{ checked: false, name: "No change", id: "task3" },
				])
			);

			detector.start();

			mockVault._trigger("modify", {
				path: "OmniFocus/Project.md",
			});

			vi.advanceTimersByTime(600);

			// Give time for the async processFile to complete
			await vi.waitFor(() => {
				expect(mockVault.read).toHaveBeenCalledTimes(1);
			});

			expect(runJXA).not.toHaveBeenCalled();
		});

		it("handles multiple task changes in a single file", async () => {
			const task1 = makeTask({ id: "t1", completed: false });
			const task2 = makeTask({ id: "t2", completed: true });
			const cache = makeCacheData([task1, task2]);
			mockCache.load.mockResolvedValue(cache);

			mockVault.read.mockResolvedValue(
				buildMarkdown([
					{ checked: true, name: "Task 1", id: "t1" },
					{ checked: false, name: "Task 2", id: "t2" },
				])
			);

			detector.start();

			mockVault._trigger("modify", {
				path: "OmniFocus/Inbox.md",
			});

			vi.advanceTimersByTime(600);

			await vi.waitFor(() => {
				expect(runJXA).toHaveBeenCalledTimes(2);
			});

			expect(buildMarkCompleteScript).toHaveBeenCalledWith("t1");
			expect(buildMarkIncompleteScript).toHaveBeenCalledWith("t2");
		});

		it("updates cache after successful write-back", async () => {
			const task = makeTask({ id: "task4", completed: false });
			const cache = makeCacheData([task]);
			mockCache.load.mockResolvedValue(cache);

			mockVault.read.mockResolvedValue(
				buildMarkdown([
					{ checked: true, name: "Done", id: "task4" },
				])
			);

			detector.start();

			mockVault._trigger("modify", {
				path: "OmniFocus/Inbox.md",
			});

			vi.advanceTimersByTime(600);

			await vi.waitFor(() => {
				expect(mockCache.save).toHaveBeenCalledTimes(1);
			});

			// Verify the saved cache reflects the new completed state
			const savedData = mockCache.save.mock.calls[0]![0] as CacheData;
			const updatedTask = savedData.inboxTasks.find(
				(t) => t.id === "task4"
			);
			expect(updatedTask?.completed).toBe(true);
		});

		it("detects tasks in project tasks (not just inbox)", async () => {
			const task = makeTask({
				id: "pt1",
				completed: false,
				projectId: "p1",
				projectName: "Test Project",
			});
			const cache = makeCacheData([task]);
			mockCache.load.mockResolvedValue(cache);

			mockVault.read.mockResolvedValue(
				buildMarkdown([
					{ checked: true, name: "Project task", id: "pt1" },
				])
			);

			detector.start();

			mockVault._trigger("modify", {
				path: "OmniFocus/Test Project.md",
			});

			vi.advanceTimersByTime(600);

			await vi.waitFor(() => {
				expect(buildMarkCompleteScript).toHaveBeenCalledWith("pt1");
				expect(runJXA).toHaveBeenCalledWith("complete:pt1");
			});
		});
	});

	// -------------------------------------------------------------------
	// Debounce behavior
	// -------------------------------------------------------------------

	describe("debounce", () => {
		it("debounces rapid changes on the same file", async () => {
			const task = makeTask({ id: "d1", completed: false });
			const cache = makeCacheData([task]);
			mockCache.load.mockResolvedValue(cache);
			mockVault.read.mockResolvedValue(
				buildMarkdown([{ checked: true, name: "Task", id: "d1" }])
			);

			detector.start();

			const file = { path: "OmniFocus/Project.md" };

			// Fire modify events rapidly
			mockVault._trigger("modify", file);
			vi.advanceTimersByTime(100);
			mockVault._trigger("modify", file);
			vi.advanceTimersByTime(100);
			mockVault._trigger("modify", file);

			// Not enough time has passed since last event
			vi.advanceTimersByTime(400);

			// Now the debounce should have fired (500ms after the last event)
			await vi.waitFor(() => {
				expect(mockVault.read).toHaveBeenCalledTimes(1);
			});
		});

		it("processes two different files independently", async () => {
			const task1 = makeTask({ id: "f1", completed: false });
			const task2 = makeTask({ id: "f2", completed: false });
			const cache = makeCacheData([task1, task2]);
			mockCache.load.mockResolvedValue(cache);

			// Different content for each file read
			mockVault.read
				.mockResolvedValueOnce(
					buildMarkdown([{ checked: true, name: "Task 1", id: "f1" }])
				)
				.mockResolvedValueOnce(
					buildMarkdown([{ checked: true, name: "Task 2", id: "f2" }])
				);

			detector.start();

			// Modify two different files
			mockVault._trigger("modify", {
				path: "OmniFocus/File1.md",
			});
			mockVault._trigger("modify", {
				path: "OmniFocus/File2.md",
			});

			vi.advanceTimersByTime(600);

			await vi.waitFor(() => {
				expect(mockVault.read).toHaveBeenCalledTimes(2);
			});
		});
	});

	// -------------------------------------------------------------------
	// Error handling
	// -------------------------------------------------------------------

	describe("error handling", () => {
		it("shows Notice on JXA failure", async () => {
			const task = makeTask({ id: "err1", completed: false });
			const cache = makeCacheData([task]);
			mockCache.load.mockResolvedValue(cache);
			mockVault.read.mockResolvedValue(
				buildMarkdown([{ checked: true, name: "Fail", id: "err1" }])
			);

			vi.mocked(runJXA).mockRejectedValueOnce(
				new Error("OmniFocus not available")
			);

			detector.start();

			mockVault._trigger("modify", {
				path: "OmniFocus/Project.md",
			});

			vi.advanceTimersByTime(600);

			await vi.waitFor(() => {
				expect(Notice).toHaveBeenCalledWith(
					expect.stringContaining("Failed to update OmniFocus")
				);
			});
		});

		it("does not update cache on JXA failure", async () => {
			const task = makeTask({ id: "err2", completed: false });
			const cache = makeCacheData([task]);
			mockCache.load.mockResolvedValue(cache);
			mockVault.read.mockResolvedValue(
				buildMarkdown([
					{ checked: true, name: "Fail Task", id: "err2" },
				])
			);

			vi.mocked(runJXA).mockRejectedValueOnce(new Error("fail"));

			detector.start();

			mockVault._trigger("modify", {
				path: "OmniFocus/Project.md",
			});

			vi.advanceTimersByTime(600);

			await vi.waitFor(() => {
				expect(runJXA).toHaveBeenCalledTimes(1);
			});

			expect(mockCache.save).not.toHaveBeenCalled();
		});
	});

	// -------------------------------------------------------------------
	// Lifecycle
	// -------------------------------------------------------------------

	describe("lifecycle", () => {
		it("registers a modify event listener on start", () => {
			detector.start();
			expect(mockVault.on).toHaveBeenCalledWith(
				"modify",
				expect.any(Function)
			);
		});

		it("unregisters listener on stop", () => {
			detector.start();
			detector.stop();
			expect(mockVault.offref).toHaveBeenCalled();
		});

		it("start returns a cleanup function that calls stop", () => {
			const cleanup = detector.start();
			cleanup();
			expect(mockVault.offref).toHaveBeenCalled();
		});

		it("does not process events after stop", async () => {
			detector.start();
			detector.stop();

			mockVault._trigger("modify", {
				path: "OmniFocus/Project.md",
			});

			vi.advanceTimersByTime(600);

			expect(mockVault.read).not.toHaveBeenCalled();
		});

		it("ignores files when cache returns null", async () => {
			mockCache.load.mockResolvedValue(null);
			mockVault.read.mockResolvedValue(
				buildMarkdown([{ checked: true, name: "Task", id: "t1" }])
			);

			detector.start();

			mockVault._trigger("modify", {
				path: "OmniFocus/Project.md",
			});

			vi.advanceTimersByTime(600);

			await vi.waitFor(() => {
				expect(mockVault.read).toHaveBeenCalledTimes(1);
			});

			expect(runJXA).not.toHaveBeenCalled();
		});
	});
});
