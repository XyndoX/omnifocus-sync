import { describe, it, expect, vi, beforeEach } from "vitest";
import { CacheManager } from "../cache-manager";

const mockRead = vi.fn();
const mockWrite = vi.fn();
const mockExists = vi.fn();
const mockAdapter = {
	read: mockRead,
	write: mockWrite,
	exists: mockExists,
};

describe("CacheManager", () => {
	let manager: CacheManager;

	beforeEach(() => {
		vi.resetAllMocks();
		manager = new CacheManager(mockAdapter as any, "omnifocus-bridge");
	});

	it("returns null when no cache exists", async () => {
		mockExists.mockResolvedValue(false);
		const data = await manager.load();
		expect(data).toBeNull();
	});

	it("loads and parses cached data", async () => {
		const cached = {
			syncedAt: "2025-03-15T10:30:00Z",
			projects: [],
			inboxTasks: [],
			tags: [],
		};
		mockExists.mockResolvedValue(true);
		mockRead.mockResolvedValue(JSON.stringify(cached));

		const data = await manager.load();
		expect(data).toEqual(cached);
	});

	it("saves data as JSON", async () => {
		const data = {
			syncedAt: "2025-03-15T10:30:00Z",
			projects: [],
			inboxTasks: [],
			tags: [],
		};
		await manager.save(data);

		expect(mockWrite).toHaveBeenCalledWith(
			".obsidian/plugins/omnifocus-bridge/cache.json",
			JSON.stringify(data, null, 2)
		);
	});

	it("returns null on corrupt cache", async () => {
		mockExists.mockResolvedValue(true);
		mockRead.mockResolvedValue("not valid json{{{");

		const data = await manager.load();
		expect(data).toBeNull();
	});
});
