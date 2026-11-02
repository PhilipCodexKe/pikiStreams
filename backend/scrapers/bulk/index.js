require('dotenv').config();
const path = require('path');
// Also try loading client .env if TMDB key is defined there for Vite
require('dotenv').config({ path: path.resolve(__dirname, '../../../client/.env') });
const axios = require('axios');
const { enqueueBulk } = require('../../database/supabase');

const TMDB_API_KEY = process.env.TMDB_API_KEY || 
                     process.env.VITE_TMDB_API_KEY || 
                     process.env.REACT_APP_TMDB_API_KEY ||
                     'ab060bf4b27b23c908e05859d2ef7451';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// 5 Sample Popular Movies for quick testing
const SAMPLE_TEST_MOVIES = [
    { tmdb_id: 157336, title: 'Interstellar', year: 2014 },
    { tmdb_id: 27205,  title: 'Inception', year: 2010 },
    { tmdb_id: 155,    title: 'The Dark Knight', year: 2008 },
    { tmdb_id: 550,    title: 'Fight Club', year: 1999 },
    { tmdb_id: 603,    title: 'The Matrix', year: 1999 }
];

/**
 * Fetch movies from TMDB API
 * @param {string} category - 'trending', 'popular', 'top_rated'
 * @param {number} totalCount - e.g. 5, 20, 200
 */
async function fetchMoviesFromTMDB(category = 'trending', totalCount = 5) {
    if (!TMDB_API_KEY) {
        console.warn('\n⚠️  No TMDB_API_KEY found in .env. Falling back to the 5 sample test movies.\n');
        return SAMPLE_TEST_MOVIES.slice(0, totalCount);
    }

    const pagesNeeded = Math.ceil((totalCount * 2) / 20); // fetch extra pages to account for filtered unreleased/duplicates
    const collectedMovies = [];
    const seenMovieIds = new Set();
    const today = new Date().toISOString().split('T')[0];

    console.log(`[TMDB Bulk] Fetching ~${totalCount} movies (${pagesNeeded} page(s)) for category: "${category}"...`);

    for (let page = 1; page <= pagesNeeded; page++) {
        let endpoint = `${TMDB_BASE_URL}/trending/movie/week?api_key=${TMDB_API_KEY}&page=${page}`;
        if (category === 'popular') {
            endpoint = `${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&page=${page}`;
        } else if (category === 'top_rated') {
            endpoint = `${TMDB_BASE_URL}/movie/top_rated?api_key=${TMDB_API_KEY}&page=${page}`;
        }

        try {
            const res = await axios.get(endpoint, { timeout: 10000 });
            const results = res.data.results || [];

            for (const movie of results) {
                // Must have release_date and title
                if (!movie.release_date || !movie.title) continue;

                // Strip time if any and verify format YYYY-MM-DD
                const releaseDate = movie.release_date.trim();
                const currentYear = new Date().getFullYear();
                const year = parseInt(releaseDate.split('-')[0], 10);

                // Filter out invalid years or unreleased movies
                if (isNaN(year) || year < 1900 || year > currentYear) continue;
                if (releaseDate > today) continue;

                if (seenMovieIds.has(movie.id)) continue;
                seenMovieIds.add(movie.id);

                collectedMovies.push({
                    tmdb_id: movie.id,
                    title: movie.title.trim(),
                    year: year
                });

                if (collectedMovies.length >= totalCount) break;
            }
        } catch (err) {
            console.error(`[TMDB Bulk] Error fetching page ${page}:`, err.message);
            break;
        }

        if (collectedMovies.length >= totalCount) break;
    }

    return collectedMovies;
}

/**
 * Main seeding execution
 */
async function run() {
    const args = process.argv.slice(2);
    const countArg = args.find(a => a.startsWith('--count='));
    const categoryArg = args.find(a => a.startsWith('--category='));

    const count = countArg ? parseInt(countArg.split('=')[1], 10) : 5;
    const category = categoryArg ? categoryArg.split('=')[1] : 'trending';

    console.log('====================================================');
    console.log(`   PikiStreams TMDB Bulk Seeder (${count} movies)    `);
    console.log('====================================================');

    const movies = await fetchMoviesFromTMDB(category, count);

    console.log(`\nFound ${movies.length} movies ready to enqueue:`);
    movies.forEach((m, idx) => {
        console.log(`  ${idx + 1}. [TMDB: ${m.tmdb_id}] "${m.title}" (${m.year})`);
    });

    console.log(`\nSending to Supabase 'bulk_queue'...`);
    const enqueued = await enqueueBulk(movies);
    console.log(`✅ Done! Enqueued/Updated ${enqueued.length} movies in 'bulk_queue'.`);
    console.log('\nYou can now run the worker whenever you are ready:');
    console.log('   npm run worker:start\n');
}

if (require.main === module) {
    run().catch(console.error);
}

module.exports = {
    fetchMoviesFromTMDB
};
