import {
  ArrayBufferTarget,
  Muxer,
} from "mp4-muxer";
import {
  EXPORT_FPS,
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  type ExportPlan,
} from "./framePlanner";

/**
 * Silent video export from deterministic frames (#9). Primary path steps the
 * renderer at exact 1/30s intervals through WebCodecs H.264 into an MP4;
 * when WebCodecs is unavailable, MediaRecorder captures the same stepped
 * frames into a WebM as a graceful fallback.
 */

export class ExportCancelledError extends Error {
  constructor() {
    super("Export cancelled");
    this.name = "ExportCancelledError";
  }
}

const TARGET_BITRATE = 8_000_000;
/** H.264 profiles tried in order: High 4.0, Main 4.0, Baseline 4.0. */
const AVC_CANDIDATES = ["avc1.640028", "avc1.4d0028", "avc1.42e01f"];

export interface EncodeOptions {
  plan: ExportPlan;
  /** Draws output frame `index` and resolves to a ready canvas image source. */
  drawFrame: (index: number) => Promise<CanvasImageSource>;
  /** Canvas the fallback recorder captures; ignored by the WebCodecs path. */
  fallbackCanvas?: HTMLCanvasElement;
  onProgress?: (framesDone: number, frameCount: number) => void;
  shouldCancel?: () => boolean;
}

export interface EncodeResult {
  blob: Blob;
  extension: "mp4" | "webm";
}

export async function encodePlaybackVideo(
  options: EncodeOptions,
): Promise<EncodeResult> {
  assertNotCancelled(options.shouldCancel);
  if (typeof window !== "undefined" && typeof window.VideoEncoder === "function") {
    const codec = await firstSupportedAvcCodec();
    if (codec) return encodeWithWebCodecs(options, codec);
  }
  if (typeof MediaRecorder === "function" && options.fallbackCanvas) {
    return encodeWithMediaRecorder(options);
  }
  throw new Error(
    "This browser cannot export video — neither WebCodecs nor MediaRecorder is available.",
  );
}

async function firstSupportedAvcCodec(): Promise<string | null> {
  for (const codec of AVC_CANDIDATES) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width: EXPORT_WIDTH,
        height: EXPORT_HEIGHT,
        bitrate: TARGET_BITRATE,
        framerate: EXPORT_FPS,
      });
      if (support.supported) return codec;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

async function encodeWithWebCodecs(
  options: EncodeOptions,
  codec: string,
): Promise<EncodeResult> {
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: EXPORT_WIDTH, height: EXPORT_HEIGHT },
    fastStart: "in-memory",
  });

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });
  encoder.configure({
    codec,
    width: EXPORT_WIDTH,
    height: EXPORT_HEIGHT,
    bitrate: TARGET_BITRATE,
    framerate: EXPORT_FPS,
  });

  try {
    const frameDurationUs = Math.round(1_000_000 / EXPORT_FPS);
    for (let index = 0; index < options.plan.frameCount; index++) {
      assertNotCancelled(options.shouldCancel);
      if (encoderError) throw encoderError;

      const source = await options.drawFrame(index);
      const frame = new VideoFrame(source, {
        timestamp: Math.round((index * 1_000_000) / EXPORT_FPS),
        duration: frameDurationUs,
      });
      encoder.encode(frame, { keyFrame: index % (EXPORT_FPS * 2) === 0 });
      frame.close();

      // Keep the encode queue shallow so cancel stays responsive.
      while (encoder.encodeQueueSize > 8 && !options.shouldCancel?.()) {
        await sleep(4);
      }
      options.onProgress?.(index + 1, options.plan.frameCount);
    }

    assertNotCancelled(options.shouldCancel);
    await encoder.flush();
  } finally {
    encoder.close();
  }
  if (encoderError) throw encoderError;

  muxer.finalize();
  const buffer = (muxer.target as ArrayBufferTarget).buffer;
  return {
    blob: new Blob([buffer], { type: "video/mp4" }),
    extension: "mp4",
  };
}

/**
 * Fallback path: capture a zero-fps stream and push each deterministically
 * drawn frame by hand, pacing at realtime so timestamps land at ~30fps.
 */
async function encodeWithMediaRecorder(options: EncodeOptions): Promise<EncodeResult> {
  const canvas = options.fallbackCanvas!;
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(
    (candidate) => MediaRecorder.isTypeSupported(candidate),
  );
  if (!mimeType) throw new Error("No supported MediaRecorder video format.");

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: TARGET_BITRATE,
  });
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start();
  let cancelled = false;
  try {
    for (let index = 0; index < options.plan.frameCount; index++) {
      if (options.shouldCancel?.()) {
        cancelled = true;
        break;
      }
      await options.drawFrame(index);
      track.requestFrame();
      options.onProgress?.(index + 1, options.plan.frameCount);
      await sleep(1000 / EXPORT_FPS);
    }
  } finally {
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
  }
  if (cancelled) throw new ExportCancelledError();

  return {
    blob: new Blob(chunks, { type: mimeType }),
    extension: "webm",
  };
}

function assertNotCancelled(shouldCancel?: () => void | boolean): void {
  if (shouldCancel?.()) throw new ExportCancelledError();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
