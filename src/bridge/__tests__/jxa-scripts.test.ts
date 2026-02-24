import { describe, it, expect } from "vitest";
import {
	buildFetchTasksScript,
	buildFetchProjectsScript,
	buildFetchTagsScript,
	buildConnectionTestScript,
} from "../jxa-scripts";

describe("JXA Script Templates", () => {
	it("buildFetchTasksScript returns valid JS with JSON.stringify", () => {
		const script = buildFetchTasksScript();
		expect(script).toContain("JSON.stringify");
		expect(script).toContain("flattenedTasks");
		expect(script).toContain("id.primaryKey");
		expect(script).toContain("containingProject");
	});

	it("buildFetchProjectsScript returns valid JS filtering active/onHold", () => {
		const script = buildFetchProjectsScript();
		expect(script).toContain("JSON.stringify");
		expect(script).toContain("flattenedProjects");
		expect(script).toContain("Project.Status.Active");
	});

	it("buildFetchTagsScript returns valid JS", () => {
		const script = buildFetchTagsScript();
		expect(script).toContain("JSON.stringify");
		expect(script).toContain("flattenedTags");
	});

	it("buildConnectionTestScript returns valid JS", () => {
		const script = buildConnectionTestScript();
		expect(script).toContain("JSON.stringify");
		expect(script).toContain("version");
	});

	it("all scripts are wrapped in IIFEs", () => {
		const scripts = [
			buildFetchTasksScript(),
			buildFetchProjectsScript(),
			buildFetchTagsScript(),
			buildConnectionTestScript(),
		];
		for (const script of scripts) {
			expect(script.trim()).toMatch(/^\(\(\) => \{/);
			expect(script.trim()).toMatch(/\}\)\(\)$/);
		}
	});
});
