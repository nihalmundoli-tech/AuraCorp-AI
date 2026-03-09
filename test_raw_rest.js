const db = require('./db');

async function testRawRest() {
    console.log('--- raw REST Gemini API Test ---');
    const row = await new Promise(resolve => db.get('SELECT gemini_key FROM app_settings WHERE user_id = 1', [], (err, res) => resolve(res)));
    if (!row || !row.gemini_key) {
        console.error('No API key found');
        return;
    }
    const key = row.gemini_key;
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        if (response.ok) {
            console.log('✅ SUCCESS! Available Models:');
            data.models.forEach(m => console.log(`- ${m.name}`));
            process.exit(0);
        } else {
            console.error('❌ FAILED! Status:', response.status);
            console.error('Error Details:', JSON.stringify(data));
        }
    } catch (e) {
        console.error('❌ Fetch Error:', e.message);
    }
    process.exit(1);
}

testRawRest();
