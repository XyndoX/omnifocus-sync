import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SyncScheduler } from "../scheduler";
import { DEFAULT_SETTINGS } from "../../types";
import type { PluginSettings } from "../../types";

// Provide a `window` global so `window.setInterval` / `window.clearInterval`
// resolve in the Node test environment (Obsidian runtime provides this natively).
if (typeof window === "undefined") {
	(globalThis as any).window = globalThis;
}

describe("SyncScheduler", () => {
	let syncFn: ReturnType<typeof vi.fn>;
	let settings: PluginSettings;

	beforeEach(() => {
		vi.useFakeTimers();
		syncFn = vi.fn().mockResolvedValue(undefined);
		settings = { ...DEFAULT_SETTINGS };
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// -------------------------------------------------------------------
	// Manual interval
	// -------------------------------------------------------------------

	describe("manual interval", () => {
		it("does not start a timer when syncInterval is 'manual'", () => {
			settings.syncInterval = "manual";
			const scheduler = new SyncScheduler(syncFn, settings);

			scheduler.start();

			// Advance well past any reasonable interval
			vi.advanceTimersByTime(60 * 60 * 1000);

			expect(syncFn).not.toHaveBeenCalled();
		});
	});

	// -------------------------------------------------------------------
	// Non-manual intervals
	// -------------------------------------------------------------------

	describe("non-manual intervals", () => {
		it("calls sync function at 1-minute interval", () => {
			settings.syncInterval = "1";
			const scheduler = new SyncScheduler(syncFn, settings);

			scheduler.start();

			// Should not have been called yet
			expect(syncFn).not.toHaveBeenCalled();

			// Advance 1 minute
			vi.advanceTimersByTime(60 * 1000);
			expect(syncFn).toHaveBeenCalledTimes(1);

			// Advance another minute
			vi.advanceTimersByTime(60 * 1000);
			expect(syncFn).toHaveBeenCalledTimes(2);

			scheduler.stop();
		});

		it("calls sync function at 5-minute interval", () => {
			settings.syncInterval = "5";
			const scheduler = new SyncScheduler(syncFn, settings);

			scheduler.start();

			// Advance 4 minutes -- should not have fired yet
			vi.advanceTimersByTime(4 * 60 * 1000);
			expect(syncFn).not.toHaveBeenCalled();

			// Advance to 5 minutes
			vi.advanceTimersByTime(1 * 60 * 1000);
			expect(syncFn).toHaveBeenCalledTimes(1);

			scheduler.stop();
		});

		it("calls sync function at 15-minute interval", () => {
			settings.syncInterval = "15";
			const scheduler = new SyncScheduler(syncFn, settings);

			scheduler.start();

			vi.advanceTimersByTime(15 * 60 * 1000);
			expect(syncFn).toHaveBeenCalledTimes(1);

			vi.advanceTimersByTime(15 * 60 * 1000);
			expect(syncFn).toHaveBeenCalledTimes(2);

			scheduler.stop();
		});

		it("calls sync function at 30-minute interval", () => {
			settings.syncInterval = "30";
			const scheduler = new SyncScheduler(syncFn, settings);

			scheduler.start();

			vi.advanceTimersByTime(30 * 60 * 1000);
			expect(syncFn).toHaveBeenCalledTimes(1);

			scheduler.stop();
		});
	});

	// -------------------------------------------------------------------
	// updateSettings
	// -------------------------------------------------------------------

	describe("updateSettings", () => {
		it("restarts timer with new interval when interval changes", () => {
			settings.syncInterval = "5";
			const scheduler = new SyncScheduler(syncFn, settings);
			scheduler.start();

			// Advance 3 minutes (hasn't fired yet at 5-min interval)
			vi.advanceTimersByTime(3 * 60 * 1000);
			expect(syncFn).not.toHaveBeenCalled();

			// Change to 1-minute interval
			const newSettings = { ...settings, syncInterval: "1" as const };
			scheduler.updateSettings(newSettings);

			// After 1 minute from the update, should fire
			vi.advanceTimersByTime(1 * 60 * 1000);
			expect(syncFn).toHaveBeenCalledTimes(1);

			scheduler.stop();
		});

		it("stops timer when changed to manual", () => {
			settings.syncInterval = "1";
			const scheduler = new SyncScheduler(syncFn, settings);
			scheduler.start();

			// Verify it works first
			vi.advanceTimersByTime(60 * 1000);
			expect(syncFn).toHaveBeenCalledTimes(1);

			// Switch to manual
			const newSettings = { ...settings, syncInterval: "manual" as const };
			scheduler.updateSettings(newSettings);

			// Advance a long time -- should not fire again
			vi.advanceTimersByTime(60 * 60 * 1000);
			expect(syncFn).toHaveBeenCalledTimes(1);

			scheduler.stop();
		});

		it("does not restart timer when interval has not changed", () => {
			settings.syncInterval = "5";
			const scheduler = new SyncScheduler(syncFn, settings);
			scheduler.start();

			// Advance 3 minutes
			vi.advanceTimersByTime(3 * 60 * 1000);
			expect(syncFn).not.toHaveBeenCalled();

			// Update settings without changing interval
			const newSettings = { ...settings, showDueDate: false };
			scheduler.updateSettings(newSettings);

			// The original timer should still be running.
			// 2 more minutes to reach the original 5-minute mark
			vi.advanceTimersByTime(2 * 60 * 1000);
			expect(syncFn).toHaveBeenCalledTimes(1);

			scheduler.stop();
		});
	});

	// -------------------------------------------------------------------
	// stop
	// -------------------------------------------------------------------

	describe("stop", () => {
		it("clears the timer so sync is no longer called", () => {
			settings.syncInterval = "1";
			const scheduler = new SyncScheduler(syncFn, settings);
			scheduler.start();

			// Fire once
			vi.advanceTimersByTime(60 * 1000);
			expect(syncFn).toHaveBeenCalledTimes(1);

			scheduler.stop();

			// Should not fire again
			vi.advanceTimersByTime(5 * 60 * 1000);
			expect(syncFn).toHaveBeenCalledTimes(1);
		});

		it("is safe to call stop multiple times", () => {
			settings.syncInterval = "1";
			const scheduler = new SyncScheduler(syncFn, settings);
			scheduler.start();

			scheduler.stop();
			scheduler.stop(); // should not throw

			vi.advanceTimersByTime(5 * 60 * 1000);
			expect(syncFn).not.toHaveBeenCalled();
		});

		it("is safe to call stop without having started", () => {
			const scheduler = new SyncScheduler(syncFn, settings);

			// Should not throw
			scheduler.stop();
		});
	});

	// -------------------------------------------------------------------
	// start idempotency
	// -------------------------------------------------------------------

	describe("start behavior", () => {
		it("calling start twice does not create duplicate timers", () => {
			settings.syncInterval = "1";
			const scheduler = new SyncScheduler(syncFn, settings);

			scheduler.start();
			scheduler.start();

			vi.advanceTimersByTime(60 * 1000);
			// Should only fire once, not twice
			expect(syncFn).toHaveBeenCalledTimes(1);

			scheduler.stop();
		});
	});
});
