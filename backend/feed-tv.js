require("dotenv").config();
const axios = require("axios");
const { enqueueTvBulk } = require("./database/supabase");

const TMDB_API_KEY =
  process.env.TMDB_API_KEY || "ab060bf4b27b23c908e05859d2ef7451";

/**
 * Fetch Popular TV Shows across TMDB pages until TARGET_VALID_SHOWS (default: 20)
 * matching the <= 6 seasons criteria are cataloged and queued.
 */
async function feedPopularTvShows(startPage = 1, queueSeasonPacks = true, targetValidShows = 20) {
  console.log("====================================================");
  console.log("   PikiStreams TV Shows Catalog & Feeder Pipeline   ");
  console.log(`   Target: Collect exactly ${targetValidShows} shows (<= 6 seasons)`);
  console.log("====================================================\n");

  const bulkQueueItems = [];
  let validShowsCount = 0;
  let currentPage = startPage;
  const maxPagesToScan = 20; // Safety boundary

  try {
    while (validShowsCount < targetValidShows && currentPage <= maxPagesToScan) {
      console.log(`[Feeder] Querying TMDB for Popular TV Shows (Page ${currentPage})...`);

      const res = await axios.get(
        `https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_API_KEY}&page=${currentPage}`,
        { timeout: 8000 }
      );

      const shows = res.data?.results || [];
      if (shows.length === 0) {
        console.log("[Feeder] No more shows returned from TMDB.");
        break;
      }

      for (const show of shows) {
        if (validShowsCount >= targetValidShows) break;

        try {
          const detailsRes = await axios.get(
            `https://api.themoviedb.org/3/tv/${show.id}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`,
            { timeout: 6000 }
          );
          const details = detailsRes.data;
          const imdbId = details.external_ids?.imdb_id || null;
          const releaseYear = details.first_air_date
            ? new Date(details.first_air_date).getFullYear()
            : null;
          const totalSeasons = details.number_of_seasons || 1;

          // Skip series with more than 6 seasons
          if (totalSeasons > 6) {
            console.log(`[Feeder] ⏭️ Skipping "${details.name}" (${totalSeasons} seasons > 6)`);
            continue;
          }

          validShowsCount++;
          console.log(
            `[Feeder] [${validShowsCount}/${targetValidShows}] Queued Show: "${details.name}" (${releaseYear || "N/A"}) [IMDb: ${imdbId || "None"}, Seasons: ${totalSeasons}]`
          );

          // Queue for scraping (up to first 3 seasons)
          if (queueSeasonPacks) {
            const seasonCount = Math.min(totalSeasons, 3);
            for (let s = 1; s <= seasonCount; s++) {
              bulkQueueItems.push({
                tmdb_id: details.id,
                imdb_id: imdbId,
                title: details.name,
                year: releaseYear,
                season: s,
                episode: null,
                mode: "season_pack",
              });
            }
          }
        } catch (showErr) {
          console.warn(`[Feeder] Error fetching show ID ${show.id}:`, showErr.message);
        }
      }

      currentPage++;
    }

    // 3. Push all valid jobs to bulk_tv_queue
    if (bulkQueueItems.length > 0) {
      console.log(
        `\n[Feeder] Enqueueing ${bulkQueueItems.length} season job(s) from ${validShowsCount} valid shows into bulk_tv_queue...`
      );
      const enqueued = await enqueueTvBulk(bulkQueueItems);
      console.log(`[Feeder] Successfully queued ${enqueued.length} jobs in Supabase!`);
    }

    console.log("\n====================================================");
    console.log(`Done! Collected ${validShowsCount} shows (scanned up to page ${currentPage - 1}).`);
    console.log("Start the background worker with:");
    console.log("   npm run worker:tv:start");
    console.log("====================================================\n");
  } catch (err) {
    console.error("[Feeder] Critical error:", err.message);
  }
}

// Support running directly via CLI
if (require.main === module) {
  const startPageArg = process.argv[2] ? parseInt(process.argv[2], 10) : 1;
  feedPopularTvShows(startPageArg, true, 20).then(() => process.exit(0));
}

module.exports = {
  feedPopularTvShows,
};
