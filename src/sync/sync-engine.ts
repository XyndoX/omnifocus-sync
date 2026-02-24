import type { Vault } from "obsidian";
import type {
	OFTask,
	OFProject,
	OFTag,
	SyncResult,
	ProjectWithTasks,
	PluginSettings,
} from "../types";
import { runJXA } from "../bridge/jxa-runner";
import {
	buildFetchTasksScript,
	buildFetchProjectsScript,
	buildFetchTagsScript,
} from "../bridge/jxa-scripts";
import { renderProjectFile, renderInboxFile } from "../renderer/markdown-renderer";
import type { CacheManager } from "../data/cache-manager";
import type { IDMapper } from "../data/id-mapper";

export class SyncEngine {
	constructor(
		private vault: Vault,
		private cache: CacheManager,
		private idMapper: IDMapper,
		private settings: PluginSettings
	) {}

	async sync(): Promise<SyncResult> {
		// 1. Fetch data from OmniFocus
		const [tasksJson, projectsJson, tagsJson] = await Promise.all([
			runJXA(buildFetchTasksScript()),
			runJXA(buildFetchProjectsScript()),
			runJXA(buildFetchTagsScript()),
		]);

		const tasks: OFTask[] = JSON.parse(tasksJson);
		const projects: OFProject[] = JSON.parse(projectsJson);
		const tags: OFTag[] = JSON.parse(tagsJson);

		// 2. Group tasks by project
		const tasksByProject = new Map<string, OFTask[]>();
		const inboxTasks: OFTask[] = [];

		for (const task of tasks) {
			if (task.projectId) {
				const existing = tasksByProject.get(task.projectId) ?? [];
				existing.push(task);
				tasksByProject.set(task.projectId, existing);
			} else {
				inboxTasks.push(task);
			}
		}

		// 3. Assemble projects with tasks
		const projectsWithTasks: ProjectWithTasks[] = projects.map((p) => ({
			...p,
			tasks: tasksByProject.get(p.id) ?? [],
		}));

		const syncedAt = new Date().toISOString();
		const result: SyncResult = {
			projects: projectsWithTasks,
			inboxTasks,
			tags,
			syncedAt,
		};

		// 4. Ensure sync folder exists
		await this.ensureFolder(this.settings.syncFolderPath);

		// 5. Write markdown files
		const idMap = await this.idMapper.load();

		for (const project of projectsWithTasks) {
			const filePath = `${this.settings.syncFolderPath}/${project.name}.md`;
			const content = renderProjectFile(project, syncedAt, this.settings);
			await this.writeFile(filePath, content);

			// Update ID mappings
			idMap.projects[project.id] = filePath;
			for (const task of project.tasks) {
				idMap.tasks[task.id] = filePath;
			}
		}

		if (inboxTasks.length > 0) {
			const inboxPath = `${this.settings.syncFolderPath}/Inbox.md`;
			const content = renderInboxFile(inboxTasks, syncedAt, this.settings);
			await this.writeFile(inboxPath, content);

			for (const task of inboxTasks) {
				idMap.tasks[task.id] = inboxPath;
			}
		}

		// 6. Save cache and ID map
		await this.cache.save({
			syncedAt,
			projects: projectsWithTasks,
			inboxTasks,
			tags,
		});
		await this.idMapper.save(idMap);

		return result;
	}

	private async ensureFolder(path: string): Promise<void> {
		const exists = await this.vault.adapter.exists(path);
		if (!exists) {
			await this.vault.createFolder(path);
		}
	}

	private async writeFile(path: string, content: string): Promise<void> {
		const existing = this.vault.getAbstractFileByPath(path);
		if (existing) {
			await this.vault.modify(existing as any, content);
		} else {
			await this.vault.create(path, content);
		}
	}
}
