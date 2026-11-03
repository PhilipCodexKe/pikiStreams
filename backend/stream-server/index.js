"use strict";

/**
 * PikiStreams — Stream Server (Phase 1 + 2)
 *
 * Phase 1 fixes (vs. original):
 *   1. LRU torrent cache with auto-evict + destroy
 *   2. req.on('close') → readStream.destroy() on disconnect/seek
 *   3. stream.pipeline() instead of .pipe()
 *   4. Correct Content-Type per file extension
 *   5. maxConns: 30 to save per-wire RAM
 *   6. POST /stream/init + GET /stream/:infoHash (no huge magnets in URL)
 *   7. Torrent error handlers + 30s DHT timeout
 *
 * Phase 2 additions:
 *   A. .torrent buffer cache — if the client sends a `torrentUrl` (YTS provides
 *      these directly), the stream server fetches the .torrent file and passes
 *      the buffer to client.add() instead of the magnet URI. This completely
 *      skips DHT metadata resolution: TTFB drops from ~15s → ~1-3s.
 *
 *   B. MKV → fMP4 remux — when the primary video file is an MKV, ffmpeg remuxes
 *      it to fragmented MP4 (-c copy, zero re-encoding, ~2% CPU) on the fly.
 *      Result: MKV plays in all browsers including Safari.
 *      Range requests (seeks) on MKV fall back to direct byte serving so seeking
 *      still works in Chrome/Firefox via their native MKV H.264 support.
 *      ffmpeg is auto-detected; if absent, MKV is served directly with the
 *      correct MIME type (best-effort, works in Chrome/Firefox).
 */

const express = require("express");
const cors = require("cors");
const { pipeline } = require("stream");
const { LRUCache } = require("lru-cache");
const { spawn } = require("child_process");
const { execSync } = require("child_process");
const axios = require("axios");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ─── WebTorrent client (initialised async on boot) ────────────────────────────
let client = null;

// ─── ffmpeg availability (Phase 2B) ──────────────────────────────────────────
let ffmpegPath = null;

function detectFfmpeg() {
  // 1. Try ffmpeg-static (bundled binary — installed as npm dep if available)
  try {
    ffmpegPath = require("ffmpeg-static");
    console.log("[ffmpeg] Using bundled ffmpeg-static");
    return;
  } catch (_) {
    /* not installed */
  }

  // 2. Try system PATH ffmpeg
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    ffmpegPath = "ffmpeg";
    console.log("[ffmpeg] Using system ffmpeg");
    return;
  } catch (_) {
    /* not on PATH */
  }

  console.warn(
    "[ffmpeg] Not found. MKV files will be served directly (works in Chrome/Firefox).\n" +
      "         Install via: npm install ffmpeg-static   OR   install system ffmpeg.",
  );
}

// ─── LRU Torrent Cache ────────────────────────────────────────────────────────
const MAX_TORRENTS = 10;
const METADATA_TIMEOUT = 30_000; // ms before DHT cold-start gives up

const torrentCache = new LRUCache({
  max: MAX_TORRENTS,
  dispose: (torrent, key) => {
    if (torrent && !torrent.destroyed) {
      console.log(`[LRU] Evicting: ${key.slice(0, 20)}...`);
      torrent.destroy({ destroyStore: true }, () => {});
    }
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const VIDEO_EXTS = [".mp4", ".m4v", ".mov", ".mkv", ".avi", ".webm"];

const MIME_MAP = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/mp4",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".webm": "video/webm",
};

function getFileExt(filename) {
  return filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
}

function getMimeType(filename) {
  return MIME_MAP[getFileExt(filename)] || "video/mp4";
}

function getVideoFile(torrent, requestedFileIdx = null, season = null, episode = null) {
  if (!torrent.files || !torrent.files.length) return null;

  console.log(`[Stream DEBUG] Torrent files found (${torrent.files.length}):`);
  for (let i = 0; i < Math.min(torrent.files.length, 25); i++) {
    const f = torrent.files[i];
    console.log(`  [${i}] "${f.name}" (${(f.length / (1024 * 1024)).toFixed(2)} MB)`);
  }
  if (torrent.files.length > 25) {
    console.log(`  ... and ${torrent.files.length - 25} more files.`);
  }

  // 1. Explicit fileIdx passed (e.g. from Torrentio season pack matching)
  if (requestedFileIdx !== null && requestedFileIdx !== undefined) {
    const idx = parseInt(requestedFileIdx, 10);
    if (!isNaN(idx) && torrent.files[idx]) {
      console.log(`[Stream DEBUG] Matched target file via explicit fileIdx [${idx}]: "${torrent.files[idx].name}"`);
      return torrent.files[idx];
    }
  }

  // 2. Season & Episode Regex Matching (e.g. S01E02, 1x02, Episode 2)
  if (episode !== null && episode !== undefined) {
    const epNum = parseInt(episode, 10);
    const sNum = season ? parseInt(season, 10) : null;

    const patterns = [];
    if (sNum) {
      patterns.push(new RegExp(`s0?${sNum}[._ -]?e0?${epNum}\\b`, 'i'));
      patterns.push(new RegExp(`\\b${sNum}x0?${epNum}\\b`, 'i'));
    }
    patterns.push(new RegExp(`\\be0?${epNum}\\b`, 'i'));
    patterns.push(new RegExp(`\\bepisode[._ -]?0?${epNum}\\b`, 'i'));

    for (const pattern of patterns) {
      const match = torrent.files.find(f => {
        const isVid = VIDEO_EXTS.some(ext => f.name.toLowerCase().endsWith(ext));
        return isVid && pattern.test(f.name);
      });
      if (match) {
        console.log(`[Stream DEBUG] Matched target episode file via pattern (${pattern}): "${match.name}"`);
        return match;
      }
    }
  }

  // 3. Fallback: Filter only genuine video files and pick the largest one (feature movie / single episode)
  const videoFiles = torrent.files.filter((f) => {
    const name = f.name.toLowerCase();
    return VIDEO_EXTS.some((ext) => name.endsWith(ext));
  });

  if (videoFiles.length > 0) {
    const primaryVideo = videoFiles.slice().sort((a, b) => b.length - a.length)[0];
    console.log(`[Stream DEBUG] Defaulted to largest video file: "${primaryVideo.name}" (${(primaryVideo.length / (1024 * 1024)).toFixed(2)} MB)`);
    return primaryVideo;
  }

  console.error("[Stream ERROR] No valid video file found among torrent files!");
  return null;
}

// ─── Phase 2A: .torrent buffer fetch ─────────────────────────────────────────
/**
 * Download a .torrent file from a URL and return its Buffer.
 * YTS provides these directly (e.g. https://yts.mx/torrent/download/HASH).
 * Fetching the .torrent buffer skips DHT entirely; client.add(buffer) resolves
 * metadata in <1s instead of the typical 30-60s DHT cold start.
 */
async function fetchTorrentBuffer(torrentUrl) {
  const candidateUrls = [];

  // Extract hash if present in URL
  let hash = null;
  const match = torrentUrl.match(/([a-fA-F0-9]{40})/);
  if (match) {
    hash = match[1].toLowerCase();
  }

  // Prioritize official YTS download mirrors that don't block with HTTP 436
  if (hash) {
    candidateUrls.push(
      `https://yts.mx/torrent/download/${hash}`,
      `https://yts.lt/torrent/download/${hash}`,
      `https://yts.pm/torrent/download/${hash}`,
      `https://yts.do/torrent/download/${hash}`,
      `https://yts.ag/torrent/download/${hash}`
    );
  }

  // Also include original URL if different
  if (!candidateUrls.includes(torrentUrl)) {
    candidateUrls.push(torrentUrl);
  }

  let lastErr = null;
  for (const url of candidateUrls) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 5_000,
        maxRedirects: 5,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml,application/x-bittorrent,*/*;q=0.9",
          Referer: "https://yts.mx/",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      const buf = Buffer.from(response.data);
      // Valid .torrent files always start with 'd' (0x64 in hex)
      if (buf.length > 50 && buf[0] === 0x64) {
        return buf;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error("Failed to download valid .torrent buffer");
}

// ─── Core: add torrent + wait for metadata ────────────────────────────────────
/**
 * Wait for a torrent to be ready if it's currently resolving metadata.
 */
function waitForTorrentReady(torrent) {
  if (torrent.ready && torrent.files && torrent.files.length) {
    return Promise.resolve(torrent);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          "Timeout waiting for existing torrent metadata to become ready.",
        ),
      );
    }, METADATA_TIMEOUT);

    torrent.once("ready", () => {
      clearTimeout(timer);
      resolve(torrent);
    });

    torrent.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Add a magnet OR a .torrent Buffer to the client and resolve when the file
 * list is known (torrent 'ready' event). Rejects after METADATA_TIMEOUT ms.
 */
function addTorrentAndWait(magnetOrBuffer) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          "Torrent metadata timeout (30s). The swarm may have too few peers — try a higher-seeder source.",
        ),
      );
    }, METADATA_TIMEOUT);

    const t = client.add(magnetOrBuffer, { strategy: "sequential" });

    t.once("ready", () => {
      clearTimeout(timer);
      resolve(t);
    });
    t.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ─── Phase 2B: MKV → fMP4 remux via ffmpeg ───────────────────────────────────
/**
 * Pipe a WebTorrent read stream through ffmpeg for container-only remux
 * (MKV → fragmented MP4). Zero re-encoding: codecs are copied as-is.
 *
 * Flags used:
 *   frag_keyint       — fragment at every keyframe (enables client-side seeking)
 *   empty_moov        — write an empty moov atom at start so playback begins instantly
 *   default_base_moof — use default-base-is-moof flag for wider compatibility
 *
 * Output is chunked (no Content-Length) — the browser parses fMP4 fragments
 * incrementally and builds an internal seek table from them.
 *
 * @returns {ChildProcess} the spawned ffmpeg process (for cleanup on disconnect)
 */
function remuxToFmp4(torrentReadStream, res) {
  res.writeHead(200, {
    "Content-Type": "video/mp4",
    "Transfer-Encoding": "chunked",
    "Cache-Control": "no-cache",
  });

  const ff = spawn(
    ffmpegPath,
    [
      "-loglevel",
      "error", // suppress verbose ffmpeg output
      "-i",
      "pipe:0", // read from stdin
      "-c:v",
      "copy", // copy video stream (no re-encode)
      "-c:a",
      "copy", // copy audio stream (no re-encode)
      "-movflags",
      "frag_keyint+empty_moov+default_base_moof",
      "-f",
      "mp4", // output format: MP4
      "pipe:1", // write to stdout
    ],
    { stdio: ["pipe", "pipe", "ignore"] },
  );

  // torrent stream → ffmpeg stdin
  pipeline(torrentReadStream, ff.stdin, (err) => {
    if (err && err.code !== "ERR_STREAM_PREMATURE_CLOSE") {
      if (!ff.killed) ff.kill("SIGKILL");
    }
  });

  // ffmpeg stdout → HTTP response
  pipeline(ff.stdout, res, (err) => {
    if (
      err &&
      err.code !== "ERR_STREAM_PREMATURE_CLOSE" &&
      err.code !== "ECONNRESET"
    ) {
      console.error("[Remux] Output pipeline error:", err.message);
    }
  });

  return ff;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /stream/init
 * Body: { magnet: string, infoHash?: string, torrentUrl?: string }
 *
 * Phase 2A: if `torrentUrl` is provided, fetches the .torrent buffer first.
 * This is typically 10-20x faster than waiting for DHT metadata.
 * Falls back to magnet URI if the buffer fetch fails.
 *
 * Returns: { infoHash: string }
 */
app.post("/stream/init", async (req, res) => {
  if (!client) {
    return res
      .status(503)
      .json({ error: "Torrent client is initializing. Retry in a moment." });
  }

  const { magnet, infoHash, torrentUrl, fileIdx, season, episode } = req.body;
  if (!magnet) {
    return res
      .status(400)
      .json({ error: '"magnet" field is required in request body.' });
  }

  const cacheKey = infoHash || magnet;

  try {
    // ── 1. LRU cache hit ──────────────────────────────────────────────────────
    if (torrentCache.has(cacheKey)) {
      const cached = torrentCache.get(cacheKey);
      await waitForTorrentReady(cached);
      console.log(`[Init] Cache HIT: ${cached.infoHash}`);
      return res.json({ infoHash: cached.infoHash });
    }

    // ── 2. Already in client (edge case: evicted from LRU but still active) ──
    // Note: In WebTorrent v2, client.get() returns a Promise resolving to torrent or null
    const existing = await (infoHash
      ? client.get(infoHash)
      : client.get(magnet));
    if (existing) {
      await waitForTorrentReady(existing);
      torrentCache.set(cacheKey, existing);
      console.log(`[Init] Client HIT: ${existing.infoHash}`);
      return res.json({ infoHash: existing.infoHash });
    }

    // ── 3. New torrent ────────────────────────────────────────────────────────
    let source = magnet; // default: DHT via magnet
    let isBuffer = false;

    // Phase 2A: Only query YTS .torrent buffer if torrentUrl is explicitly provided
    // and points to YTS (do NOT guess yts.mx for TV shows or non-YTS movies)
    const downloadTargetUrl = (torrentUrl && (torrentUrl.includes('yts.') || torrentUrl.includes('yify'))) 
      ? torrentUrl 
      : null;

    if (downloadTargetUrl) {
      try {
        console.log(`[Init] Fetching .torrent buffer: ${downloadTargetUrl}`);
        source = await fetchTorrentBuffer(downloadTargetUrl);
        isBuffer = true;
        console.log(
          `[Init] .torrent buffer fetched (${source.length} bytes) — bypassing DHT metadata wait!`,
        );
      } catch (bufErr) {
        console.warn(
          `[Init] .torrent buffer fetch failed (${bufErr.message}), falling back to DHT magnet`,
        );
        source = magnet;
      }
    } else {
      console.log(
        `[Init] Resolving via tracker/DHT: ${(infoHash || magnet).slice(0, 60)}...`,
      );
    }

    // Ensure source is a valid magnet link or buffer.
    // If the frontend passed a raw 40-char infoHash instead of "magnet:?xt=urn:btih:...",
    // format it properly into a full magnet URI so WebTorrent parser does not crash.
    // Also inject fast public UDP trackers into any magnet lacking them to avoid cold DHT delays.
    if (typeof source === "string") {
      const clean = source.trim();
      const DEFAULT_TRACKERS =
        "&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce" +
        "&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce" +
        "&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce" +
        "&tr=udp%3A%2F%2Fexplodie.org%3A6969%2Fannounce";

      if (!clean.startsWith("magnet:?") && /^[0-9a-fA-F]{40}$/.test(clean)) {
        source = `magnet:?xt=urn:btih:${clean}${DEFAULT_TRACKERS}`;
        console.log(`[Init] Converted bare infoHash to magnet URI: ${clean}`);
      } else if (clean.startsWith("magnet:?") && !clean.includes("tr=")) {
        source = `${clean}${DEFAULT_TRACKERS}`;
        console.log(`[Init] Injected default UDP trackers into trackerless magnet`);
      }
    }

    const torrent = await addTorrentAndWait(source);

    torrent.on("error", (err) => {
      console.error(
        `[Torrent] Runtime error (${torrent.infoHash}):`,
        err.message,
      );
      torrentCache.delete(cacheKey);
    });

    torrentCache.set(cacheKey, torrent);

    // Attach target episode pointers to torrent object for subsequent /stream/:infoHash call
    if (fileIdx !== undefined) torrent._targetFileIdx = fileIdx;
    if (season !== undefined) torrent._targetSeason = season;
    if (episode !== undefined) torrent._targetEpisode = episode;

    console.log(
      `[Init] Ready → ${torrent.infoHash} | ` +
        `${torrent.files.length} file(s) | ` +
        `${torrent.numPeers} peer(s) | ` +
        `source: ${isBuffer ? ".torrent buffer (instant)" : "DHT magnet"}`,
    );

    return res.json({ infoHash: torrent.infoHash });
  } catch (err) {
    console.error("[Init] Failed:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /stream/:infoHash
 *
 * Streams the primary video file with HTTP Range support.
 *
 * Phase 2B MKV logic:
 *   - No Range header (or Range: bytes=0-): MKV → pipe through ffmpeg remux
 *     → fragmented MP4. Plays in all browsers. Browser seeks via fMP4 fragments.
 *   - Range request with start > 0 (user seeking): serve MKV directly.
 *     Chrome/Firefox handle H.264 MKV natively. Only Safari can't seek MKV
 *     (Phase 3 / HLS will fix that).
 *   - If ffmpeg not available: always serve MKV directly (Chrome/Firefox only).
 */
app.get("/stream/:infoHash", async (req, res) => {
  if (!client) return res.status(503).send("Torrent client not ready");

  const { infoHash } = req.params;

  let torrent = torrentCache.get(infoHash);
  if (!torrent) {
    torrent = await client.get(infoHash);
    if (torrent) torrentCache.set(infoHash, torrent);
  }

  if (!torrent) {
    return res
      .status(404)
      .json({ error: "Torrent not found. Call POST /stream/init first." });
  }

  try {
    await waitForTorrentReady(torrent);
  } catch (err) {
    return res.status(504).json({ error: "Torrent metadata not ready yet." });
  }

  // Resolve target file: checks query params first, then cached torrent metadata
  const targetFileIdx = req.query.fileIdx ?? torrent._targetFileIdx ?? null;
  const targetSeason = req.query.season ?? torrent._targetSeason ?? null;
  const targetEpisode = req.query.episode ?? torrent._targetEpisode ?? null;

  const file = getVideoFile(torrent, targetFileIdx, targetSeason, targetEpisode);
  if (!file) return res.status(404).send("No video file found in torrent");

  // ── Prioritize Initial Video Playback Pieces ──────────────────────────────
  // WebTorrent piece selection: aggressively demand the first 10MB (head)
  // and last 5MB (tail, for MP4 moov atom if placed at the end of the file).
  // Priority 1 is the highest urgency level in WebTorrent's swarm scheduler.
  try {
    if (typeof file.select === "function") {
      // Deselect unneeded files (images, txt, nfo, exe) to free wire bandwidth,
      // but keep subtitles (.srt, .vtt) enabled so captions stay available!
      torrent.files.forEach((other) => {
        if (other !== file && typeof other.deselect === "function") {
          const name = other.name.toLowerCase();
          const isSubtitle = /\.(srt|vtt|sub|idx)$/i.test(name);
          if (!isSubtitle) {
            other.deselect();
          }
        }
      });

      // Calculate pieces for the first 15 MB and the last 10 MB
      const pieceLen = torrent.pieceLength || 2 * 1024 * 1024;
      const headPieces = Math.min(torrent.pieces.length - 1, Math.ceil((15 * 1024 * 1024) / pieceLen));
      const tailStartPiece = Math.max(0, torrent.pieces.length - Math.ceil((10 * 1024 * 1024) / pieceLen));

      // Prioritize the head (pieces 0 to headPieces) with priority 1
      file.select(0, headPieces, 1);

      // Prioritize the tail (for moov atom metadata) with priority 1
      file.select(tailStartPiece, torrent.pieces.length - 1, 1);
    }
  } catch (pErr) {
    console.warn("[Stream] Piece prioritization note:", pErr.message);
  }

  const ext = getFileExt(file.name);
  const isMkv = ext === ".mkv";
  const mimeType = getMimeType(file.name);
  const fileSize = file.length;
  const rangeHeader = req.headers.range;

  // ── Phase 2B: MKV remux path ─────────────────────────────────────────────
  // Only remux on the initial request (no Range, or Range starts at 0).
  // On seeks (Range start > 0), fall back to direct serving so the browser
  // can jump to the right position — requires native MKV H.264 support.
  const isInitialRequest =
    !rangeHeader || rangeHeader.replace(/bytes=/, "").split("-")[0] === "0";

  if (isMkv && ffmpegPath && isInitialRequest) {
    console.log(`[Stream] MKV remux: "${file.name}" → fMP4`);
    const readStream = file.createReadStream();

    const ff = remuxToFmp4(readStream, res);

    req.on("close", () => {
      if (readStream && !readStream.destroyed) readStream.destroy();
      if (!ff.killed) ff.kill("SIGKILL");
    });
    return; // response is handled inside remuxToFmp4
  }

  // ── Standard path: direct byte serving (MP4, non-initial MKV, no ffmpeg) ──
  let readStream;
  let start = 0;
  let end = fileSize - 1;

  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    start = parseInt(parts[0], 10);
    end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    start = Math.max(0, start);
    end = Math.min(end, fileSize - 1);

    const chunkSize = end - start + 1;

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": mimeType,
    });
    readStream = file.createReadStream({ start, end });
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
    });
    readStream = file.createReadStream();
  }

  console.log(
    `[Stream] "${file.name}" | ${mimeType} | bytes ${start}–${end}/${fileSize}`,
  );

  req.on("close", () => {
    if (readStream && !readStream.destroyed) readStream.destroy();
  });

  pipeline(readStream, res, (err) => {
    if (
      err &&
      err.code !== "ERR_STREAM_PREMATURE_CLOSE" &&
      err.code !== "ECONNRESET"
    ) {
      console.error(`[Stream] Pipeline error (${infoHash}):`, err.message);
    }
  });
});

/**
 * GET /stream/status/:infoHash
 * Returns live torrent diagnostics.
 */
app.get("/stream/status/:infoHash", async (req, res) => {
  const t =
    torrentCache.get(req.params.infoHash) ??
    (await client?.get(req.params.infoHash));
  if (!t) return res.json({ found: false });

  return res.json({
    found: true,
    ready: t.ready,
    infoHash: t.infoHash,
    name: t.name,
    numPeers: t.numPeers,
    downloadSpeed: t.downloadSpeed,
    uploadSpeed: t.uploadSpeed,
    progress: t.progress,
    timeRemaining: t.timeRemaining,
  });
});

async function init() {
  detectFfmpeg(); // Phase 2B: probe for ffmpeg before accepting requests

  const { default: WebTorrent } = await import("webtorrent");

  client = new WebTorrent({
    maxConns: 80, // Allow more concurrent peers for faster unchoking
    uploadLimit: -1, // Do NOT set to 0: BitTorrent peers immediately choke clients that advertise 0 upload
  });

  client.on("error", (err) =>
    console.error("[WebTorrent] Client error:", err.message),
  );

  console.log(`[WebTorrent] Client initialized (maxConns=${client.maxConns})`);

  app.listen(PORT, () => {
    console.log(`[Stream Server] http://localhost:${PORT}`);
    console.log(
      "  POST /stream/init         — register magnet/torrentUrl → { infoHash }",
    );
    console.log(
      "  GET  /stream/:hash        — stream video (Range + MKV remux)",
    );
    console.log("  GET  /stream/status/:hash — live torrent diagnostics");
  });
}

init().catch((err) => {
  console.error("[Stream Server] Fatal startup error:", err);
  process.exit(1);
});
