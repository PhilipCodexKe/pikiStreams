const axios = require("axios");
const cheerio = require("cheerio");
const { applyResourceShield } = require("../engine/playwright-shield");

const TGX_DOMAINS = [
  "https://torrentgalaxy.to",
  "https://tgx.rs",
  "https://torrentgalaxy.mx",
];

/**
 * Extract stream entries from TorrentGalaxy HTML table rows
 */
const parseTGxRows = ($) => {
  const list = [];

  $("div.tgxtablerow").each((_, row) => {
    // Torrent title & link
    const titleEl = $(row).find("div.tgxtablecell a.txlight");
    const title = titleEl.attr("title") || titleEl.text().trim();
    const detailHref = titleEl.attr("href");

    // Direct magnet link (TGx provides magnets right in the table row!)
    const magnet = $(row)
      .find('a[role="button"][href^="magnet:?"]')
      .attr("href");

    // Size
    const sizeBadge = $(row)
      .find("span.badge.badge-secondary")
      .filter((_, el) => {
        return /([0-9.]+\s*(MB|GB|TB))/i.test($(el).text());
      });
    const size = sizeBadge.first().text().trim() || "Unknown";

    // Seeders and Leechers (colored spans: green = seed, red = leech)
    const seedsText = $(row)
      .find('span[color="green"], font[color="green"], span.tgx-seeds')
      .first()
      .text()
      .replace(/,/g, "")
      .trim();
    const leechesText = $(row)
      .find('span[color="#ff0000"], font[color="#ff0000"], span.tgx-leeches')
      .first()
      .text()
      .replace(/,/g, "")
      .trim();

    const seeders = parseInt(seedsText, 10) || 0;
    const leechers = parseInt(leechesText, 10) || 0;

    if (title && magnet) {
      list.push({
        title,
        magnet,
        size,
        seeders,
        leechers,
        url: detailHref
          ? detailHref.startsWith("http")
            ? detailHref
            : `https://torrentgalaxy.to${detailHref}`
          : null,
        provider: "torrentgalaxy",
      });
    }
  });

  return list;
};

/**
 * Cheerio Fast Path (Axios)
 * Tries direct HTTP request across known TGx mirrors.
 */
const searchCheerio = async (query) => {
  for (const domain of TGX_DOMAINS) {
    try {
      const url = `${domain}/torrents.php?search=${encodeURIComponent(query)}&parent_cat=TV`;
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      });

      if (
        response.data.includes("Just a moment...") ||
        response.data.includes("cf-browser-verification")
      ) {
        continue; // Blocked by Cloudflare, try next mirror or fallback to Playwright
      }

      const $ = cheerio.load(response.data);
      const results = parseTGxRows($);
      if (results && results.length > 0) {
        return results;
      }
    } catch {
      // Try next mirror
    }
  }
  return null;
};

/**
 * Playwright Heavy Path
 * Used when Cloudflare challenges block standard Axios requests.
 */
const searchPlaywright = async (context, query) => {
  let page = null;
  for (const domain of TGX_DOMAINS) {
    try {
      page = await context.newPage();
      await applyResourceShield(page);

      const searchUrl = `${domain}/torrents.php?search=${encodeURIComponent(query)}&parent_cat=TV`;
      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });

      // Wait for results container or Cloudflare clearance
      await page
        .waitForFunction(
          () => {
            return (
              document.querySelector("div.tgxtablerow") ||
              document.querySelector("div.panel") ||
              document.body.innerText.includes("No torrents found")
            );
          },
          { timeout: 8000 },
        )
        .catch(() => null);

      const html = await page.content();
      const $ = cheerio.load(html);
      const results = parseTGxRows($);

      if (results && results.length > 0) {
        return results;
      }
    } catch (err) {
      console.warn(
        `[TorrentGalaxy] Playwright failed on ${domain}:`,
        err.message,
      );
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }
  return [];
};

module.exports = {
  name: "torrentgalaxy",
  searchCheerio,
  searchPlaywright,
};
