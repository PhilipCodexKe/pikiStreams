import WebTorrent from 'webtorrent';
import express from 'express';
import cors from 'cors';

let client = new WebTorrent();
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

let currentTorrent = null;

app.get('/stream/:magnet', (req, res) => {
    const magnetURI = decodeURIComponent(req.params.magnet);
    console.log('Magnet URI:', magnetURI);
    
    // 1. Check if we already have this torrent running
    let torrent = client.get(magnetURI);
    
    if (torrent) {
        console.log('Torrent already active. Resuming/Streaming from existing torrent.');
        
        // Zombie Check
        if (typeof torrent.on !== 'function') {
            console.error('CRITICAL: Existing torrent object is invalid. Recreating client.');
            try {
                client.destroy();
            } catch (e) { console.error(e); }
            client = new WebTorrent();
            torrent = null;
        }
    }

    // 2. If not found (or invalid), handle switching
    if (!torrent) {
        // If we have a DIFFERENT torrent running, destroy it to free resources
        if (currentTorrent) {
             console.log('Switching movies. Destroying old torrent.');
             try {
                currentTorrent.destroy();
             } catch (e) { console.error('Error destroying old torrent:', e); }
             currentTorrent = null;
        }

        console.log('Adding new torrent to client...');
        try {
            torrent = client.add(magnetURI);
        } catch (err) {
            console.error('Error adding torrent:', err);
            return res.status(500).send('Failed to add torrent');
        }
    }
    
    currentTorrent = torrent;

    // Debug logging
    // console.log('Torrent object type:', typeof torrent);
    
    if (!torrent || typeof torrent.on !== 'function') {
        console.error('Invalid torrent object returned even after add');
        return res.status(500).send('Internal Server Error: Invalid torrent object');
    }

    const onReady = () => {
        // Find the largest file
        const file = torrent.files.reduce((a, b) => a.length > b.length ? a : b);
        
        console.log(`\n--- Metadata Ready ---`);
        console.log(`Movie: ${file.name}`);
        console.log(`Size: ${(file.length / 1024 / 1024).toFixed(2)} MB`);
        console.log(`----------------------\n`);

        // Strict Name Matching
        // We expect the magnet link to have a 'dn' (Display Name) or we use the title passed in query param if we add it later.
        // For now, let's check if the file name looks vaguely relevant to the magnet name or just log it.
        // The user asked to "strictly match the movie name in the front end".
        // We can pass the title as a query parameter ?title=...
        const expectedTitle = req.query.title;
        if (expectedTitle) {
            const cleanFileName = file.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanExpectedTitle = expectedTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            // Simple check: does the filename contain the title?
            if (!cleanFileName.includes(cleanExpectedTitle)) {
                console.error(`Name Mismatch! File: ${file.name}, Expected: ${expectedTitle}`);
                console.log('Destroying torrent due to mismatch.');
                torrent.destroy();
                currentTorrent = null;
                return res.status(404).send('File name does not match movie title');
            }
            console.log(`Name Match Verified: "${expectedTitle}" found in "${file.name}"`);
        }
        
        const range = req.headers.range;
        let stream;
        
        if (!range) {
            const head = {
                'Content-Length': file.length,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(200, head);
            stream = file.createReadStream();
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
            stream = file.createReadStream({ start, end });
        }

        // Robust Stream Error Handling
        stream.pipe(res);

        stream.on('error', (err) => {
            console.error('Stream Read Error:', err.message);
            // Don't crash
            if (!res.headersSent) res.end();
        });

        res.on('close', () => {
            console.log('Client closed connection. Destroying stream.');
            stream.destroy();
        });

        res.on('error', (err) => {
            console.error('Response Write Error:', err.message);
            stream.destroy();
        });
    };

    if (torrent.ready) {
        onReady();
    } else {
        torrent.on('ready', onReady);
    }

    // Logging Interval
    const logInterval = setInterval(() => {
        if (currentTorrent) {
            const progress = (currentTorrent.progress * 100).toFixed(1);
            const speed = (currentTorrent.downloadSpeed / 1024 / 1024).toFixed(2); // MB/s
            const peers = currentTorrent.numPeers;
            const downloaded = (currentTorrent.downloaded / 1024 / 1024).toFixed(2);
            
            process.stdout.write(`\rProgress: ${progress}% | Speed: ${speed} MB/s | Peers: ${peers} | Downloaded: ${downloaded} MB   `);
        }
    }, 2000);

    currentTorrent.on('done', () => {
        console.log('\n\n--- Download Complete ---\n');
        clearInterval(logInterval);
    });

    currentTorrent.on('error', (err) => {
        console.error('\n\n!!! Torrent Error !!!');
        console.error(err);
        clearInterval(logInterval);
        if (!res.headersSent) {
            res.status(500).send('Torrent error');
        }
    });
});

app.listen(PORT, () => {
    console.log(`Streamer running on http://localhost:${PORT}`);
});
