// src/ui/date-input-modal.ts
import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";

/**
 * Simple modal for entering a date in YYYY-MM-DD format.
 * Includes a "Clear" button to set the date to null.
 */
export class DateInputModal extends Modal {
	private dateValue: string;

	constructor(
		app: App,
		private title: string,
		private currentValue: string | null,
		private onSubmit: (date: string | null) => void
	) {
		super(app);
		this.dateValue = currentValue ?? "";
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h3", { text: this.title });

		new Setting(contentEl)
			.setName("Date")
			.setDesc("Format: YYYY-MM-DD")
			.addText((text) =>
				text
					.setPlaceholder("YYYY-MM-DD")
					.setValue(this.dateValue)
					.onChange((value) => {
						this.dateValue = value;
					})
			);

		// Action buttons
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						const trimmed = this.dateValue.trim();
						this.onSubmit(trimmed.length > 0 ? trimmed : null);
						this.close();
					})
			)
			.addButton((btn) =>
				btn.setButtonText("Clear").onClick(() => {
					this.onSubmit(null);
					this.close();
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
}
