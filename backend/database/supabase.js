require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('[Supabase] Warning: Missing SUPABASE_URL or SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY in .env');
}

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

// Helper to normalize search titles for consistent matching
const normalizeTitle = (title) => {
    return title ? title.trim().toLowerCase() : '';
};

/**
 * Get saved streams for a movie title
 */
const getStreamsForMovie = async (title, year = null) => {
    try {
        const queryTitle = normalizeTitle(title);
        let query = supabase
            .from('streams')
            .select('*')
            .eq('search_title', queryTitle)
            .order('seeders', { ascending: false });

        if (year) {
            query = query.eq('year', parseInt(year, 10));
        }

        const { data, error } = await query;
        if (error) throw error;
        // Map DB column names → JS field names expected by normalizer/frontend
        return (data || []).map(row => ({
            ...row,
            infoHash: row.info_hash,
            title: row.torrent_title,
            torrentUrl: row.torrent_url || null,
        }));
    } catch (err) {
        console.error('[Supabase getStreamsForMovie error]:', err.message);
        return [];
    }
};

/**
 * Save freshly scraped torrent streams
 * @param {string} searchTitle - e.g. "Avatar"
 * @param {number|null} year - e.g. 2009
 * @param {Array} streamsList - Array of scraped torrent objects
 * @param {number|null} tmdb_id - TMDB Movie ID (optional)
 */
const saveStreams = async (searchTitle, year, streamsList, tmdb_id = null) => {
    if (!streamsList || streamsList.length === 0) return [];

    try {
        const cleanSearchTitle = normalizeTitle(searchTitle);
        const parsedYear = year ? parseInt(year, 10) : null;
        const parsedTmdbId = tmdb_id ? parseInt(tmdb_id, 10) : null;

        const payload = streamsList.map(s => {
            const item = {
                search_title: cleanSearchTitle,
                year: parsedYear || s.year || null,
                torrent_title: s.title || s.torrent_title,
                info_hash: s.infoHash ? s.infoHash.toLowerCase() : '',
                quality: s.quality || 'Unknown',
                size: s.size || 'Unknown',
                seeders: parseInt(s.seeders, 10) || 0,
                leechers: parseInt(s.leechers, 10) || 0,
                magnet: s.magnet,
                provider: s.provider || 'unknown',
                updated_at: new Date()
            };
            if (parsedTmdbId) {
                item.tmdb_id = parsedTmdbId;
            }
            // Only attach if present so inserts won't fail if column doesn't exist in Supabase table
            if (s.torrentUrl) {
                item.torrent_url = s.torrentUrl;
            }
            return item;
        }).filter(s => s.info_hash && s.magnet);

        if (payload.length === 0) return [];

        // Upsert based on info_hash: updates seeds/leechers if already saved
        let { data, error } = await supabase
            .from('streams')
            .upsert(payload, { onConflict: 'info_hash' })
            .select();

        // If table doesn't have 'torrent_url' column, gracefully retry without it
        if (error && error.message && error.message.includes('torrent_url')) {
            const strippedPayload = payload.map(({ torrent_url, ...rest }) => rest);
            const retry = await supabase
                .from('streams')
                .upsert(strippedPayload, { onConflict: 'info_hash' })
                .select();
            data = retry.data;
            error = retry.error;
        }

        if (error) throw error;
        return data;
    } catch (err) {
        console.error('[Supabase saveStreams error]:', err.message);
        return [];
    }
};

/**
 * Enqueue titles for the bulk crawler
 */
const enqueueBulk = async (titlesList) => {
    try {
        // 1. Deduplicate the incoming batch locally by tmdb_id and normalized title
        const seenIds = new Set();
        const seenTitles = new Set();
        const uniquePayload = [];

        for (const item of titlesList) {
            const isObj = typeof item === 'object';
            const tmdb_id = isObj && item.tmdb_id ? parseInt(item.tmdb_id, 10) : (isObj && item.id ? parseInt(item.id, 10) : null);
            const title = normalizeTitle(isObj ? item.title : item);
            const year = isObj && item.year ? parseInt(item.year, 10) : null;

            if (!title) continue;

            if (tmdb_id && seenIds.has(tmdb_id)) continue;
            if (seenTitles.has(title)) continue;

            if (tmdb_id) seenIds.add(tmdb_id);
            seenTitles.add(title);

            uniquePayload.push({
                tmdb_id,
                title,
                year,
                status: 'pending'
            });
        }

        if (uniquePayload.length === 0) return [];

        // 2. Fetch existing items in bulk_queue so we only insert genuinely new ones
        const titles = uniquePayload.map(p => p.title);
        const { data: existingRows } = await supabase
            .from('bulk_queue')
            .select('title, tmdb_id')
            .in('title', titles);

        const existingSet = new Set((existingRows || []).map(r => r.title));
        (existingRows || []).forEach(r => { if (r.tmdb_id) existingSet.add(r.tmdb_id); });

        const toInsert = uniquePayload.filter(p => !existingSet.has(p.title) && (!p.tmdb_id || !existingSet.has(p.tmdb_id)));

        if (toInsert.length === 0) {
            console.log(`[Supabase enqueueBulk] All ${uniquePayload.length} movies already exist in bulk_queue.`);
            return [];
        }

        // 3. Insert only the fresh items
        const { data, error } = await supabase
            .from('bulk_queue')
            .insert(toInsert)
            .select();

        if (error) {
            console.error('[Supabase enqueueBulk error]:', error.message);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('[Supabase enqueueBulk error]:', err.message);
        return [];
    }
};

/**
 * Get next pending item for Crawlee bulk worker
 */
const getNextBulkItem = async () => {
    try {
        const { data, error } = await supabase
            .from('bulk_queue')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error || !data) return null;

        // Mark processing
        await supabase
            .from('bulk_queue')
            .update({ status: 'processing', updated_at: new Date() })
            .eq('id', data.id);

        return data;
    } catch (err) {
        console.error('[Supabase getNextBulkItem error]:', err.message);
        return null;
    }
};

/**
 * Update bulk item status
 */
const updateBulkStatus = async (id, status) => {
    try {
        await supabase
            .from('bulk_queue')
            .update({ status, updated_at: new Date() })
            .eq('id', id);
    } catch (err) {
        console.error('[Supabase updateBulkStatus error]:', err.message);
    }
};

module.exports = {
    supabase,
    normalizeTitle,
    getStreamsForMovie,
    saveStreams,
    enqueueBulk,
    getNextBulkItem,
    updateBulkStatus
};
