import { describe, it, expect } from "vitest";
import {
	buildMarkCompleteScript,
	buildMarkIncompleteScript,
	buildCreateTaskScript,
	buildSetFlagScript,
	buildSetDueDateScript,
	buildSetDeferDateScript,
	buildAddTagScript,
	buildRemoveTagScript,
} from "../jxa-write-scripts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Every generated script must be a valid IIFE. */
function expectIIFE(script: string): void {
	expect(script.trim()).toMatch(/^\(\(\) => \{/);
	expect(script.trim()).toMatch(/\}\)\(\)$/);
}

/** Every generated script must return JSON. */
function expectJSON(script: string): void {
	expect(script).toContain("JSON.stringify");
}

// ---------------------------------------------------------------------------
// buildMarkCompleteScript
// ---------------------------------------------------------------------------

describe("buildMarkCompleteScript", () => {
	it("returns an IIFE that returns JSON", () => {
		const script = buildMarkCompleteScript("abc123");
		expectIIFE(script);
		expectJSON(script);
	});

	it("looks up task by id.primaryKey", () => {
		const script = buildMarkCompleteScript("abc123");
		expect(script).toContain("id.primaryKey");
		expect(script).toContain("'abc123'");
	});

	it("calls markComplete()", () => {
		const script = buildMarkCompleteScript("abc123");
		expect(script).toContain("task.markComplete()");
	});

	it("uses flattenedTasks (not document)", () => {
		const script = buildMarkCompleteScript("abc123");
		expect(script).toContain("flattenedTasks");
		expect(script).not.toContain("document.");
	});

	it("escapes special characters in taskId", () => {
		const script = buildMarkCompleteScript("it's a \"test\\'");
		expect(script).toContain("it\\'s a \"test\\\\\\'");
		expect(script).not.toContain("it's");
	});
});

// ---------------------------------------------------------------------------
// buildMarkIncompleteScript
// ---------------------------------------------------------------------------

describe("buildMarkIncompleteScript", () => {
	it("returns an IIFE that returns JSON", () => {
		const script = buildMarkIncompleteScript("abc123");
		expectIIFE(script);
		expectJSON(script);
	});

	it("calls markIncomplete()", () => {
		const script = buildMarkIncompleteScript("abc123");
		expect(script).toContain("task.markIncomplete()");
	});

	it("uses flattenedTasks", () => {
		const script = buildMarkIncompleteScript("abc123");
		expect(script).toContain("flattenedTasks");
	});
});

// ---------------------------------------------------------------------------
// buildCreateTaskScript
// ---------------------------------------------------------------------------

describe("buildCreateTaskScript", () => {
	it("returns an IIFE that returns JSON", () => {
		const script = buildCreateTaskScript({ name: "Buy milk" });
		expectIIFE(script);
		expectJSON(script);
	});

	it("creates task in inbox when no projectId provided", () => {
		const script = buildCreateTaskScript({ name: "Buy milk" });
		expect(script).toContain("new Task('Buy milk', inbox)");
		expect(script).not.toContain("flattenedProjects");
	});

	it("creates task in project when projectId provided", () => {
		const script = buildCreateTaskScript({
			name: "Write tests",
			projectId: "proj42",
		});
		expect(script).toContain("flattenedProjects");
		expect(script).toContain("'proj42'");
		expect(script).toContain("new Task('Write tests', proj)");
	});

	it("sets dueDate when provided", () => {
		const script = buildCreateTaskScript({
			name: "Do it",
			dueDate: "2026-03-01T00:00:00.000Z",
		});
		expect(script).toContain("newTask.dueDate = new Date('2026-03-01T00:00:00.000Z')");
	});

	it("sets deferDate when provided", () => {
		const script = buildCreateTaskScript({
			name: "Do it",
			deferDate: "2026-02-28T00:00:00.000Z",
		});
		expect(script).toContain("newTask.deferDate = new Date('2026-02-28T00:00:00.000Z')");
	});

	it("sets flagged when provided", () => {
		const script = buildCreateTaskScript({ name: "Urgent", flagged: true });
		expect(script).toContain("newTask.flagged = true");
	});

	it("sets flagged to false explicitly", () => {
		const script = buildCreateTaskScript({ name: "Normal", flagged: false });
		expect(script).toContain("newTask.flagged = false");
	});

	it("sets note when provided", () => {
		const script = buildCreateTaskScript({
			name: "Noted",
			note: "Some details here",
		});
		expect(script).toContain("newTask.note = 'Some details here'");
	});

	it("assigns tags by name via flattenedTags", () => {
		const script = buildCreateTaskScript({
			name: "Tagged",
			tagNames: ["work", "urgent"],
		});
		expect(script).toContain("flattenedTags");
		expect(script).toContain("'work'");
		expect(script).toContain("'urgent'");
		expect(script).toContain("newTask.addTag(found)");
	});

	it("escapes task name with special characters", () => {
		const script = buildCreateTaskScript({ name: "Fix the 'bug'" });
		expect(script).toContain("Fix the \\'bug\\'");
	});

	it("escapes note with newlines", () => {
		const script = buildCreateTaskScript({
			name: "Test",
			note: "line1\nline2",
		});
		expect(script).toContain("\\n");
		expect(script).not.toContain("line1\nline2");
	});

	it("returns the new task id", () => {
		const script = buildCreateTaskScript({ name: "Test" });
		expect(script).toContain("newTask.id.primaryKey");
	});

	it("does not reference document", () => {
		const script = buildCreateTaskScript({
			name: "Test",
			projectId: "p1",
			tagNames: ["tag1"],
		});
		expect(script).not.toContain("document.");
	});
});

// ---------------------------------------------------------------------------
// buildSetFlagScript
// ---------------------------------------------------------------------------

describe("buildSetFlagScript", () => {
	it("returns an IIFE that returns JSON", () => {
		const script = buildSetFlagScript("abc123", true);
		expectIIFE(script);
		expectJSON(script);
	});

	it("sets flagged to true", () => {
		const script = buildSetFlagScript("abc123", true);
		expect(script).toContain("task.flagged = true");
	});

	it("sets flagged to false", () => {
		const script = buildSetFlagScript("abc123", false);
		expect(script).toContain("task.flagged = false");
	});

	it("looks up the task by primaryKey", () => {
		const script = buildSetFlagScript("abc123", true);
		expect(script).toContain("id.primaryKey");
		expect(script).toContain("'abc123'");
	});
});

// ---------------------------------------------------------------------------
// buildSetDueDateScript
// ---------------------------------------------------------------------------

describe("buildSetDueDateScript", () => {
	it("returns an IIFE that returns JSON", () => {
		const script = buildSetDueDateScript("abc123", "2026-03-01T00:00:00.000Z");
		expectIIFE(script);
		expectJSON(script);
	});

	it("sets dueDate to a Date object when value given", () => {
		const script = buildSetDueDateScript("abc123", "2026-03-01T00:00:00.000Z");
		expect(script).toContain("task.dueDate = new Date('2026-03-01T00:00:00.000Z')");
	});

	it("clears dueDate when null given", () => {
		const script = buildSetDueDateScript("abc123", null);
		expect(script).toContain("task.dueDate = null");
		expect(script).not.toContain("new Date");
	});

	it("returns the updated dueDate in JSON", () => {
		const script = buildSetDueDateScript("abc123", "2026-03-01T00:00:00.000Z");
		expect(script).toContain("dueDate:");
		expect(script).toContain("toISOString");
	});
});

// ---------------------------------------------------------------------------
// buildSetDeferDateScript
// ---------------------------------------------------------------------------

describe("buildSetDeferDateScript", () => {
	it("returns an IIFE that returns JSON", () => {
		const script = buildSetDeferDateScript("abc123", "2026-02-28T00:00:00.000Z");
		expectIIFE(script);
		expectJSON(script);
	});

	it("sets deferDate to a Date object when value given", () => {
		const script = buildSetDeferDateScript("abc123", "2026-02-28T00:00:00.000Z");
		expect(script).toContain("task.deferDate = new Date('2026-02-28T00:00:00.000Z')");
	});

	it("clears deferDate when null given", () => {
		const script = buildSetDeferDateScript("abc123", null);
		expect(script).toContain("task.deferDate = null");
		expect(script).not.toContain("new Date");
	});

	it("returns the updated deferDate in JSON", () => {
		const script = buildSetDeferDateScript("abc123", "2026-02-28T00:00:00.000Z");
		expect(script).toContain("deferDate:");
		expect(script).toContain("toISOString");
	});
});

// ---------------------------------------------------------------------------
// buildAddTagScript
// ---------------------------------------------------------------------------

describe("buildAddTagScript", () => {
	it("returns an IIFE that returns JSON", () => {
		const script = buildAddTagScript("abc123", "work");
		expectIIFE(script);
		expectJSON(script);
	});

	it("looks up the tag by name in flattenedTags", () => {
		const script = buildAddTagScript("abc123", "work");
		expect(script).toContain("flattenedTags");
		expect(script).toContain("'work'");
	});

	it("calls task.addTag()", () => {
		const script = buildAddTagScript("abc123", "work");
		expect(script).toContain("task.addTag(tag)");
	});

	it("throws when tag not found", () => {
		const script = buildAddTagScript("abc123", "work");
		expect(script).toContain("Tag not found");
	});

	it("escapes tag names with special characters", () => {
		const script = buildAddTagScript("abc123", "it's complicated");
		expect(script).toContain("it\\'s complicated");
	});
});

// ---------------------------------------------------------------------------
// buildRemoveTagScript
// ---------------------------------------------------------------------------

describe("buildRemoveTagScript", () => {
	it("returns an IIFE that returns JSON", () => {
		const script = buildRemoveTagScript("abc123", "work");
		expectIIFE(script);
		expectJSON(script);
	});

	it("looks up the tag by name in flattenedTags", () => {
		const script = buildRemoveTagScript("abc123", "work");
		expect(script).toContain("flattenedTags");
		expect(script).toContain("'work'");
	});

	it("calls task.removeTag()", () => {
		const script = buildRemoveTagScript("abc123", "work");
		expect(script).toContain("task.removeTag(tag)");
	});

	it("throws when tag not found", () => {
		const script = buildRemoveTagScript("abc123", "work");
		expect(script).toContain("Tag not found");
	});
});

// ---------------------------------------------------------------------------
// Cross-cutting: all scripts are IIFEs and return JSON
// ---------------------------------------------------------------------------

describe("all write scripts", () => {
	const allScripts = [
		buildMarkCompleteScript("id1"),
		buildMarkIncompleteScript("id2"),
		buildCreateTaskScript({ name: "Test task" }),
		buildCreateTaskScript({
			name: "Full task",
			projectId: "p1",
			dueDate: "2026-03-01T00:00:00.000Z",
			deferDate: "2026-02-28T00:00:00.000Z",
			flagged: true,
			tagNames: ["work"],
			note: "A note",
		}),
		buildSetFlagScript("id3", true),
		buildSetDueDateScript("id4", "2026-03-01T00:00:00.000Z"),
		buildSetDueDateScript("id4", null),
		buildSetDeferDateScript("id5", "2026-02-28T00:00:00.000Z"),
		buildSetDeferDateScript("id5", null),
		buildAddTagScript("id6", "work"),
		buildRemoveTagScript("id7", "personal"),
	];

	it("are all wrapped in IIFEs", () => {
		for (const script of allScripts) {
			expectIIFE(script);
		}
	});

	it("all return JSON.stringify", () => {
		for (const script of allScripts) {
			expectJSON(script);
		}
	});

	it("none reference document.*", () => {
		for (const script of allScripts) {
			expect(script).not.toContain("document.");
		}
	});

	it("all use top-level OmniFocus globals (not document.*)", () => {
		for (const script of allScripts) {
			const usesFlattenedTasks = script.includes("flattenedTasks");
			const usesFlattenedProjects = script.includes("flattenedProjects");
			const usesFlattenedTags = script.includes("flattenedTags");
			const usesInbox = script.includes("inbox");
			expect(
				usesFlattenedTasks || usesFlattenedProjects || usesFlattenedTags || usesInbox
			).toBe(true);
		}
	});
});
