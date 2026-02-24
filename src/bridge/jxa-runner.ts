import { execFile } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const TIMEOUT_MS = 90_000;
const MAX_BUFFER = 10 * 1024 * 1024; // 10MB

function buildJXAWrapper(omniScript: string): string {
	// Escape backticks and backslashes for template literal embedding
	const escaped = omniScript.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
	return `(() => {
	const app = Application('OmniFocus');
	app.includeStandardAdditions = true;
	const result = app.evaluateJavascript(\`${escaped}\`);
	return result;
})()`;
}

function getTempPath(): string {
	const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
	return join(tmpdir(), `omnifocus_${id}.js`);
}

export function runJXA(omniScript: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const tmpFile = getTempPath();
		const jxa = buildJXAWrapper(omniScript);

		try {
			writeFileSync(tmpFile, jxa, "utf-8");
		} catch (err) {
			reject(new Error(`Failed to write temp file: ${err}`));
			return;
		}

		execFile(
			"osascript",
			["-l", "JavaScript", tmpFile],
			{ timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER },
			(error, stdout, _stderr) => {
				try {
					unlinkSync(tmpFile);
				} catch {
					// ignore cleanup errors
				}

				if (error) {
					reject(error);
					return;
				}

				resolve(stdout.trim());
			}
		);
	});
}

export async function isOmniFocusAvailable(): Promise<boolean> {
	try {
		await runJXA(`
			(() => {
				return JSON.stringify({ version: app.version });
			})()
		`);
		return true;
	} catch {
		return false;
	}
}
