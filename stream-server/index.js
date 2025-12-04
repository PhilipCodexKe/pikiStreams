const express = require('express');
const cors = require('cors');
const WebTorrent = require('webtorrent');

const app = express();
const client = new WebTorrent();
const PORT = 3001;

app.use(cors());

app.get('/stream/:magnet', (req, res) => {
    const magnetURI = decodeURIComponent(req.params.magnet);
    
    // Check if torrent already exists
    let torrent = client.get(magnetURI);

    if (torrent) {
        streamTorrent(torrent, req, res);
    } else {
        client.add(magnetURI, (t) => {
            console.log(`Torrent added: ${t.infoHash}`);
            streamTorrent(t, req, res);
        });
    }
});

function streamTorrent(torrent, req, res) {
    // Find the largest file (likely the movie)
    const file = torrent.files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.mkv') || f.name.endsWith('.avi')) 
        || torrent.files.sort((a, b) => b.length - a.length)[0];

    if (!file) {
        return res.status(404).send('No video file found');
    }

    console.log(`Streaming: ${file.name}`);

    const range = req.headers.range;
    if (!range) {
        const head = {
            'Content-Length': file.length,
            'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        file.createReadStream().pipe(res);
    } else {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
        const chunksize = (end - start) + 1;
        const head = {
            'Content-Range': `bytes ${start}-${end}/${file.length}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
        };
        res.writeHead(206, head);
        file.createReadStream({ start, end }).pipe(res);
    }
}

app.listen(PORT, () => {
    console.log(`Stream server running on http://localhost:${PORT}`);
});
