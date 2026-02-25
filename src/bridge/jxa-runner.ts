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

/**
 * Translate raw osascript/exec errors into user-friendly messages.
 */
function classifyError(error: Error & { killed?: boolean; code?: string | number; stderr?: string }): Error {
	const msg = (error.message || "") + (error.stderr || "");
	const lower = msg.toLowerCase();

	// OmniFocus not running
	if (lower.includes("not running") || lower.includes("is not open") || lower.includes("application can\u2019t be found")) {
		return new Error(
			"OmniFocus is not running. Please open it and try again."
		);
	}

	// Timeout (killed by Node or explicit timeout code)
	if (error.killed || lower.includes("timed out") || lower.includes("etimedout")) {
		return new Error(
			"Sync timed out. OmniFocus may be busy. Try again."
		);
	}

	// Automation permission denied
	if (lower.includes("not allowed assistive access") ||
		lower.includes("not allowed to send keystrokes") ||
		lower.includes("is not allowed to") ||
		lower.includes("permission") ||
		lower.includes("assistive") ||
		lower.includes("osascript is not allowed")) {
		return new Error(
			"Automation permission denied. Grant access in System Settings > Privacy & Security > Automation."
		);
	}

	// Return original error for unrecognised patterns
	return error;
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
			(error, stdout, stderr) => {
				try {
					unlinkSync(tmpFile);
				} catch {
					// ignore cleanup errors
				}

				if (error) {
					// Attach stderr to the error for classification
					const enriched = error as Error & { stderr?: string };
					if (stderr) {
						enriched.stderr = stderr;
					}
					reject(classifyError(enriched));
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
