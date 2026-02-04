import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import { prisma } from "@/lib/db";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const RECORDINGS_DIR = path.join(UPLOAD_DIR, "recordings");

/**
 * Probe video duration using ffprobe.
 * Returns duration in seconds or 0 on failure.
 */
function probeDuration(inputPath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      inputPath,
    ]);

    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.on("close", () => {
      try {
        const info = JSON.parse(stdout);
        const dur = parseFloat(info?.format?.duration);
        resolve(isNaN(dur) ? 0 : Math.round(dur));
      } catch {
        resolve(0);
      }
    });
    proc.on("error", () => resolve(0));
  });
}

/**
 * Run a single ffmpeg encode and return the output path.
 */
function runFfmpeg(args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[video-processing] Starting ffmpeg ${label}`);
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("close", (code) => {
      if (code === 0) {
        console.log(`[video-processing] ffmpeg ${label} completed`);
        resolve();
      } else {
        console.error(`[video-processing] ffmpeg ${label} failed (code ${code}):\n${stderr.slice(-500)}`);
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
    proc.on("error", (err) => {
      console.error(`[video-processing] ffmpeg ${label} spawn error:`, err.message);
      reject(err);
    });
  });
}

/**
 * Probe video resolution (width x height) using ffprobe.
 */
function probeResolution(inputPath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      "-select_streams", "v:0",
      inputPath,
    ]);
    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.on("close", () => {
      try {
        const info = JSON.parse(stdout);
        const stream = info?.streams?.[0];
        resolve({ width: stream?.width || 0, height: stream?.height || 0 });
      } catch {
        resolve({ width: 0, height: 0 });
      }
    });
    proc.on("error", () => resolve({ width: 0, height: 0 }));
  });
}

/**
 * Re-encode a video to H.264 MP4 with fast-start for instant playback.
 * Generates multiple resolutions (720p main + 360p for slow connections).
 *
 * - Uses libx264 with "fast" preset for quicker processing
 * - AAC audio at 128k
 * - movflags +faststart moves moov atom to beginning for instant playback
 * - Scales down to 720p as the primary file (good quality/bandwidth balance)
 * - Generates a 360p low-bandwidth variant for slow connections
 * - Populates the `resolutions` JSON field on the Video record
 */
export async function processVideo(videoId: string, rawFilePath: string): Promise<void> {
  const absoluteInput = path.isAbsolute(rawFilePath)
    ? rawFilePath
    : path.join(process.cwd(), rawFilePath);

  const dir = path.dirname(absoluteInput);
  const ts = Date.now();
  const output720Name = `processed_720_${ts}.mp4`;
  const output360Name = `processed_360_${ts}.mp4`;
  const absoluteOutput720 = path.join(dir, output720Name);
  const absoluteOutput360 = path.join(dir, output360Name);

  try {
    // Get duration and source resolution in parallel
    const [durationSec, sourceRes] = await Promise.all([
      probeDuration(absoluteInput),
      probeResolution(absoluteInput),
    ]);

    // Determine which resolutions to generate based on source
    const sourceHeight = sourceRes.height || 1080;

    // Always produce a 720p (or smaller if source is smaller) as the main file
    const mainScale = sourceHeight > 720
      ? "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2"
      : "scale=iw:ih:force_divisible_by=2";

    // CRITICAL: -movflags +faststart MUST be present on every MP4 encode.
    // It relocates the moov atom to the beginning of the file so browsers
    // can start playback immediately after fetching metadata. Without it,
    // the browser must download the entire mdat block first, causing a
    // multi-second (or multi-minute) stall before the first frame renders.
    const baseArgs = [
      "-i", absoluteInput,
      "-c:v", "libx264",
      "-preset", "fast",
      // Streaming-friendly encode settings:
      // - main profile + level 3.1: wide device compatibility, lower decode complexity
      // - g 48 / keyint_min 48: fixed 2-second GOP at 24fps, guarantees a keyframe
      //   every 2s so the browser can start decoding quickly after any seek or startup
      // - sc_threshold 0: disables scene-change detection keyframes, keeping GOP regular
      "-profile:v", "main",
      "-level", "3.1",
      "-g", "48",
      "-keyint_min", "48",
      "-sc_threshold", "0",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-y",
    ];

    // Encode 720p main file
    await runFfmpeg([
      ...baseArgs,
      "-crf", "23",
      "-vf", mainScale,
      absoluteOutput720,
    ], `720p for video ${videoId}`);

    // Verify main output
    const stat720 = await fs.stat(absoluteOutput720);
    if (stat720.size === 0) throw new Error("720p output is empty");

    // Always generate /uploads/... URLs regardless of UPLOAD_DIR location
    const uploadsBase = path.isAbsolute(UPLOAD_DIR) ? UPLOAD_DIR : path.resolve(process.cwd(), UPLOAD_DIR);
    const relWithinUploads = path.relative(uploadsBase, dir).replace(/\\/g, "/");
    const url720 = `/uploads/${relWithinUploads}/${output720Name}`;

    // Build resolutions list
    const resolutions: Array<{ label: string; url: string; height: number }> = [];

    // If source was HD+, label the 720p as "720p" and try to make a 360p
    if (sourceHeight > 480) {
      resolutions.push({ label: "720p", url: url720, height: 720 });

      // Generate 360p low-bandwidth variant (non-blocking for the READY status)
      try {
        await runFfmpeg([
          ...baseArgs,
          "-crf", "28",
          "-vf", "scale='min(640,iw)':'min(360,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
          absoluteOutput360,
        ], `360p for video ${videoId}`);

        const stat360 = await fs.stat(absoluteOutput360);
        if (stat360.size > 0) {
          const url360 = `/uploads/${relWithinUploads}/${output360Name}`;
          resolutions.push({ label: "360p", url: url360, height: 360 });
        }
      } catch (err360) {
        console.error(`[video-processing] 360p generation failed for ${videoId} (non-fatal):`, err360);
        // 360p failure is non-fatal — we still have the 720p
      }
    } else {
      // Source is already low-res, just use the single output
      const label = sourceHeight <= 360 ? "360p" : sourceHeight <= 480 ? "480p" : "720p";
      resolutions.push({ label, url: url720, height: sourceHeight });
    }

    // Update the video record: new URL, accurate duration, resolutions, mark as READY
    const updateData: Record<string, unknown> = {
      videoUrl: url720,
      storagePath: absoluteOutput720,
      status: "READY",
      resolutions: resolutions,
    };

    if (durationSec > 0) {
      updateData.durationSec = durationSec;
    }

    await prisma.video.update({
      where: { id: videoId },
      data: updateData,
    });

    // Delete the original raw file to save disk space
    try {
      await fs.unlink(absoluteInput);
      console.log(`[video-processing] Deleted raw file for video ${videoId}`);
    } catch {
      // Non-critical — original stays on disk
    }

    console.log(`[video-processing] Video ${videoId} is now READY at ${url720} (${resolutions.length} resolution(s))`);
  } catch (err) {
    console.error(`[video-processing] Failed for video ${videoId}:`, err);

    // Mark video as FAILED so the creator sees the error
    try {
      await prisma.video.update({
        where: { id: videoId },
        data: { status: "FAILED" },
      });
    } catch (dbErr) {
      console.error(`[video-processing] Could not mark video ${videoId} as FAILED:`, dbErr);
    }

    // Clean up partial outputs
    for (const f of [absoluteOutput720, absoluteOutput360]) {
      try { await fs.unlink(f); } catch { /* May not exist */ }
    }
  }
}

/**
 * Merge recording chunks into a single MP4 file using ffmpeg.
 * Used for post-processing live stream recordings.
 */
export async function mergeRecordingChunks(recordingId: string, inputPath: string): Promise<void> {
  const absoluteInput = path.isAbsolute(inputPath)
    ? inputPath
    : path.join(process.cwd(), inputPath);

  await fs.mkdir(path.join(process.cwd(), RECORDINGS_DIR), { recursive: true });

  const outputName = `recording_${recordingId}_${Date.now()}.mp4`;
  const absoluteOutput = path.join(process.cwd(), RECORDINGS_DIR, outputName);

  try {
    const durationSec = await probeDuration(absoluteInput);

    // CRITICAL: +faststart required — see comment in processVideo()
    await runFfmpeg([
      "-i", absoluteInput,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-vf", "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-y",
      absoluteOutput,
    ], `recording merge ${recordingId}`);

    const stat = await fs.stat(absoluteOutput);
    const relativeOutput = `/${RECORDINGS_DIR}/${outputName}`;

    const updateData: Record<string, unknown> = {
      filePath: relativeOutput,
      status: "READY",
      sizeBytes: stat.size,
    };

    if (durationSec > 0) {
      updateData.durationSec = durationSec;
    }

    await prisma.recording.update({
      where: { id: recordingId },
      data: updateData,
    });

    // Delete the source webm
    try {
      await fs.unlink(absoluteInput);
    } catch {
      // Non-critical
    }

    console.log(`[recording] Recording ${recordingId} is now READY at ${relativeOutput}`);
  } catch (err) {
    console.error(`[recording] Failed for recording ${recordingId}:`, err);

    try {
      await prisma.recording.update({
        where: { id: recordingId },
        data: { status: "FAILED" },
      });
    } catch (dbErr) {
      console.error(`[recording] Could not mark recording ${recordingId} as FAILED:`, dbErr);
    }

    try {
      await fs.unlink(absoluteOutput);
    } catch {
      // May not exist
    }
  }
}

interface TextOverlayEdit {
  text: string;
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  bold: boolean;
  italic: boolean;
  underline?: boolean;
  opacity?: number;
  rotation?: number;
  shadow?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  outline?: boolean;
  outlineColor?: string;
  outlineWidth?: number;
  textAlign?: "left" | "center" | "right";
}

interface FilterEdit {
  type: "brightness" | "contrast" | "saturation" | "grayscale" | "sepia" | "blur" | "sharpen"
    | "vignette" | "noise" | "film-grain" | "hue-rotate" | "invert" | "temperature" | "tint"
    | "highlights" | "shadows" | "vibrance" | "clarity";
  value: number;
  startTime: number;
  endTime: number;
}

interface SpeedEdit {
  startTime: number;
  endTime: number;
  speed: number;
  reverse?: boolean;
  easing?: string;
}

interface AudioEdit {
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  bass?: number;
  treble?: number;
  noiseReduction?: boolean;
  normalize?: boolean;
  compressor?: boolean;
}

interface TransitionEdit {
  type: string;
  startTime: number;
  duration: number;
  easing?: string;
}

interface CropEdit {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
}

interface FreezeFrameEdit {
  time: number;
  duration: number;
  startTime: number;
}

interface StickerEdit {
  emoji: string;
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  size: number;
  rotation?: number;
  opacity?: number;
}

interface EditOptions {
  trimStart?: number;
  trimEnd?: number;
  cuts?: Array<{ start: number; end: number }>;
  textOverlays?: TextOverlayEdit[];
  filters?: FilterEdit[];
  speedSegments?: SpeedEdit[];
  audio?: AudioEdit;
  transitions?: TransitionEdit[];
  crop?: CropEdit;
  freezeFrames?: FreezeFrameEdit[];
  stickers?: StickerEdit[];
  resolution?: "480p" | "720p" | "1080p" | "4k";
  format?: "mp4" | "webm";
  quality?: "draft" | "standard" | "high";
}

/**
 * Get resolution scale filter string.
 */
function getScaleFilter(resolution: string): string {
  switch (resolution) {
    case "480p":
      return "scale='min(854,iw)':'min(480,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
    case "720p":
      return "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
    case "4k":
      return "scale='min(3840,iw)':'min(2160,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
    default: // 1080p
      return "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
  }
}

/**
 * Get encoding parameters based on quality preset.
 */
function getQualityParams(quality: string): { crf: string; preset: string } {
  switch (quality) {
    case "draft":
      return { crf: "28", preset: "ultrafast" };
    case "high":
      return { crf: "18", preset: "slow" };
    default: // standard
      return { crf: "23", preset: "medium" };
  }
}

/**
 * Build ffmpeg video filter chain for all edit operations.
 */
function buildVideoFilters(edits: EditOptions, scale: string): string {
  const filters: string[] = [scale];

  // Crop transform
  if (edits.crop) {
    const c = edits.crop;
    if (c.width < 100 || c.height < 100 || c.x > 0 || c.y > 0) {
      filters.push(`crop=iw*${(c.width / 100).toFixed(4)}:ih*${(c.height / 100).toFixed(4)}:iw*${(c.x / 100).toFixed(4)}:ih*${(c.y / 100).toFixed(4)}`);
    }
    if (c.rotation !== 0) {
      const radians = (c.rotation * Math.PI) / 180;
      filters.push(`rotate=${radians.toFixed(4)}:c=black@0:ow=rotw(${radians.toFixed(4)}):oh=roth(${radians.toFixed(4)})`);
    }
    if (c.flipH) {
      filters.push("hflip");
    }
    if (c.flipV) {
      filters.push("vflip");
    }
  }

  // Speed segments → setpts filter
  if (edits.speedSegments && edits.speedSegments.length > 0) {
    for (const s of edits.speedSegments) {
      const pts = (1 / s.speed).toFixed(4);
      const enable = `enable='between(t,${s.startTime},${s.endTime})'`;
      filters.push(`setpts=if(${enable.replace("enable=", "")},PTS*${pts},PTS)`);
    }
  }

  // Text overlays → drawtext filter
  if (edits.textOverlays && edits.textOverlays.length > 0) {
    for (const t of edits.textOverlays) {
      const escapedText = t.text.replace(/'/g, "'\\''").replace(/:/g, "\\:");
      const parts = [
        `drawtext=text='${escapedText}'`,
        `x=(w*${t.x / 100})`,
        `y=(h*${t.y / 100})`,
        `fontsize=${t.fontSize}`,
        `fontcolor=${t.color}${t.opacity !== undefined && t.opacity < 1 ? `@${t.opacity.toFixed(2)}` : ""}`,
      ];

      if (t.bold) parts.push("font=Bold");
      if (t.backgroundColor && t.backgroundColor !== "transparent") {
        parts.push(`boxcolor=${t.backgroundColor}:boxborderw=4`);
      }
      if (t.shadow && t.shadowColor) {
        parts.push(`shadowcolor=${t.shadowColor}`);
        parts.push(`shadowx=${t.shadowBlur || 2}`);
        parts.push(`shadowy=${t.shadowBlur || 2}`);
      }
      if (t.outline && t.outlineColor) {
        parts.push(`bordercolor=${t.outlineColor}`);
        parts.push(`borderw=${t.outlineWidth || 2}`);
      }

      parts.push(`enable='between(t,${t.startTime},${t.endTime})'`);
      filters.push(parts.filter(Boolean).join(":"));
    }
  }

  // Sticker overlays — rendered as drawtext with emoji font
  if (edits.stickers && edits.stickers.length > 0) {
    for (const s of edits.stickers) {
      const escapedEmoji = s.emoji.replace(/'/g, "'\\''").replace(/:/g, "\\:");
      const parts = [
        `drawtext=text='${escapedEmoji}'`,
        `x=(w*${s.x / 100})`,
        `y=(h*${s.y / 100})`,
        `fontsize=${s.size}`,
        `fontcolor=white${s.opacity !== undefined && s.opacity < 1 ? `@${s.opacity.toFixed(2)}` : ""}`,
        `enable='between(t,${s.startTime},${s.endTime})'`,
      ];
      filters.push(parts.join(":"));
    }
  }

  // Filters → ffmpeg video filters
  if (edits.filters && edits.filters.length > 0) {
    for (const f of edits.filters) {
      const enable = `enable='between(t,${f.startTime},${f.endTime})'`;
      switch (f.type) {
        case "brightness": {
          const val = (f.value / 100 - 1).toFixed(2);
          filters.push(`eq=brightness=${val}:${enable}`);
          break;
        }
        case "contrast": {
          const val = (f.value / 100).toFixed(2);
          filters.push(`eq=contrast=${val}:${enable}`);
          break;
        }
        case "saturation": {
          const val = (f.value / 100).toFixed(2);
          filters.push(`eq=saturation=${val}:${enable}`);
          break;
        }
        case "grayscale":
          filters.push(`hue=s=0:${enable}`);
          break;
        case "sepia":
          filters.push(`colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0:${enable}`);
          break;
        case "blur": {
          const sigma = Math.max(0.1, f.value / 20);
          filters.push(`gblur=sigma=${sigma}:${enable}`);
          break;
        }
        case "sharpen":
          filters.push(`unsharp=5:5:${(f.value / 100).toFixed(1)}:5:5:0:${enable}`);
          break;
        case "vignette": {
          const angle = (f.value / 100 * 0.5).toFixed(2);
          filters.push(`vignette=angle=${angle}:${enable}`);
          break;
        }
        case "noise": {
          const amount = Math.round(f.value / 5);
          filters.push(`noise=alls=${amount}:allf=t:${enable}`);
          break;
        }
        case "film-grain": {
          const grainAmount = Math.round(f.value / 4);
          filters.push(`noise=alls=${grainAmount}:allf=t:${enable}`);
          break;
        }
        case "hue-rotate": {
          const degrees = ((f.value - 100) * 3.6).toFixed(0);
          filters.push(`hue=h=${degrees}:${enable}`);
          break;
        }
        case "invert":
          filters.push(`negate=1:${enable}`);
          break;
        case "temperature": {
          // Warm (>100) adds red/yellow, cool (<100) adds blue
          const tempShift = (f.value - 100) / 100;
          if (tempShift > 0) {
            filters.push(`colorbalance=rs=${(tempShift * 0.3).toFixed(2)}:gs=${(tempShift * 0.1).toFixed(2)}:bs=${(-tempShift * 0.3).toFixed(2)}:${enable}`);
          } else {
            filters.push(`colorbalance=rs=${(tempShift * 0.3).toFixed(2)}:gs=${(tempShift * 0.1).toFixed(2)}:bs=${(-tempShift * 0.3).toFixed(2)}:${enable}`);
          }
          break;
        }
        case "tint": {
          const tintShift = ((f.value - 100) / 100 * 0.3).toFixed(2);
          filters.push(`colorbalance=gs=${tintShift}:gm=${tintShift}:gh=${tintShift}:${enable}`);
          break;
        }
        case "highlights": {
          const hlVal = ((f.value - 100) / 100).toFixed(2);
          filters.push(`curves=highlights='0/0 0.5/${(0.5 + parseFloat(hlVal) * 0.2).toFixed(2)} 1/1':${enable}`);
          break;
        }
        case "shadows": {
          const shVal = ((f.value - 100) / 100).toFixed(2);
          filters.push(`curves=shadows='0/0 0.5/${(0.5 + parseFloat(shVal) * 0.2).toFixed(2)} 1/1':${enable}`);
          break;
        }
        case "vibrance": {
          // Vibrance approximated with saturation adjustment
          const vibVal = (f.value / 100).toFixed(2);
          filters.push(`eq=saturation=${vibVal}:${enable}`);
          break;
        }
        case "clarity": {
          // Clarity = local contrast enhancement via unsharp mask with large radius
          const clarityVal = (f.value / 50).toFixed(1);
          filters.push(`unsharp=13:13:${clarityVal}:13:13:0:${enable}`);
          break;
        }
      }
    }
  }

  // Transitions — apply fade effects at transition points
  if (edits.transitions && edits.transitions.length > 0) {
    for (const t of edits.transitions) {
      switch (t.type) {
        case "fade":
        case "fade-black":
          filters.push(`fade=t=out:st=${t.startTime}:d=${(t.duration / 2).toFixed(2)}`);
          filters.push(`fade=t=in:st=${(t.startTime + t.duration / 2).toFixed(2)}:d=${(t.duration / 2).toFixed(2)}`);
          break;
        case "fade-white":
          filters.push(`fade=t=out:st=${t.startTime}:d=${(t.duration / 2).toFixed(2)}:color=white`);
          filters.push(`fade=t=in:st=${(t.startTime + t.duration / 2).toFixed(2)}:d=${(t.duration / 2).toFixed(2)}:color=white`);
          break;
        case "dissolve":
          filters.push(`fade=t=out:st=${t.startTime}:d=${t.duration.toFixed(2)}:alpha=1`);
          break;
        case "blur-transition": {
          const mid = t.startTime + t.duration / 2;
          filters.push(`gblur=sigma='if(between(t,${t.startTime},${mid}),(t-${t.startTime})/${(t.duration / 2).toFixed(2)}*20,if(between(t,${mid},${t.startTime + t.duration}),(${t.startTime + t.duration}-t)/${(t.duration / 2).toFixed(2)}*20,0))'`);
          break;
        }
        // Other transition types rendered as simple fades as fallback
        default:
          filters.push(`fade=t=out:st=${t.startTime}:d=${(t.duration / 2).toFixed(2)}`);
          filters.push(`fade=t=in:st=${(t.startTime + t.duration / 2).toFixed(2)}:d=${(t.duration / 2).toFixed(2)}`);
          break;
      }
    }
  }

  return filters.join(",");
}

/**
 * Build ffmpeg audio filter chain for volume, mute, fades, EQ, and speed.
 */
function buildAudioFilters(edits: EditOptions, totalDuration: number): string {
  const filters: string[] = [];

  if (edits.audio) {
    if (edits.audio.muted) {
      filters.push("volume=0");
    } else if (edits.audio.volume !== 100) {
      filters.push(`volume=${(edits.audio.volume / 100).toFixed(2)}`);
    }

    if (edits.audio.fadeIn > 0) {
      filters.push(`afade=t=in:st=0:d=${edits.audio.fadeIn}`);
    }

    if (edits.audio.fadeOut > 0) {
      const fadeStart = Math.max(0, totalDuration - edits.audio.fadeOut);
      filters.push(`afade=t=out:st=${fadeStart}:d=${edits.audio.fadeOut}`);
    }

    // Bass boost/cut via low-shelf equalizer
    if (edits.audio.bass !== undefined && edits.audio.bass !== 0) {
      const bassGain = edits.audio.bass;
      filters.push(`equalizer=f=100:t=h:w=200:g=${bassGain}`);
    }

    // Treble boost/cut via high-shelf equalizer
    if (edits.audio.treble !== undefined && edits.audio.treble !== 0) {
      const trebleGain = edits.audio.treble;
      filters.push(`equalizer=f=3000:t=h:w=2000:g=${trebleGain}`);
    }

    // Noise reduction via highpass + lowpass combo
    if (edits.audio.noiseReduction) {
      filters.push("highpass=f=80");
      filters.push("lowpass=f=12000");
      filters.push("afftdn=nf=-25");
    }

    // Loudness normalization
    if (edits.audio.normalize) {
      filters.push("loudnorm=I=-16:TP=-1.5:LRA=11");
    }

    // Dynamic range compression
    if (edits.audio.compressor) {
      filters.push("acompressor=threshold=-20dB:ratio=4:attack=5:release=50");
    }
  }

  // Speed segments affect audio — chain atempo filters
  if (edits.speedSegments && edits.speedSegments.length > 0) {
    for (const s of edits.speedSegments) {
      if (s.reverse) {
        filters.push("areverse");
      }
      let speed = s.speed;
      // atempo only supports 0.5-100.0 range, chain for extreme values
      while (speed > 2.0) {
        filters.push("atempo=2.0");
        speed /= 2.0;
      }
      while (speed < 0.5) {
        filters.push("atempo=0.5");
        speed *= 2.0;
      }
      if (Math.abs(speed - 1.0) > 0.001) {
        filters.push(`atempo=${speed.toFixed(4)}`);
      }
    }
  }

  return filters.join(",");
}

/**
 * Apply editor edits (trim, cuts, text, filters, speed, audio, transitions, crop, stickers, freeze frames)
 * via ffmpeg and export to MP4/WebM.
 */
export async function exportEditedVideo(
  inputPath: string,
  outputName: string,
  edits: EditOptions
): Promise<string> {
  const absoluteInput = path.isAbsolute(inputPath)
    ? inputPath
    : path.join(process.cwd(), inputPath);

  await fs.mkdir(path.join(process.cwd(), RECORDINGS_DIR), { recursive: true });
  const absoluteOutput = path.join(process.cwd(), RECORDINGS_DIR, outputName);

  const { trimStart, trimEnd, cuts, resolution = "1080p", format = "mp4", quality = "standard" } = edits;
  const scale = getScaleFilter(resolution);
  const { crf, preset } = getQualityParams(quality);

  const videoFilters = buildVideoFilters(edits, scale);
  const totalDuration = await probeDuration(absoluteInput);
  const audioFilters = buildAudioFilters(edits, totalDuration);

  // Determine codec settings based on format
  const isWebm = format === "webm";
  const videoCodecArgs = isWebm
    ? ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", crf]
    : ["-c:v", "libx264", "-preset", preset, "-crf", crf];
  const audioCodecArgs = isWebm
    ? ["-c:a", "libopus", "-b:a", "128k"]
    : ["-c:a", "aac", "-b:a", "128k"];
  // CRITICAL: +faststart required for MP4 — see comment in processVideo()
  const containerArgs = isWebm ? [] : ["-movflags", "+faststart"];

  // Check for reverse speed segments — if any, we need special handling
  const hasReverse = edits.speedSegments?.some((s) => s.reverse) || false;

  // If we have cuts, we need to use the concat demuxer approach
  if (cuts && cuts.length > 0) {
    const duration = totalDuration;
    const segments: Array<{ start: number; end: number }> = [];
    const sortedCuts = [...cuts].sort((a, b) => a.start - b.start);

    let cursor = trimStart || 0;
    for (const cut of sortedCuts) {
      if (cut.start > cursor) {
        segments.push({ start: cursor, end: cut.start });
      }
      cursor = cut.end;
    }
    const endTime = trimEnd || duration;
    if (cursor < endTime) {
      segments.push({ start: cursor, end: endTime });
    }

    const concatContent = segments
      .map((s) => `file '${absoluteInput}'\ninpoint ${s.start}\noutpoint ${s.end}`)
      .join("\n");

    const concatPath = absoluteOutput + ".concat.txt";
    await fs.writeFile(concatPath, concatContent, "utf-8");

    await new Promise<void>((resolve, reject) => {
      const args = [
        "-f", "concat", "-safe", "0",
        "-i", concatPath,
        ...videoCodecArgs,
        "-vf", videoFilters,
        ...(audioFilters ? ["-af", audioFilters] : []),
        ...audioCodecArgs,
        ...containerArgs,
        "-y", absoluteOutput,
      ];

      console.log(`[export] Starting ffmpeg export with cuts: ${args.join(" ")}`);
      const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else {
          console.error(`[export] ffmpeg failed (code ${code}):\n${stderr.slice(-500)}`);
          reject(new Error(`ffmpeg exit ${code}`));
        }
      });
      proc.on("error", reject);
    });

    await fs.unlink(concatPath).catch(() => {});
  } else {
    const args = [
      "-i", absoluteInput,
      ...(trimStart ? ["-ss", String(trimStart)] : []),
      ...(trimEnd ? ["-to", String(trimEnd)] : []),
      ...videoCodecArgs,
      "-vf", videoFilters,
      ...(audioFilters ? ["-af", audioFilters] : []),
      ...audioCodecArgs,
      ...containerArgs,
      "-y", absoluteOutput,
    ];

    console.log(`[export] Starting ffmpeg export: ${args.join(" ")}`);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else {
          console.error(`[export] ffmpeg failed (code ${code}):\n${stderr.slice(-500)}`);
          reject(new Error(`ffmpeg exit ${code}`));
        }
      });
      proc.on("error", reject);
    });
  }

  return `/${RECORDINGS_DIR}/${outputName}`;
}
