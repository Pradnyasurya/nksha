/**
 * Deterministic export planning (#9). The video steps `render(t)` at fixed
 * 1/30s intervals of output time; each frame advances playback time by
 * `speedMultiplier / fps` seconds, mirroring on-screen playback speed.
 */

export const EXPORT_FPS = 30;
export const EXPORT_WIDTH = 1920;
export const EXPORT_HEIGHT = 1080;
/** Ranges that would produce more than this many seconds are warned about. */
export const SUGGESTED_MAX_DURATION_SEC = 120;

export interface ExportPlan {
  frameCount: number;
  /** Output length in seconds. */
  durationSec: number;
  /** Playback-time advance per output frame, in milliseconds. */
  dataStepMs: number;
}

export function planExport(
  rangeStartMs: number,
  rangeEndMs: number,
  speedMultiplier: number,
): ExportPlan {
  const spanMs = Math.max(1, rangeEndMs - rangeStartMs);
  const safeSpeed = Math.max(1, speedMultiplier);
  const durationSec = spanMs / 1000 / safeSpeed;
  const frameCount = Math.max(1, Math.ceil(durationSec * EXPORT_FPS));
  return {
    frameCount,
    durationSec,
    // Uniform stepping over the whole range keeps the final frame inside it.
    dataStepMs: spanMs / frameCount,
  };
}

/** Playback-time t for output frame `index`. Pure and deterministic. */
export function frameTimeMs(plan: ExportPlan, rangeStartMs: number, index: number): number {
  return rangeStartMs + index * plan.dataStepMs;
}

export function exceedsSuggestedDuration(plan: ExportPlan): boolean {
  return plan.durationSec > SUGGESTED_MAX_DURATION_SEC;
}
