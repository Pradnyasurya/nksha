import { describe, expect, it } from "vitest";
import {
  EXPORT_FPS,
  SUGGESTED_MAX_DURATION_SEC,
  exceedsSuggestedDuration,
  frameTimeMs,
  planExport,
} from "@/features/export/framePlanner";
import {
  encodePlaybackVideo,
  ExportCancelledError,
} from "@/features/export/videoExport";

const DAY_MS = 86_400_000;

describe("planExport", () => {
  it("steps playback time uniformly across the whole range", () => {
    const start = Date.parse("2024-01-01T00:00:00");
    const end = start + 10 * DAY_MS;
    const speed = 21_600; // 6 h/s → a 10-day range becomes 40 s of video.
    const plan = planExport(start, end, speed);

    expect(plan.durationSec).toBeCloseTo(40, 6);
    expect(plan.frameCount).toBe(Math.ceil(40 * EXPORT_FPS));
    expect(start + plan.frameCount * plan.dataStepMs).toBeGreaterThanOrEqual(end);
    expect(plan.dataStepMs).toBeCloseTo((10 * DAY_MS) / plan.frameCount, 6);
  });

  it("produces at least one frame for tiny ranges", () => {
    const plan = planExport(1000, 1001, 3600);
    expect(plan.frameCount).toBe(1);
    expect(frameTimeMs(plan, 1000, 0)).toBe(1000);
  });

  it("flags ranges beyond the suggested duration", () => {
    const start = 0;
    const fastEnough = planExport(start, start + SUGGESTED_MAX_DURATION_SEC * 3600 * 1000, 3600);
    expect(exceedsSuggestedDuration(fastEnough)).toBe(false);

    const tooLong = planExport(start, start + (SUGGESTED_MAX_DURATION_SEC + 30) * 3600 * 1000, 3600);
    expect(exceedsSuggestedDuration(tooLong)).toBe(true);
  });

  it("is deterministic — same inputs, same plan", () => {
    expect(planExport(0, DAY_MS, 600)).toEqual(planExport(0, DAY_MS, 600));
  });
});

describe("encodePlaybackVideo", () => {
  it("explains itself when no encoder exists", async () => {
    // jsdom has neither VideoEncoder nor MediaRecorder.
    await expect(
      encodePlaybackVideo({
        plan: { frameCount: 2, durationSec: 1 / 15, dataStepMs: 500 },
        drawFrame: async () => document.createElement("canvas"),
      }),
    ).rejects.toThrow(/cannot export video/i);
  });

  it("throws ExportCancelledError before drawing any frame when cancelled up front", async () => {
    let draws = 0;
    await expect(
      encodePlaybackVideo({
        plan: { frameCount: 5, durationSec: 1 / 6, dataStepMs: 200 },
        drawFrame: async () => {
          draws += 1;
          return document.createElement("canvas");
        },
        shouldCancel: () => true,
      }),
    ).rejects.toBeInstanceOf(ExportCancelledError);
    expect(draws).toBe(0);
  });
});
