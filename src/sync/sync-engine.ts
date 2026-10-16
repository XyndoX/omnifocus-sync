import type { Vault, TFile } from "obsidian";
import type {
	OFTask,
	OFProject,
	OFTag,
	SyncResult,
	ProjectWithTasks,
	PluginSettings,
	CacheData,
} from "../types";
import { runJXA } from "../bridge/jxa-runner";
import {
	buildFetchTasksScript,
	buildFetchProjectsScript,
	buildFetchTagsScript,
	buildCheckTaskStatusScript,
} from "../bridge/jxa-scripts";
import { renderProjectFile, renderInboxFile } from "../renderer/markdown-renderer";
import type { CacheManager } from "../data/cache-manager";
import type { IDMapper } from "../data/id-mapper";
import type { ChangeDetector } from "./change-detector";
import { computeDiff } from "./differ";

function sanitizeFilename(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

export class SyncEngine {
	private changeDetector: ChangeDetector | null = null;

	constructor(
		private vault: Vault,
		private cache: CacheManager,
		private idMapper: IDMapper,
		private settings: PluginSettings
	) {}

	/** Link the change detector so sync can suppress it during file writes. */
	setChangeDetector(detector: ChangeDetector): void {
		this.changeDetector = detector;
	}

	async sync(): Promise<SyncResult> {
		// Wait if change detector is actively writing to OmniFocus
		if (this.changeDetector?.isProcessing) {
			await new Promise<void>((resolve) => {
				const check = setInterval(() => {
					if (!this.changeDetector?.isProcessing) {
						clearInterval(check);
						resolve();
					}
				}, 100);
			});
		}

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

		// 1b. Check for tasks that were in cache but missing from active fetch
		// (they may have been completed in OmniFocus)
		const cachedDataForLookup = await this.cache.load();
		if (cachedDataForLookup) {
			const freshIds = new Set(tasks.map((t) => t.id));
			const missingIds: string[] = [];

			for (const p of cachedDataForLookup.projects) {
				for (const t of p.tasks) {
					if (!freshIds.has(t.id)) {
						missingIds.push(t.id);
					}
				}
			}
			for (const t of cachedDataForLookup.inboxTasks) {
				if (!freshIds.has(t.id)) {
					missingIds.push(t.id);
				}
			}

			if (missingIds.length > 0) {
				try {
					const statusJson = await runJXA(
						buildCheckTaskStatusScript(missingIds)
					);
					const statuses: Record<
						string,
						Omit<OFTask, "id"> & { completed: boolean }
					> = JSON.parse(statusJson);

					for (const id of missingIds) {
						const status = statuses[id];
						if (status && status.completed) {
							// Task was completed in OmniFocus — add it back with full data
							tasks.push({
								id,
								name: status.name ?? "",
								note: status.note ?? null,
								completed: true,
								completionDate: status.completionDate ?? null,
								dueDate: status.dueDate ?? null,
								deferDate: status.deferDate ?? null,
								flagged: status.flagged ?? false,
								estimatedMinutes: status.estimatedMinutes ?? null,
								taskStatus: status.taskStatus ?? "Completed",
								projectId: status.projectId ?? null,
								projectName: status.projectName ?? null,
								tags: status.tags ?? [],
								added: status.added ?? null,
								modified: status.modified ?? null,
							});
						}
						// Tasks not found in OmniFocus (deleted) are left out
					}
				} catch (err) {
					console.error("OmniFocus: failed to check missing tasks", err);
				}
			}
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

		// Suppress change detector while writing files to avoid feedback loop
		this.changeDetector?.suppress();

		try {
		if (!diff.hasChanges && cachedData) {
			// No changes detected — skip file writes, just update timestamps
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
		const changedProjectIds = this.getChangedProjectIds(diff, tasks, cachedData);
		const isFullSync = !cachedData;
		const inboxChanged = this.isInboxChanged(diff, inboxTasks, cachedData);

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


		// 8. Save cache and ID map
		await this.cache.save({
			syncedAt,
			projects: projectsWithTasks,
			inboxTasks,
			tags,
		});
		await this.idMapper.save(idMap);

		} finally {
			// Resume change detector after all file writes are done
			this.changeDetector?.resume();
		}

		return result;
	}

	/**
	 * Determine which project IDs have changes (project-level or task-level).
	 */
	private getChangedProjectIds(
		diff: ReturnType<typeof computeDiff>,
		tasks: OFTask[],
		cachedData: CacheData | null
	): Set<string> {
		const ids = new Set<string>();

		// Projects that were directly added/removed/modified
		for (const change of diff.projectChanges) {
			ids.add(change.projectId);
		}

		// Build a task->project lookup from fresh tasks AND cached tasks
		const taskToProject = new Map<string, string>();
		if (cachedData) {
			for (const p of cachedData.projects) {
				for (const t of p.tasks) {
					taskToProject.set(t.id, p.id);
				}
			}
		}
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
	 * Checks both fresh and cached inbox to detect removals/completions.
	 */
	private isInboxChanged(
		diff: ReturnType<typeof computeDiff>,
		inboxTasks: OFTask[],
		cachedData: CacheData | null
	): boolean {
		const freshInboxIds = new Set(inboxTasks.map((t) => t.id));
		const cachedInboxIds = new Set(
			cachedData?.inboxTasks.map((t) => t.id) ?? []
		);
		return diff.taskChanges.some(
			(c) => freshInboxIds.has(c.taskId) || cachedInboxIds.has(c.taskId)
		);
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
		if (!this.vault.getAbstractFileByPath(path)) {
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
