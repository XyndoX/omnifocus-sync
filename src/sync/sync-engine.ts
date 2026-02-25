import type { Vault, TFile } from "obsidian";
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
import { computeDiff } from "./differ";

function sanitizeFilename(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

export class SyncEngine {
	constructor(
		private vault: Vault,
		private cache: CacheManager,
		private idMapper: IDMapper,
		private settings: PluginSettings
	) {}

	async sync(): Promise<SyncResult> {
		// 1. Fetch data from OmniFocus (sequential to avoid overwhelming OmniFocus)
		const projectsJson = await runJXA(buildFetchProjectsScript());
		const tasksJson = await runJXA(buildFetchTasksScript());
		const tagsJson = await runJXA(buildFetchTagsScript());

		let tasks: OFTask[];
		let projects: OFProject[];
		let tags: OFTag[];

		try {
			projects = JSON.parse(projectsJson);
		} catch {
			throw new Error("Failed to parse OmniFocus project data. The response was invalid.");
		}

		try {
			tasks = JSON.parse(tasksJson);
		} catch {
			throw new Error("Failed to parse OmniFocus task data. The response was invalid.");
		}

		try {
			tags = JSON.parse(tagsJson);
		} catch {
			throw new Error("Failed to parse OmniFocus tag data. The response was invalid.");
		}

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

		// 4. Compute diff against cache for incremental sync
		const cachedData = await this.cache.load();
		const diff = computeDiff({ tasks, projects }, cachedData);

		// 5. Ensure sync folder exists
		await this.ensureFolder(this.settings.syncFolderPath);

		if (!diff.hasChanges && cachedData) {
			// No changes detected — skip file writes, just update timestamps
			console.log("Incremental sync: no changes detected, skipping file writes");
			await this.cache.save({
				syncedAt,
				projects: projectsWithTasks,
				inboxTasks,
				tags,
			});
			await this.idMapper.save(await this.idMapper.load());
			return result;
		}

		// 6. Determine which projects need file updates
		const changedProjectIds = this.getChangedProjectIds(diff, tasks);
		const isFullSync = !cachedData;
		const inboxChanged = this.isInboxChanged(diff, inboxTasks);

		// 7. Write markdown files
		const idMap = await this.idMapper.load();

		for (const project of projectsWithTasks) {
			// Only write files for changed projects (or all on full sync)
			if (!isFullSync && !changedProjectIds.has(project.id)) {
				// Still update ID mappings even if not writing file
				const projectDir = this.getProjectDir(project);
				const filePath = `${projectDir}/${sanitizeFilename(project.name)}.md`;
				idMap.projects[project.id] = filePath;
				for (const task of project.tasks) {
					idMap.tasks[task.id] = filePath;
				}
				continue;
			}

			// Build folder path: syncFolder/folderPath/project.md
			const projectDir = this.getProjectDir(project);
			if (project.folderPath) {
				const folderParts = project.folderPath.split("/").map(sanitizeFilename);
				for (let i = 0; i < folderParts.length; i++) {
					const subPath = `${this.settings.syncFolderPath}/${folderParts.slice(0, i + 1).join("/")}`;
					await this.ensureFolder(subPath);
				}
			}
			const filePath = `${projectDir}/${sanitizeFilename(project.name)}.md`;
			const content = renderProjectFile(project, syncedAt, this.settings);
			await this.writeFile(filePath, content);

			// Update ID mappings
			idMap.projects[project.id] = filePath;
			for (const task of project.tasks) {
				idMap.tasks[task.id] = filePath;
			}
		}

		if (inboxTasks.length > 0 && (isFullSync || inboxChanged)) {
			const inboxPath = `${this.settings.syncFolderPath}/Inbox.md`;
			const content = renderInboxFile(inboxTasks, syncedAt, this.settings);
			await this.writeFile(inboxPath, content);

			for (const task of inboxTasks) {
				idMap.tasks[task.id] = inboxPath;
			}
		} else if (inboxTasks.length > 0) {
			// Still update ID mappings even if not writing inbox file
			const inboxPath = `${this.settings.syncFolderPath}/Inbox.md`;
			for (const task of inboxTasks) {
				idMap.tasks[task.id] = inboxPath;
			}
		}

		// Log incremental sync summary
		if (!isFullSync) {
			const taskChangeCount = diff.taskChanges.length;
			const projectChangeCount = changedProjectIds.size;
			console.log(
				`Incremental sync: ${taskChangeCount} tasks changed, ${projectChangeCount} projects updated`
			);
		}

		// 8. Save cache and ID map
		await this.cache.save({
			syncedAt,
			projects: projectsWithTasks,
			inboxTasks,
			tags,
		});
		await this.idMapper.save(idMap);

		return result;
	}

	/**
	 * Determine which project IDs have changes (project-level or task-level).
	 */
	private getChangedProjectIds(
		diff: ReturnType<typeof computeDiff>,
		tasks: OFTask[]
	): Set<string> {
		const ids = new Set<string>();

		// Projects that were directly added/removed/modified
		for (const change of diff.projectChanges) {
			ids.add(change.projectId);
		}

		// Build a task->project lookup from fresh tasks
		const taskToProject = new Map<string, string>();
		for (const t of tasks) {
			if (t.projectId) {
				taskToProject.set(t.id, t.projectId);
			}
		}

		// Projects whose tasks changed
		for (const change of diff.taskChanges) {
			const projectId = taskToProject.get(change.taskId);
			if (projectId) {
				ids.add(projectId);
			}
		}

		return ids;
	}

	/**
	 * Check if any inbox tasks (tasks without projectId) have changed.
	 */
	private isInboxChanged(
		diff: ReturnType<typeof computeDiff>,
		inboxTasks: OFTask[]
	): boolean {
		const inboxTaskIds = new Set(inboxTasks.map((t) => t.id));
		return diff.taskChanges.some((c) => inboxTaskIds.has(c.taskId));
	}

	/**
	 * Get the directory path for a project file.
	 */
	private getProjectDir(project: ProjectWithTasks): string {
		if (project.folderPath) {
			const folderParts = project.folderPath.split("/").map(sanitizeFilename);
			return `${this.settings.syncFolderPath}/${folderParts.join("/")}`;
		}
		return this.settings.syncFolderPath;
	}

	private async ensureFolder(path: string): Promise<void> {
		const exists = await this.vault.adapter.exists(path);
		if (!exists) {
			await this.vault.createFolder(path);
		}
	}

	private async writeFile(path: string, content: string): Promise<void> {
		const existing = this.vault.getAbstractFileByPath(path);
		if (existing && "extension" in existing) {
			await this.vault.modify(existing as TFile, content);
		} else {
			await this.vault.create(path, content);
		}
	}
}
