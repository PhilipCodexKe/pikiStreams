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
 */
const saveStreams = async (searchTitle, year, streamsList) => {
    if (!streamsList || streamsList.length === 0) return [];

    try {
        const cleanSearchTitle = normalizeTitle(searchTitle);
        const parsedYear = year ? parseInt(year, 10) : null;

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
        const payload = titlesList.map(item => {
            const isObj = typeof item === 'object';
            return {
                title: normalizeTitle(isObj ? item.title : item),
                year: isObj && item.year ? parseInt(item.year, 10) : null,
                status: 'pending'
            };
        });

        const { data, error } = await supabase
            .from('bulk_queue')
            .upsert(payload, { onConflict: 'title', ignoreDuplicates: true })
            .select();

        if (error) throw error;
        return data;
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
