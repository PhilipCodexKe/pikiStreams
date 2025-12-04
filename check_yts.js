const https = require('https');

const domains = [
    'https://yts.mx/',
    'https://yts.rs/',
    'https://yts.lt/',
    'https://yts.do/',
    'https://yts.ag/'
];

const checkDomain = (url) => {
    return new Promise((resolve) => {
        const req = https.get(url, (res) => {
            console.log(`${url}: Status ${res.statusCode}`);
            res.resume();
            if (res.statusCode >= 200 && res.statusCode < 400) {
                resolve(true);
            } else {
                resolve(false);
            }
        }).on('error', (e) => {
            console.log(`${url}: Error ${e.message}`);
            resolve(false);
        });
        req.setTimeout(5000, () => {
            console.log(`${url}: Timeout`);
            req.abort();
            resolve(false);
        });
    });
};

(async () => {
    console.log('Checking YTS domains...');
    for (const domain of domains) {
        const isWorking = await checkDomain(domain);
        if (isWorking) {
            console.log(`\nFound working domain: ${domain}`);
            process.exit(0);
        }
    }
    console.log('\nNo working domains found.');
    process.exit(1);
})();
