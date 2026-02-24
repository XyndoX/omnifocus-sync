import { describe, it, expect, vi, beforeEach } from "vitest";
import { runJXA, isOmniFocusAvailable } from "../jxa-runner";
import * as child_process from "child_process";
import * as fs from "fs";
import * as os from "os";

vi.mock("child_process");
vi.mock("fs");
vi.mock("os");

describe("runJXA", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(os.tmpdir).mockReturnValue("/tmp");
	});

	it("writes script to temp file and executes osascript", async () => {
		const mockResult = JSON.stringify({ test: true });
		vi.mocked(child_process.execFile).mockImplementation(
			(_cmd, _args, _opts, callback) => {
				if (callback) callback(null, mockResult, "");
				return {} as any;
			}
		);
		vi.mocked(fs.writeFileSync).mockImplementation(() => {});
		vi.mocked(fs.unlinkSync).mockImplementation(() => {});

		const result = await runJXA('return JSON.stringify({test: true})');

		expect(fs.writeFileSync).toHaveBeenCalledOnce();
		const writtenPath = vi.mocked(fs.writeFileSync).mock.calls[0]![0] as string;
		expect(writtenPath).toMatch(/^\/tmp\/omnifocus_.*\.js$/);

		expect(child_process.execFile).toHaveBeenCalledWith(
			"osascript",
			["-l", "JavaScript", writtenPath],
			expect.objectContaining({ timeout: 90000 }),
			expect.any(Function)
		);

		expect(result).toBe(mockResult);
	});

	it("cleans up temp file even on error", async () => {
		vi.mocked(child_process.execFile).mockImplementation(
			(_cmd, _args, _opts, callback) => {
				if (callback) callback(new Error("script failed"), "", "error output");
				return {} as any;
			}
		);
		vi.mocked(fs.writeFileSync).mockImplementation(() => {});
		vi.mocked(fs.unlinkSync).mockImplementation(() => {});

		await expect(runJXA("bad script")).rejects.toThrow("script failed");
		expect(fs.unlinkSync).toHaveBeenCalledOnce();
	});

	it("wraps omniScript in evaluateJavascript shell", async () => {
		const innerScript = 'return JSON.stringify({ok: true})';
		vi.mocked(child_process.execFile).mockImplementation(
			(_cmd, _args, _opts, callback) => {
				if (callback) callback(null, '{"ok":true}', "");
				return {} as any;
			}
		);
		vi.mocked(fs.writeFileSync).mockImplementation(() => {});
		vi.mocked(fs.unlinkSync).mockImplementation(() => {});

		await runJXA(innerScript);

		const writtenContent = vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string;
		expect(writtenContent).toContain("evaluateJavascript");
		expect(writtenContent).toContain("Application('OmniFocus')");
	});
});

describe("isOmniFocusAvailable", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(os.tmpdir).mockReturnValue("/tmp");
	});

	it("returns true when OmniFocus responds", async () => {
		vi.mocked(child_process.execFile).mockImplementation(
			(_cmd, _args, _opts, callback) => {
				if (callback) callback(null, '{"version":"4.5"}', "");
				return {} as any;
			}
		);
		vi.mocked(fs.writeFileSync).mockImplementation(() => {});
		vi.mocked(fs.unlinkSync).mockImplementation(() => {});

		const result = await isOmniFocusAvailable();
		expect(result).toBe(true);
	});

	it("returns false when osascript fails", async () => {
		vi.mocked(child_process.execFile).mockImplementation(
			(_cmd, _args, _opts, callback) => {
				if (callback) callback(new Error("not running"), "", "");
				return {} as any;
			}
		);
		vi.mocked(fs.writeFileSync).mockImplementation(() => {});
		vi.mocked(fs.unlinkSync).mockImplementation(() => {});

		const result = await isOmniFocusAvailable();
		expect(result).toBe(false);
	});
});
