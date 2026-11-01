require('dotenv').config();
const { supabase } = require('./supabase');

async function testConnection() {
    console.log('Testing connection to Supabase...');
    console.log(`URL: ${process.env.SUPABASE_URL || 'NOT SET'}`);
    
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        console.error('❌ ERROR: Missing SUPABASE_URL or SUPABASE_ANON_KEY in your .env file!');
        process.exit(1);
    }

    try {
        const { data, error } = await supabase.from('streams').select('id').limit(1);
        if (error) {
            console.error('❌ Connection failed or tables not created yet:');
            console.error(error.message);
            console.log('\nTip: If it says table "streams" does not exist, run backend/database/schema.sql in your Supabase SQL Editor.');
        } else {
            console.log('✅ Success! Successfully connected to Supabase and verified "streams" table exists.');
        }
    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
    }
}

testConnection();

