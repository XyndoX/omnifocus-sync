/**
 * Minimal mock of the obsidian module for tests.
 * The real obsidian package is types-only (no JS runtime), so Vite
 * cannot resolve it. This file is aliased via vitest.config.ts.
 */

export class Notice {
	constructor(public message: string, public timeout?: number) {}
}

export class Plugin {}
export class TFile {}
export class TFolder {}
export class PluginSettingTab {}

export class Modal {
	app: unknown;
	contentEl: { empty: () => void; createEl: () => HTMLElement };
	constructor(app: unknown) {
		this.app = app;
		this.contentEl = {
			empty: () => {},
			createEl: () => document.createElement("div"),
		};
	}
	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

export class Setting {
	constructor(_containerEl: unknown) {}
	setName(_name: string): this { return this; }
	setDesc(_desc: string): this { return this; }
	addText(_cb: (text: unknown) => unknown): this { return this; }
	addTextArea(_cb: (textarea: unknown) => unknown): this { return this; }
	addToggle(_cb: (toggle: unknown) => unknown): this { return this; }
	addDropdown(_cb: (dropdown: unknown) => unknown): this { return this; }
	addButton(_cb: (btn: unknown) => unknown): this { return this; }
}

export const Platform = {
	isMacOS: true,
	isWin: false,
	isLinux: false,
	isMobile: false,
	isDesktop: true,
	isDesktopApp: true,
	isMobileApp: false,
};
