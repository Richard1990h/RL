#!/usr/bin/env node
/**
 * Rally Live RTMP Ingest Server
 *
 * Accepts RTMP streams from OBS / Streamlabs and transcodes to HLS.
 * Stream URL in OBS:  rtmp://localhost:1935/live
 * Stream Key:         (user's persistent key from Creator Studio)
 *
 * On publish → validates stream key → creates LiveStream in DB → starts HLS output
 * On unpublish → ends the LiveStream
 */

const NodeMediaServer = require("node-media-server");
const path = require("path");
const fs = require("fs");

// ─── Config ──────────────────────────────────────────────────────────────────

const RTMP_PORT = parseInt(process.env.RTMP_PORT || "1935", 10);
const HTTP_PORT = parseInt(process.env.RTMP_HTTP_PORT || "8888", 10);
const API_BASE = process.env.API_BASE || "http://localhost:4500";
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads");
const HLS_DIR = path.join(UPLOAD_DIR, "hls");
const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";

// Ensure HLS output directory exists
fs.mkdirSync(HLS_DIR, { recursive: true });

const config = {
  rtmp: {
    port: RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
  http: {
    port: HTTP_PORT,
    allow_origin: "*",
    mediaroot: UPLOAD_DIR,
  },
  trans: {
    ffmpeg: FFMPEG_PATH,
    tasks: [
      {
        app: "live",
        hls: true,
        hlsFlags: "[hls_time=2:hls_list_size=5:hls_flags=delete_segments]",
        hlsKeep: false,
        dash: false,
      },
    ],
  },
};

const nms = new NodeMediaServer(config);

// Track active streams: streamKey → { userId, streamId }
const activeStreams = new Map();

// ─── Auth on publish ─────────────────────────────────────────────────────────

nms.on("prePublish", async (id, StreamPath, args) => {
  // StreamPath = /live/STREAM_KEY
  const parts = StreamPath.split("/");
  const streamKey = parts[parts.length - 1];

  if (!streamKey) {
    console.log(`[RTMP] Rejected stream ${id}: no stream key`);
    const session = nms.getSession(id);
    if (session) session.reject();
    return;
  }

  console.log(`[RTMP] Publish attempt: key=${streamKey.slice(0, 8)}...`);

  try {
    // Validate stream key via our API
    const res = await fetch(`${API_BASE}/api/live/ingest/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamKey }),
    });

    if (!res.ok) {
      console.log(`[RTMP] Rejected stream ${id}: invalid key (${res.status})`);
      const session = nms.getSession(id);
      if (session) session.reject();
      return;
    }

    const data = await res.json();
    const { userId, streamId } = data;

    activeStreams.set(streamKey, { userId, streamId });

    // Create user-specific HLS output directory
    const userHlsDir = path.join(HLS_DIR, streamKey);
    fs.mkdirSync(userHlsDir, { recursive: true });

    console.log(`[RTMP] Stream ${id} authorized: user=${userId}, stream=${streamId}`);
  } catch (err) {
    console.error(`[RTMP] Auth error for stream ${id}:`, err.message);
    const session = nms.getSession(id);
    if (session) session.reject();
  }
});

// ─── Cleanup on unpublish ────────────────────────────────────────────────────

nms.on("donePublish", async (id, StreamPath) => {
  const parts = StreamPath.split("/");
  const streamKey = parts[parts.length - 1];
  const info = activeStreams.get(streamKey);

  if (info) {
    console.log(`[RTMP] Stream ended: user=${info.userId}, stream=${info.streamId}`);

    try {
      // End the live stream via API
      await fetch(`${API_BASE}/api/live/ingest/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamKey, streamId: info.streamId }),
      });
    } catch (err) {
      console.error(`[RTMP] Failed to end stream:`, err.message);
    }

    activeStreams.delete(streamKey);
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

nms.run();

console.log(`
╔══════════════════════════════════════════════════╗
║         Rally Live RTMP Ingest Server            ║
╠══════════════════════════════════════════════════╣
║  RTMP:  rtmp://localhost:${RTMP_PORT}/live              ║
║  HTTP:  http://localhost:${HTTP_PORT}                   ║
║  HLS:   http://localhost:${HTTP_PORT}/hls/{key}/index.m3u8 ║
╚══════════════════════════════════════════════════╝
`);
