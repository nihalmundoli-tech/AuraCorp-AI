const { GoogleGenAI } = require('@google/genai');
const db = require('./db');

async function listModels() {
    const settings = await new Promise((resolve) => {
        db.get("SELECT gemini_key FROM app_settings WHERE user_id = 1", [], (err, row) => resolve(row));
    });

    if (!settings || !settings.gemini_key) {
        console.error('No API key found in DB');
        process.exit(1);
    }

    const genAI = new GoogleGenAI({ apiKey: settings.gemini_key });
    try {
        console.log('Fetching models...');
        const response = await genAI.models.list();
        // The new SDK usually returns an object with a models property or similar
        console.log('Raw Response Keys:', Object.keys(response));
        if (response.models) {
            response.models.forEach(m => console.log(`- ${m.name} (${m.displayName})`));
        } else if (Array.isArray(response)) {
            response.forEach(m => console.log(`- ${m.name} (${m.displayName})`));
        }
    } catch (e) {
        console.error('Failed to list models:', e.message);
        // Fallback: try different names in a test call
        const testModels = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro'];
        for (const m of testModels) {
            try {
                await genAI.models.generateContent({
                    model: m,
                    contents: [{ role: 'user', parts: [{ text: 'say hi' }] }]
                });
                console.log(`✅ ${m} works!`);
            } catch (err) {
                console.log(`❌ ${m} failed: ${err.message}`);
            }
        }
    }
    process.exit(0);
}

listModels();
