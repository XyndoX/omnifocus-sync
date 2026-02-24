import { describe, it, expect, vi, beforeEach } from "vitest";
import { IDMapper } from "../id-mapper";

const mockRead = vi.fn();
const mockWrite = vi.fn();
const mockExists = vi.fn();
const mockAdapter = { read: mockRead, write: mockWrite, exists: mockExists };

describe("IDMapper", () => {
	let mapper: IDMapper;

	beforeEach(() => {
		vi.resetAllMocks();
		mapper = new IDMapper(mockAdapter as any, "omnifocus-bridge");
	});

	it("returns empty map when no file exists", async () => {
		mockExists.mockResolvedValue(false);
		const data = await mapper.load();
		expect(data).toEqual({ tasks: {}, projects: {} });
	});

	it("saves and loads mappings", async () => {
		const map = {
			tasks: { t1: "OmniFocus/Project.md" },
			projects: { p1: "OmniFocus/Project.md" },
		};
		await mapper.save(map);
		expect(mockWrite).toHaveBeenCalledOnce();

		mockExists.mockResolvedValue(true);
		mockRead.mockResolvedValue(JSON.stringify(map));

		const loaded = await mapper.load();
		expect(loaded).toEqual(map);
	});

	it("updates task mapping", async () => {
		mockExists.mockResolvedValue(true);
		mockRead.mockResolvedValue(JSON.stringify({ tasks: {}, projects: {} }));

		await mapper.setTask("task1", "OmniFocus/Inbox.md");

		const writeCall = mockWrite.mock.calls[0]!;
		const saved = JSON.parse(writeCall[1] as string);
		expect(saved.tasks.task1).toBe("OmniFocus/Inbox.md");
	});
});
