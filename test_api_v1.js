const { GoogleGenAI } = require('@google/genai');
const db = require('./db');

async function testApiVersions() {
    const keys = await new Promise(r => db.get('SELECT gemini_key FROM app_settings WHERE user_id = 1', [], (e, row) => r(row)));
    if (!keys || !keys.gemini_key) {
        console.error('No API key found in DB');
        process.exit(1);
    }

    const versions = ['v1', 'v1beta'];
    const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];

    for (const v of versions) {
        console.log(`--- Testing API Version: ${v} ---`);
        const genAI = new GoogleGenAI({ apiKey: keys.gemini_key, apiVersion: v });
        for (const m of models) {
            try {
                console.log(`Trying ${m}...`);
                const res = await genAI.models.generateContent({
                    model: m,
                    contents: [{ role: 'user', parts: [{ text: 'say hi' }] }]
                });
                console.log(`✅ SUCCESS with ${v}/${m}: ${res.text}`);
                process.exit(0);
            } catch (err) {
                console.log(`❌ FAILED with ${v}/${m}: ${err.message}`);
            }
        }
    }
    process.exit(1);
}

testApiVersions();
