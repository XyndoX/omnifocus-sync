import type { IDMap } from "../types";
import type { DataAdapter } from "obsidian";

const EMPTY_MAP: IDMap = { tasks: {}, projects: {} };

export class IDMapper {
	private filePath: string;

	constructor(
		private adapter: DataAdapter,
		pluginId: string
	) {
		this.filePath = `.obsidian/plugins/${pluginId}/id-map.json`;
	}

	async load(): Promise<IDMap> {
		try {
			const exists = await this.adapter.exists(this.filePath);
			if (!exists) return { ...EMPTY_MAP };

			const raw = await this.adapter.read(this.filePath);
			return JSON.parse(raw) as IDMap;
		} catch {
			return { ...EMPTY_MAP };
		}
	}

	async save(map: IDMap): Promise<void> {
		await this.adapter.write(this.filePath, JSON.stringify(map, null, 2));
	}

	async setTask(taskId: string, filePath: string): Promise<void> {
		const map = await this.load();
		map.tasks[taskId] = filePath;
		await this.save(map);
	}

	async setProject(projectId: string, filePath: string): Promise<void> {
		const map = await this.load();
		map.projects[projectId] = filePath;
		await this.save(map);
	}
}
