import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncEngine } from "../sync-engine";
import type { OFTask, OFProject, OFTag } from "../../types";
import { DEFAULT_SETTINGS } from "../../types";

// Mock the JXA modules
vi.mock("../../bridge/jxa-runner", () => ({
	runJXA: vi.fn(),
}));

vi.mock("../../bridge/jxa-scripts", () => ({
	buildFetchTasksScript: vi.fn(() => "tasks-script"),
	buildFetchProjectsScript: vi.fn(() => "projects-script"),
	buildFetchTagsScript: vi.fn(() => "tags-script"),
}));

import { runJXA } from "../../bridge/jxa-runner";

const mockCacheManager = { save: vi.fn(), load: vi.fn() };
const mockIdMapper = { load: vi.fn(), save: vi.fn() };
const mockVault = {
	adapter: {
		exists: vi.fn(),
	},
	getAbstractFileByPath: vi.fn(),
	createFolder: vi.fn(),
	create: vi.fn(),
	modify: vi.fn(),
};

describe("SyncEngine", () => {
	let engine: SyncEngine;

	beforeEach(() => {
		vi.clearAllMocks();
		mockIdMapper.load.mockResolvedValue({ tasks: {}, projects: {} });
		mockVault.adapter.exists.mockResolvedValue(false);
		mockVault.getAbstractFileByPath.mockReturnValue(null);

		engine = new SyncEngine(
			mockVault as any,
			mockCacheManager as any,
			mockIdMapper as any,
			DEFAULT_SETTINGS
		);
	});

	it("groups tasks by project and renders files", async () => {
		const tasks: OFTask[] = [
			{
				id: "t1", name: "Task in project", note: null,
				completed: false, completionDate: null, dueDate: null, deferDate: null,
				flagged: false, estimatedMinutes: null, taskStatus: "Available",
				projectId: "p1", projectName: "My Project", tags: [],
				added: null, modified: null,
			},
			{
				id: "t2", name: "Inbox task", note: null,
				completed: false, completionDate: null, dueDate: null, deferDate: null,
				flagged: false, estimatedMinutes: null, taskStatus: "Available",
				projectId: null, projectName: null, tags: [],
				added: null, modified: null,
			},
		];
		const projects: OFProject[] = [
			{
				id: "p1", name: "My Project", note: null, status: "active",
				dueDate: null, deferDate: null, sequential: false, folderName: null, folderPath: null,
			},
		];
		const tags: OFTag[] = [];

		vi.mocked(runJXA)
			.mockResolvedValueOnce(JSON.stringify(projects))
			.mockResolvedValueOnce(JSON.stringify(tasks))
			.mockResolvedValueOnce(JSON.stringify(tags));

		const result = await engine.sync();

		expect(result.projects).toHaveLength(1);
		expect(result.projects[0]!.tasks).toHaveLength(1);
		expect(result.projects[0]!.tasks[0]!.name).toBe("Task in project");
		expect(result.inboxTasks).toHaveLength(1);
		expect(result.inboxTasks[0]!.name).toBe("Inbox task");
	});

	it("creates sync folder if it doesn't exist", async () => {
		vi.mocked(runJXA)
			.mockResolvedValueOnce("[]")
			.mockResolvedValueOnce("[]")
			.mockResolvedValueOnce("[]");

		await engine.sync();

		expect(mockVault.createFolder).toHaveBeenCalledWith("OmniFocus");
	});

	it("writes project markdown files", async () => {
		const tasks: OFTask[] = [{
			id: "t1", name: "A task", note: null,
			completed: false, completionDate: null, dueDate: null, deferDate: null,
			flagged: false, estimatedMinutes: null, taskStatus: "Available",
			projectId: "p1", projectName: "TestProj", tags: [],
			added: null, modified: null,
		}];
		const projects: OFProject[] = [{
			id: "p1", name: "TestProj", note: null, status: "active",
			dueDate: null, deferDate: null, sequential: false, folderName: null, folderPath: null,
		}];

		vi.mocked(runJXA)
			.mockResolvedValueOnce(JSON.stringify(projects))
			.mockResolvedValueOnce(JSON.stringify(tasks))
			.mockResolvedValueOnce("[]");

		await engine.sync();

		expect(mockVault.create).toHaveBeenCalledWith(
			"OmniFocus/TestProj.md",
			expect.stringContaining("# TestProj")
		);
	});

	it("saves cache and ID map after sync", async () => {
		vi.mocked(runJXA)
			.mockResolvedValueOnce("[]")
			.mockResolvedValueOnce("[]")
			.mockResolvedValueOnce("[]");

		await engine.sync();

		expect(mockCacheManager.save).toHaveBeenCalledOnce();
		expect(mockIdMapper.save).toHaveBeenCalledOnce();
	});
});
