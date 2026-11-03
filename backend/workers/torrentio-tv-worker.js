require("dotenv").config();
const {
  getNextTvBulkItem,
  updateTvBulkStatus,
  saveTvStreamsToDb,
} = require("../database/supabase");
const { getTvStreams } = require("../scrapers/torrentio");

/**
 * PikiStreams Dedicated Torrentio TV Worker
 *
 * - Reads directly from Supabase `bulk_tv_queue`.
 * - Does NOT touch Playwright, Chromium, Cheerio, or existing scrapers.
 * - Applies strict browser-playable filtering (x264/AAC, smallest size, max 3 streams).
 * - Saves selected streams directly to `tv_streams` in Supabase.
 */

const DELAY_BETWEEN_JOBS_MS = 1500; // 1.5-second politeness delay between jobs
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const args = process.argv.slice(2);
const isExplicitRun = args.includes("--run");

if (!isExplicitRun) {
  console.error("\n🛑 SAFETY WARNING: Torrentio TV Bulk worker not started.");
  console.error("To run the Torrentio TV worker intentionally, use:");
  console.error("   npm run worker:torrentio:tv\n");
  process.exit(1);
}

async function runTorrentioTvWorker() {
  console.log("====================================================");
  console.log("   PikiStreams Torrentio TV Worker (INDEPENDENT)    ");
  console.log("   Zero Playwright | Direct Native Browser Streams   ");
  console.log("====================================================");
  console.log("[Torrentio TV Worker] Polling bulk_tv_queue...\n");

  let isRunning = true;

  process.on("SIGINT", () => {
    console.log("\n[Torrentio TV Worker] Gracefully stopping worker...");
    isRunning = false;
    process.exit(0);
  });

  while (isRunning) {
    try {
      const item = await getNextTvBulkItem();

      if (!item) {
        console.log(
          "[Torrentio TV Worker] bulk_tv_queue is empty. Idle (checking every 10s)...",
        );
        await sleep(10000);
        continue;
      }

      const isPack = item.mode === "season_pack" || item.episode === null;
      const episodeStr = isPack
        ? `S${String(item.season).padStart(2, "0")} (Season Pack)`
        : `S${String(item.season).padStart(2, "0")}E${String(item.episode).padStart(2, "0")}`;

      console.log(
        `[Torrentio TV Worker] Processing Job #${item.id}: "${item.title}" [${episodeStr}] (TMDB: ${item.tmdb_id})`,
      );

      // Query Torrentio independently with optimal 3-stream browser filter
      const streams = await getTvStreams({
        imdbId: item.imdb_id || null,
        tmdbId: item.tmdb_id,
        season: item.season,
        episode: item.episode || 1, // Default to episode 1 if season pack
        filterOptimal: true,
      });

      if (streams && streams.length > 0) {
        console.log(
          `[Torrentio TV Worker] Found ${streams.length} optimal stream(s) for "${item.title}" ${episodeStr}:`,
        );
        streams.forEach((s, idx) => {
          console.log(
            `   [${idx + 1}] (${s.quality}) ${s.size} | ${s.seeders} seeds | ${s.provider}`,
          );
        });

        // Save directly to Supabase tv_streams
        await saveTvStreamsToDb({
          tmdbId: item.tmdb_id,
          imdbId: item.imdb_id,
          showTitle: item.title,
          season: item.season,
          episode: item.episode,
          isSeasonPack: isPack,
          streamsList: streams,
        });

        console.log(`[Torrentio TV Worker] Saved to database successfully.`);
      } else {
        console.log(
          `[Torrentio TV Worker] No matching streams found for "${item.title}" ${episodeStr}.`,
        );
      }

      await updateTvBulkStatus(item.id, "completed");
      console.log(
        `[Torrentio TV Worker] Resting ${DELAY_BETWEEN_JOBS_MS / 1000}s...\n`,
      );
      await sleep(DELAY_BETWEEN_JOBS_MS);
    } catch (err) {
      console.error("[Torrentio TV Worker] Error processing job:", err.message);
      await sleep(5000);
    }
  }
}

runTorrentioTvWorker();
