import { describe, it, expect, vi, beforeEach } from "vitest";
import { runJXA, isOmniFocusAvailable } from "../jxa-runner";
import * as child_process from "child_process";

vi.mock("child_process");

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

/** Mock execFile: answer via callback, capture what is written to stdin. */
function mockOsascript(error: Error | null, stdout: string, stderr = "") {
	const stdin = { on: vi.fn(), end: vi.fn() };
	vi.mocked(child_process.execFile).mockImplementation(
		(_cmd: any, _args: any, _opts: any, callback?: ExecCallback) => {
			if (callback) queueMicrotask(() => callback(error, stdout, stderr));
			return { stdin } as any;
		}
	);
	return stdin;
}

describe("runJXA", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("pipes the script to osascript over stdin, without a script file", async () => {
		const mockResult = JSON.stringify({ test: true });
		const stdin = mockOsascript(null, mockResult);

		const result = await runJXA("return JSON.stringify({test: true})");

		expect(child_process.execFile).toHaveBeenCalledWith(
			"osascript",
			["-l", "JavaScript"],
			expect.objectContaining({ timeout: 90000 }),
			expect.any(Function)
		);
		expect(stdin.end).toHaveBeenCalledOnce();
		expect(stdin.on).toHaveBeenCalledWith("error", expect.any(Function));
		expect(result).toBe(mockResult);
	});

	it("rejects with the osascript error", async () => {
		mockOsascript(new Error("script failed"), "", "error output");
		await expect(runJXA("bad script")).rejects.toThrow("script failed");
	});

	it("wraps omniScript in evaluateJavascript shell", async () => {
		const stdin = mockOsascript(null, '{"ok":true}');

		await runJXA("return JSON.stringify({ok: true})");

		const written = stdin.end.mock.calls[0]![0] as string;
		expect(written).toContain("evaluateJavascript");
		expect(written).toContain("Application('OmniFocus')");
	});
});

describe("isOmniFocusAvailable", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("returns true when OmniFocus responds", async () => {
		mockOsascript(null, '{"version":"4.5"}');
		expect(await isOmniFocusAvailable()).toBe(true);
	});

	it("returns false when osascript fails", async () => {
		mockOsascript(new Error("not running"), "");
		expect(await isOmniFocusAvailable()).toBe(false);
	});
});
