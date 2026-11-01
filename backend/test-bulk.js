const { enqueueBulk } = require('./database/supabase');

async function testBulkQueue() {
    console.log('--- Testing Bulk Queue Enqueueing ---');
    const sampleTrendingMovies = [
        { title: 'The Dark Knight', year: 2008 },
        { title: 'Gladiator', year: 2000 },
        { title: 'The Matrix', year: 1999 }
    ];

    console.log(`Enqueueing ${sampleTrendingMovies.length} trending movies...`);
    const enqueued = await enqueueBulk(sampleTrendingMovies);
    console.log(`Enqueued ${enqueued.length} items to bulk_queue table in Supabase!`);
    console.log('\nNow you can run: "npm run worker" to watch the background crawler process them one by one.');
    process.exit(0);
}

testBulkQueue();

