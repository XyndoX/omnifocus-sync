// src/ui/quick-add-modal.ts
import { Modal, Setting, Notice } from "obsidian";
import type { App } from "obsidian";
import type { CacheManager } from "../data/cache-manager";
import { runJXA } from "../bridge/jxa-runner";
import { buildCreateTaskScript } from "../bridge/jxa-write-scripts";

/**
 * Modal for creating a new task in OmniFocus.
 *
 * Fields: task name, project (dropdown), due date, defer date, flagged, note.
 * On submit, calls runJXA(buildCreateTaskScript({...})) and shows a Notice.
 */
export class QuickAddModal extends Modal {
	private taskName = "";
	private selectedProjectId = "";
	private dueDate = "";
	private deferDate = "";
	private flagged = false;
	private note = "";

	constructor(
		app: App,
		private cache: CacheManager,
		private defaultProjectId?: string,
		private onCreated?: () => void
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h3", { text: "Quick Add OmniFocus Task" });

		// Load cached projects for the dropdown
		const cacheData = await this.cache.load();
		const projects: { id: string; name: string }[] = [];
		if (cacheData) {
			for (const p of cacheData.projects) {
				projects.push({ id: p.id, name: p.name });
			}
		}

		// Pre-select default project or Inbox
		this.selectedProjectId = this.defaultProjectId ?? "";

		// Task name (required)
		new Setting(contentEl)
			.setName("Task name")
			.setDesc("Required")
			.addText((text) =>
				text
					.setPlaceholder("What needs to be done?")
					.onChange((value) => {
						this.taskName = value;
					})
			);

		// Project dropdown
		new Setting(contentEl)
			.setName("Project")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Inbox");
				for (const p of projects) {
					dropdown.addOption(p.id, p.name);
				}
				dropdown.setValue(this.selectedProjectId);
				dropdown.onChange((value) => {
					this.selectedProjectId = value;
				});
			});

		// Due Date
		new Setting(contentEl)
			.setName("Due date")
			.setDesc("YYYY-MM-DD")
			.addText((text) =>
				text.setPlaceholder("YYYY-MM-DD").onChange((value) => {
					this.dueDate = value;
				})
			);

		// Defer Date
		new Setting(contentEl)
			.setName("Defer date")
			.setDesc("YYYY-MM-DD")
			.addText((text) =>
				text.setPlaceholder("YYYY-MM-DD").onChange((value) => {
					this.deferDate = value;
				})
			);

		// Flagged
		new Setting(contentEl)
			.setName("Flagged")
			.addToggle((toggle) =>
				toggle.setValue(false).onChange((value) => {
					this.flagged = value;
				})
			);

		// Note
		new Setting(contentEl)
			.setName("Note")
			.addTextArea((textarea) =>
				textarea.setPlaceholder("Optional note...").onChange((value) => {
					this.note = value;
				})
			);

		// Submit / Cancel buttons
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Create Task")
					.setCta()
					.onClick(() => {
						this.submitTask();
					})
			)
			.addButton((btn) =>
				btn.setButtonText("Cancel").onClick(() => {
					this.close();
				})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submitTask(): Promise<void> {
		const name = this.taskName.trim();
		if (!name) {
			new Notice("Task name is required.");
			return;
		}

		try {
			const script = buildCreateTaskScript({
				name,
				projectId: this.selectedProjectId || undefined,
				dueDate: this.dueDate.trim() || undefined,
				deferDate: this.deferDate.trim() || undefined,
				flagged: this.flagged || undefined,
				note: this.note.trim() || undefined,
			});

			await runJXA(script);
			new Notice(`Task "${name}" created in OmniFocus.`);
			this.close();

			if (this.onCreated) {
				this.onCreated();
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error("QuickAddModal: failed to create task", err);
			new Notice(`Failed to create task: ${msg}`);
		}
	}
}
