const express = require('express');
const cors = require('cors');
const { scrapeMovie } = require('./scraper');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/api/scrape/:title', async (req, res) => {
    try {
        const { title } = req.params;
        console.log(`Received scrape request for: ${title}`);
        
        if (!title) {
            return res.status(400).json({ error: 'Movie title is required' });
        }

        const results = await scrapeMovie(title);
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Scraping error:', error);
        res.status(500).json({ error: 'Failed to scrape data', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
