import { ItemView, WorkspaceLeaf, Notice, setIcon } from "obsidian";
import type { OFTask, ProjectWithTasks, CacheData, PluginSettings } from "../types";
import type { CacheManager } from "../data/cache-manager";
import { runJXA } from "../bridge/jxa-runner";
import {
	buildMarkCompleteScript,
	buildMarkIncompleteScript,
	buildSetFlagScript,
	buildSetDueDateScript,
	buildSetDeferDateScript,
	buildCreateTaskScript,
} from "../bridge/jxa-write-scripts";

export const VIEW_TYPE = "omnifocus-panel";

type TabId = "inbox" | "today" | "projects" | "dashboard";

export class OmniFocusView extends ItemView {
	private cache: CacheManager;
	private settings: PluginSettings;
	private syncFn: () => Promise<void>;
	private activeTab: TabId = "today";
	private collapsedProjects = new Set<string>();
	private isRefreshing = false;

	constructor(
		leaf: WorkspaceLeaf,
		cache: CacheManager,
		settings: PluginSettings,
		syncFn: () => Promise<void>
	) {
		super(leaf);
		this.cache = cache;
		this.settings = settings;
		this.syncFn = syncFn;
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "OmniFocus";
	}

	getIcon(): string {
		return "check-circle";
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async onClose(): Promise<void> {
		// cleanup
	}

	/** Public method to refresh the view after a sync */
	async refresh(): Promise<void> {
		await this.render();
	}

	// ---------------------------------------------------------------
	// Rendering
	// ---------------------------------------------------------------

	private async render(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("of-panel");

		const data = await this.cache.load();

		// Header
		this.renderHeader(container, data);

		// Tabs
		this.renderTabs(container);

		// Content
		const content = container.createDiv({ cls: "of-panel-content" });
		if (!data) {
			content.createDiv({
				cls: "of-empty",
				text: "No data yet. Run Sync first.",
			});
			return;
		}

		switch (this.activeTab) {
			case "inbox":
				this.renderInbox(content, data);
				break;
			case "today":
				this.renderToday(content, data);
				break;
			case "projects":
				this.renderProjects(content, data);
				break;
			case "dashboard":
				this.renderDashboard(content, data);
				break;
		}
	}

	private renderHeader(container: HTMLElement, data: CacheData | null): void {
		const header = container.createDiv({ cls: "of-panel-header" });

		const titleRow = header.createDiv({ cls: "of-header-row" });
		titleRow.createEl("h4", { text: "OmniFocus", cls: "of-header-title" });

		const actions = titleRow.createDiv({ cls: "of-header-actions" });

		// Quick add button
		const addBtn = actions.createEl("button", {
			cls: "of-icon-btn",
			attr: { "aria-label": "Quick Add Task" },
		});
		setIcon(addBtn, "plus");
		addBtn.addEventListener("click", () => this.showQuickAdd());

		// Sync button
		const syncBtn = actions.createEl("button", {
			cls: "of-icon-btn",
			attr: { "aria-label": "Sync now" },
		});
		setIcon(syncBtn, "refresh-cw");
		syncBtn.addEventListener("click", () => this.doSync(syncBtn));

		// Last sync
		if (data?.syncedAt) {
			const ago = this.timeAgo(new Date(data.syncedAt));
			header.createDiv({
				cls: "of-header-meta",
				text: `Synced ${ago}`,
			});
		}
	}

	private renderTabs(container: HTMLElement): void {
		const tabs = container.createDiv({ cls: "of-tabs" });
		const tabDefs: { id: TabId; label: string; icon: string }[] = [
			{ id: "today", label: "Today", icon: "sun" },
			{ id: "inbox", label: "Inbox", icon: "inbox" },
			{ id: "projects", label: "Projects", icon: "folder" },
			{ id: "dashboard", label: "Dashboard", icon: "bar-chart-2" },
		];

		for (const def of tabDefs) {
			const tab = tabs.createDiv({
				cls: `of-tab ${this.activeTab === def.id ? "of-tab-active" : ""}`,
			});
			setIcon(tab, def.icon);
			tab.createSpan({ text: def.label });
			tab.addEventListener("click", () => {
				this.activeTab = def.id;
				this.render();
			});
		}
	}

	// ---------------------------------------------------------------
	// Inbox tab
	// ---------------------------------------------------------------

	private renderInbox(container: HTMLElement, data: CacheData): void {
		const tasks = data.inboxTasks.filter((t) => !t.completed);
		if (tasks.length === 0) {
			container.createDiv({ cls: "of-empty", text: "Inbox is empty" });
			return;
		}
		this.renderTaskList(container, tasks, "inbox");
	}

	// ---------------------------------------------------------------
	// Today tab
	// ---------------------------------------------------------------

	private renderToday(container: HTMLElement, data: CacheData): void {
		const today = new Date().toISOString().slice(0, 10);
		const allTasks = this.getAllTasks(data);

		const flagged = allTasks.filter((t) => !t.completed && t.flagged);
		const dueToday = allTasks.filter(
			(t) => !t.completed && t.dueDate && t.dueDate.slice(0, 10) <= today && !t.flagged
		);
		const overdue = allTasks.filter(
			(t) => !t.completed && t.dueDate && t.dueDate.slice(0, 10) < today
		);

		if (flagged.length === 0 && dueToday.length === 0) {
			container.createDiv({
				cls: "of-empty",
				text: "Nothing due today",
			});
			return;
		}

		if (overdue.length > 0) {
			this.renderSection(container, "Overdue", overdue, "of-section-overdue");
		}
		if (flagged.length > 0) {
			this.renderSection(container, "Flagged", flagged, "of-section-flagged");
		}
		if (dueToday.length > 0) {
			this.renderSection(container, "Due Today", dueToday, "");
		}
	}

	// ---------------------------------------------------------------
	// Projects tab
	// ---------------------------------------------------------------

	private renderProjects(container: HTMLElement, data: CacheData): void {
		// Group projects by folder
		const byFolder = new Map<string, ProjectWithTasks[]>();
		for (const p of data.projects) {
			const folder = p.folderPath ?? "No Folder";
			const arr = byFolder.get(folder) ?? [];
			arr.push(p);
			byFolder.set(folder, arr);
		}

		const sortedFolders = [...byFolder.keys()].sort();
		for (const folder of sortedFolders) {
			const projects = byFolder.get(folder)!;
			const folderEl = container.createDiv({ cls: "of-folder" });
			folderEl.createDiv({
				cls: "of-folder-name",
				text: folder,
			});

			for (const project of projects) {
				this.renderProject(folderEl, project);
			}
		}
	}

	private renderProject(container: HTMLElement, project: ProjectWithTasks): void {
		const activeTasks = project.tasks.filter((t) => !t.completed);
		const isCollapsed = this.collapsedProjects.has(project.id);

		const el = container.createDiv({ cls: "of-project" });
		const header = el.createDiv({ cls: "of-project-header" });

		const chevron = header.createSpan({ cls: "of-chevron" });
		setIcon(chevron, isCollapsed ? "chevron-right" : "chevron-down");

		header.createSpan({
			text: project.name,
			cls: "of-project-name",
		});
		header.createSpan({
			text: `${activeTasks.length}`,
			cls: "of-badge",
		});

		if (project.status === "onHold") {
			header.createSpan({ text: "On Hold", cls: "of-tag-onhold" });
		}

		header.addEventListener("click", () => {
			if (isCollapsed) {
				this.collapsedProjects.delete(project.id);
			} else {
				this.collapsedProjects.add(project.id);
			}
			this.render();
		});

		if (!isCollapsed && activeTasks.length > 0) {
			this.renderTaskList(el, activeTasks, project.name);
		}
	}

	// ---------------------------------------------------------------
	// Dashboard tab
	// ---------------------------------------------------------------

	private renderDashboard(container: HTMLElement, data: CacheData): void {
		const allTasks = this.getAllTasks(data);
		const today = new Date().toISOString().slice(0, 10);

		const inbox = data.inboxTasks.filter((t) => !t.completed).length;
		const flagged = allTasks.filter((t) => !t.completed && t.flagged).length;
		const dueToday = allTasks.filter(
			(t) => !t.completed && t.dueDate && t.dueDate.slice(0, 10) === today
		).length;
		const overdue = allTasks.filter(
			(t) => !t.completed && t.dueDate && t.dueDate.slice(0, 10) < today
		).length;
		const totalActive = allTasks.filter((t) => !t.completed).length;
		const projects = data.projects.filter((p) => p.status === "active").length;

		const grid = container.createDiv({ cls: "of-dashboard-grid" });

		this.renderCard(grid, "Overdue", overdue, "of-card-overdue", () => {
			this.activeTab = "today";
			this.render();
		});
		this.renderCard(grid, "Due Today", dueToday, "of-card-today", () => {
			this.activeTab = "today";
			this.render();
		});
		this.renderCard(grid, "Flagged", flagged, "of-card-flagged", () => {
			this.activeTab = "today";
			this.render();
		});
		this.renderCard(grid, "Inbox", inbox, "of-card-inbox", () => {
			this.activeTab = "inbox";
			this.render();
		});
		this.renderCard(grid, "Active Tasks", totalActive, "", null);
		this.renderCard(grid, "Projects", projects, "", null);

		// Recently completed
		const completed = allTasks
			.filter((t) => t.completed && t.completionDate)
			.sort((a, b) => (b.completionDate ?? "").localeCompare(a.completionDate ?? ""))
			.slice(0, 5);

		if (completed.length > 0) {
			const section = container.createDiv({ cls: "of-dashboard-section" });
			section.createDiv({ cls: "of-section-title", text: "Recently Completed" });
			for (const task of completed) {
				const row = section.createDiv({ cls: "of-completed-row" });
				row.createSpan({ cls: "of-completed-check", text: "✓" });
				const nameEl = row.createSpan({ cls: "of-completed-name", text: task.name });
				if (task.completionDate) {
					nameEl.createSpan({
						cls: "of-completed-date",
						text: ` · ${task.completionDate.slice(0, 10)}`,
					});
				}
			}
		}
	}

	private renderCard(
		container: HTMLElement,
		label: string,
		count: number,
		cls: string,
		onClick: (() => void) | null
	): void {
		const card = container.createDiv({ cls: `of-card ${cls}` });
		card.createDiv({ cls: "of-card-count", text: String(count) });
		card.createDiv({ cls: "of-card-label", text: label });
		if (onClick && count > 0) {
			card.addClass("of-card-clickable");
			card.addEventListener("click", onClick);
		}
	}

	// ---------------------------------------------------------------
	// Shared renderers
	// ---------------------------------------------------------------

	private renderSection(
		container: HTMLElement,
		title: string,
		tasks: OFTask[],
		cls: string
	): void {
		const section = container.createDiv({ cls: `of-section ${cls}` });
		section.createDiv({ cls: "of-section-title", text: `${title} (${tasks.length})` });
		this.renderTaskList(section, tasks, title);
	}

	private renderTaskList(container: HTMLElement, tasks: OFTask[], _context: string): void {
		const list = container.createDiv({ cls: "of-task-list" });
		for (const task of tasks) {
			this.renderTaskRow(list, task);
		}
	}

	private renderTaskRow(container: HTMLElement, task: OFTask): void {
		const row = container.createDiv({
			cls: `of-task-row ${task.completed ? "of-task-completed" : ""}`,
		});

		// Checkbox
		const checkbox = row.createEl("input", {
			type: "checkbox",
			cls: "of-task-checkbox",
		});
		checkbox.checked = task.completed;
		checkbox.addEventListener("change", () => this.toggleComplete(task, checkbox.checked));

		// Content
		const content = row.createDiv({ cls: "of-task-content" });
		const nameRow = content.createDiv({ cls: "of-task-name-row" });
		nameRow.createSpan({ text: task.name, cls: "of-task-name" });

		// Meta row
		const meta = content.createDiv({ cls: "of-task-meta" });

		if (task.projectName) {
			meta.createSpan({ text: task.projectName, cls: "of-task-project" });
		}
		if (task.dueDate) {
			const isOverdue = task.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10);
			meta.createSpan({
				text: `Due ${task.dueDate.slice(0, 10)}`,
				cls: `of-task-due ${isOverdue ? "of-task-overdue" : ""}`,
			});
		}
		if (task.tags.length > 0) {
			meta.createSpan({
				text: task.tags.map((t) => t.name).join(", "),
				cls: "of-task-tags",
			});
		}
		if (task.estimatedMinutes) {
			meta.createSpan({
				text: `${task.estimatedMinutes}m`,
				cls: "of-task-estimate",
			});
		}

		// Actions
		const actions = row.createDiv({ cls: "of-task-actions" });

		// Flag button
		const flagBtn = actions.createEl("button", {
			cls: `of-icon-btn of-flag-btn ${task.flagged ? "of-flagged" : ""}`,
			attr: { "aria-label": task.flagged ? "Unflag" : "Flag" },
		});
		setIcon(flagBtn, "flag");
		flagBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.toggleFlag(task);
		});

		// Due date button
		const dueBtn = actions.createEl("button", {
			cls: "of-icon-btn",
			attr: { "aria-label": "Set due date" },
		});
		setIcon(dueBtn, "calendar");
		dueBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.promptDueDate(task);
		});
	}

	// ---------------------------------------------------------------
	// Actions
	// ---------------------------------------------------------------

	private async toggleComplete(task: OFTask, completed: boolean): Promise<void> {
		try {
			if (completed) {
				await runJXA(buildMarkCompleteScript(task.id));
			} else {
				await runJXA(buildMarkIncompleteScript(task.id));
			}
			new Notice(completed ? "Task completed" : "Task reopened");
			// Quick cache update
			task.completed = completed;
			await this.render();
			// Full sync in background
			this.syncFn();
		} catch (err) {
			new Notice(`Failed: ${err instanceof Error ? err.message : String(err)}`);
			await this.render();
		}
	}

	private async toggleFlag(task: OFTask): Promise<void> {
		try {
			await runJXA(buildSetFlagScript(task.id, !task.flagged));
			task.flagged = !task.flagged;
			new Notice(task.flagged ? "Task flagged" : "Task unflagged");
			await this.render();
			this.syncFn();
		} catch (err) {
			new Notice(`Failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private promptDueDate(task: OFTask): void {
		const input = document.createElement("input");
		input.type = "date";
		input.value = task.dueDate ? task.dueDate.slice(0, 10) : "";
		input.classList.add("omnifocus-bridge-hidden-picker");
		document.body.appendChild(input);
		input.showPicker();
		input.addEventListener("change", async () => {
			const val = input.value;
			document.body.removeChild(input);
			if (!val) return;
			try {
				await runJXA(buildSetDueDateScript(task.id, val));
				task.dueDate = new Date(val).toISOString();
				new Notice(`Due date set to ${val}`);
				await this.render();
				this.syncFn();
			} catch (err) {
				new Notice(`Failed: ${err instanceof Error ? err.message : String(err)}`);
			}
		});
		input.addEventListener("blur", () => {
			if (document.body.contains(input)) {
				document.body.removeChild(input);
			}
		});
	}

	private showQuickAdd(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		const existing = container.querySelector(".of-quick-add");
		if (existing) {
			existing.remove();
			return;
		}

		const form = container.createDiv({ cls: "of-quick-add" });
		const input = form.createEl("input", {
			type: "text",
			cls: "of-quick-add-input",
			attr: { placeholder: "New task name..." },
		});
		const submit = form.createEl("button", {
			text: "Add",
			cls: "of-quick-add-btn",
		});

		const doAdd = async () => {
			const name = input.value.trim();
			if (!name) return;
			submit.disabled = true;
			submit.textContent = "...";
			try {
				await runJXA(buildCreateTaskScript({ name }));
				new Notice(`Task "${name}" created`);
				form.remove();
				this.syncFn();
			} catch (err) {
				new Notice(`Failed: ${err instanceof Error ? err.message : String(err)}`);
				submit.disabled = false;
				submit.textContent = "Add";
			}
		};

		submit.addEventListener("click", doAdd);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") doAdd();
			if (e.key === "Escape") form.remove();
		});
		input.focus();
	}

	private async doSync(btn: HTMLElement): Promise<void> {
		if (this.isRefreshing) return;
		this.isRefreshing = true;
		btn.addClass("of-spin");
		try {
			await this.syncFn();
			await this.render();
		} finally {
			this.isRefreshing = false;
			btn.removeClass("of-spin");
		}
	}

	// ---------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------

	private getAllTasks(data: CacheData): OFTask[] {
		const tasks: OFTask[] = [...data.inboxTasks];
		for (const p of data.projects) {
			tasks.push(...p.tasks);
		}
		return tasks;
	}

	private timeAgo(date: Date): string {
		const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
		if (seconds < 60) return "just now";
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		return `${Math.floor(hours / 24)}d ago`;
	}
}
