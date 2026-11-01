const { searchMovieStreams } = require('./scrapers/orchestrator');

async function testOrchestrator() {
  console.log("--- Testing On-Demand Orchestrator ---");
  const title = "Interstellar";
  const year = 2014;

  console.time("SearchTime");
  const results = await searchMovieStreams(title, year);
  console.timeEnd("SearchTime");

  console.log(`\nResults returned: ${results.length}`);
  if (results.length > 0) {
    console.log("Top stream candidate:");
    console.log({
      title: results[0].torrent_title || results[0].title,
      quality: results[0].quality,
      size: results[0].size,
      seeders: results[0].seeders,
      provider: results[0].provider,
      infoHash: results[0].info_hash || results[0].infoHash,
    });
  }

  console.log("\n--- Testing Database Cache Hit (Second Call) ---");
  console.time("CacheHitTime");
  const cachedResults = await searchMovieStreams(title, year);
  console.timeEnd("CacheHitTime");
  console.log(
    `Cache returned ${cachedResults.length} streams instantaneously!`,
  );

  process.exit(0);
}

testOrchestrator();
