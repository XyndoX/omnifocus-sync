// src/sync/scheduler.ts
import type { PluginSettings } from "../types";

const INTERVAL_MS: Record<string, number> = {
	"1": 1 * 60 * 1000,
	"5": 5 * 60 * 1000,
	"15": 15 * 60 * 1000,
	"30": 30 * 60 * 1000,
};

export class SyncScheduler {
	private timerId: number | null = null;
	private activeInterval: string;

	constructor(
		private syncFn: () => Promise<void>,
		private settings: PluginSettings
	) {
		this.activeInterval = settings.syncInterval;
	}

	/**
	 * Start the scheduler based on settings.syncInterval.
	 * If "manual", no timer is created.
	 */
	start(): void {
		this.stop();

		const interval = this.settings.syncInterval;
		this.activeInterval = interval;

		if (interval === "manual") {
			return;
		}

		const ms = INTERVAL_MS[interval];
		if (ms === undefined) {
			return;
		}

		this.timerId = window.setInterval(() => {
			this.syncFn();
		}, ms) as unknown as number;
	}

	/**
	 * Stop the scheduler and clear any active timer.
	 */
	stop(): void {
		if (this.timerId !== null) {
			window.clearInterval(this.timerId);
			this.timerId = null;
		}
	}

	/**
	 * Update settings and restart the timer if the interval changed.
	 */
	updateSettings(settings: PluginSettings): void {
		this.settings = settings;

		if (this.activeInterval !== settings.syncInterval) {
			this.start();
		}
	}
}
