import type { CacheData } from "../types";
import type { DataAdapter } from "obsidian";

export class CacheManager {
	private filePath: string;

	constructor(
		private adapter: DataAdapter,
		pluginId: string
	) {
		this.filePath = `.obsidian/plugins/${pluginId}/cache.json`;
	}

	async load(): Promise<CacheData | null> {
		try {
			const exists = await this.adapter.exists(this.filePath);
			if (!exists) return null;

			const raw = await this.adapter.read(this.filePath);
			return JSON.parse(raw) as CacheData;
		} catch {
			return null;
		}
	}

	async save(data: CacheData): Promise<void> {
		await this.adapter.write(this.filePath, JSON.stringify(data, null, 2));
	}

	async getLastSyncTime(): Promise<string | null> {
		const data = await this.load();
		return data?.syncedAt ?? null;
	}
}
