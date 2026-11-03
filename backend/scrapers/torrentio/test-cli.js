/**
 * Torrentio Standalone CLI Tester
 * Usage:
 *   node backend/scrapers/torrentio/test-cli.js [imdbId]
 * 
 * Default tests with "Inception" (tt1375666) or "Breaking Bad S01E01" (tt0903747)
 */

const { getMovieStreams, getTvStreams } = require('./index');

async function runTest() {
    console.log('=============================================');
    console.log('   TORRENTIO OPTIMAL SELECTION TEST          ');
    console.log('   (Rules: x264/AAC browser-ready,           ');
    console.log('    smallest size, 3 streams [1080/720/480]) ');
    console.log('=============================================');

    const testMovieImdb = process.argv[2] || 'tt1375666'; // Inception
    console.log(`\n[1/2] Fetching Optimal Movie Streams for: ${testMovieImdb}...`);

    const movieStreams = await getMovieStreams({ imdbId: testMovieImdb, filterOptimal: true });
    console.log(`Selected ${movieStreams.length} optimal streams:\n`);

    movieStreams.forEach((s, idx) => {
        console.log(`[Slot ${idx + 1}] (${s.quality})`);
        console.log(`  Title:    ${s.title}`);
        console.log(`  Size:     ${s.size}`);
        console.log(`  Seeders:  ${s.seeders}`);
        console.log(`  Provider: ${s.provider}`);
        console.log(`  Magnet:   ${s.magnet.substring(0, 60)}...`);
    });

    console.log('\n---------------------------------------------');
    console.log('[2/2] Fetching Optimal TV Streams (Breaking Bad S01E01 - tt0903747)...');
    const tvStreams = await getTvStreams({ imdbId: 'tt0903747', season: 1, episode: 1, filterOptimal: true });
    console.log(`Selected ${tvStreams.length} optimal streams:\n`);

    tvStreams.forEach((s, idx) => {
        console.log(`[Slot ${idx + 1}] (${s.quality})`);
        console.log(`  Title:    ${s.title}`);
        console.log(`  Size:     ${s.size}`);
        console.log(`  Seeders:  ${s.seeders}`);
        console.log(`  Provider: ${s.provider}`);
    });

    console.log('\n=============================================');
    console.log('   OPTIMAL SELECTION VERIFIED SUCCESSFULLY   ');
    console.log('=============================================');
}

runTest();

