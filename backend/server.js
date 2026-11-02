const express = require('express');
const cors = require('cors');
const { searchMovieStreams, searchTvStreams } = require('./scrapers/orchestrator');
const { enqueueBulk } = require('./database/supabase');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// On-demand movie stream route (checks Supabase -> Cheerio -> Playwright)
app.get('/api/scrape/:title', async (req, res) => {
    try {
        const { title } = req.params;
        const { year, refresh } = req.query;

        if (!title) {
            return res.status(400).json({ error: 'Movie title is required' });
        }

        const streams = await searchMovieStreams(title, year, refresh === 'true');
        res.json({ success: true, count: streams.length, data: streams });
    } catch (error) {
        console.error('Scraping error:', error);
        res.status(500).json({ error: 'Failed to scrape streams', details: error.message });
    }
});

// On-demand TV show episode stream route (TMDB ID -> IMDb ID -> EZTV)
app.get('/api/scrape/tv/:tmdbId', async (req, res) => {
    try {
        const { tmdbId } = req.params;
        const { season = 1, episode = 1, title = '', refresh } = req.query;

        if (!tmdbId) {
            return res.status(400).json({ error: 'TMDB Show ID is required' });
        }

        const streams = await searchTvStreams(tmdbId, season, episode, title, refresh === 'true');
        res.json({ success: true, count: streams.length, data: streams });
    } catch (error) {
        console.error('TV Scraping error:', error);
        res.status(500).json({ error: 'Failed to scrape TV streams', details: error.message });
    }
});

// Bulk queue route: Frontend/TMDB trending lists can push titles here
app.post('/api/bulk/enqueue', async (req, res) => {
    try {
        const { movies } = req.body;
        if (!movies || !Array.isArray(movies) || movies.length === 0) {
            return res.status(400).json({ error: 'Array of movies required ({ movies: [...] })' });
        }

        const enqueued = await enqueueBulk(movies);
        res.json({ success: true, count: enqueued.length, data: enqueued });
    } catch (error) {
        console.error('Bulk enqueue error:', error);
        res.status(500).json({ error: 'Failed to enqueue bulk movies', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`PikiStreams Backend running on http://localhost:${PORT}`);
});
