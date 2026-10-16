import { execFile } from "child_process";

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
		const jxa = buildJXAWrapper(omniScript);

		// No script file argument: osascript reads the script from stdin,
		// so nothing is written to disk.
		const child = execFile(
			"osascript",
			["-l", "JavaScript"],
			{ timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER },
			(error, stdout, stderr) => {
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

		// If osascript exits early, the write fails with EPIPE; the exec
		// callback above already reports the real error.
		child.stdin?.on("error", () => {});
		child.stdin?.end(jxa, "utf-8");
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
