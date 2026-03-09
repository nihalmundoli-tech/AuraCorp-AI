const { GoogleGenAI } = require('@google/genai');
const db = require('../db');

/**
 * Dynamically fetches API keys from the persistent account system in the DB.
 */
const getDynamicKeys = () => {
    return new Promise((resolve) => {
        const sql = `SELECT * FROM app_settings WHERE user_id = (SELECT id FROM users WHERE username = 'admin')`;
        db.get(sql, [], (err, row) => {
            if (err || !row) {
                // Return env fallbacks if DB fails
                resolve({
                    gemini: process.env.GEMINI_API_KEY || '',
                    groq: process.env.GROQ_API_KEY || '',
                    openrouter: process.env.OPENROUTER_API_KEY || '',
                    research: process.env.RESEARCH_API_KEY || ''
                });
            } else {
                resolve({
                    gemini: row.gemini_key || process.env.GEMINI_API_KEY || '',
                    groq: row.groq_key || process.env.GROQ_API_KEY || '',
                    openrouter: row.openrouter_key || process.env.OPENROUTER_API_KEY || '',
                    research: row.research_api_key || process.env.RESEARCH_API_KEY || ''
                });
            }
        });
    });
};

async function generateAgentResponse(systemPrompt, userMessage, options = {}) {
    const keys = await getDynamicKeys();
    const { provider = 'gemini', complexity = 'high' } = options;

    // Intelligent provider selection if specific one isn't forced
    let selectedProvider = provider;
    if (!keys[selectedProvider]) {
        // Fallback chain
        if (keys.gemini) selectedProvider = 'gemini';
        else if (keys.groq) selectedProvider = 'groq';
        else if (keys.openrouter) selectedProvider = 'openrouter';
        else return `[MOCK RESPONSE] -> Provider ${provider} unavailable. Processing: "${userMessage.substring(0, 50)}..."`;
    }

    try {
        if (selectedProvider === 'gemini') {
            const genAI = new GoogleGenAI({ apiKey: keys.gemini });
            // Using the futuristic models available in this specific environment
            const modelName = complexity === 'high' ? 'gemini-3-pro-preview' : 'gemini-2.5-flash-native-audio-latest';
            const response = await genAI.models.generateContent({
                model: modelName,
                contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nTask:\n${userMessage}` }] }]
            });
            return response.text;
        }

        // Simulating Groq/OpenRouter with Fetch
        if (selectedProvider === 'groq' || selectedProvider === 'openrouter') {
            return `[${selectedProvider.toUpperCase()} RESPONSE] -> Executing via ${complexity} model: "${userMessage.substring(0, 30)}..."`;
        }

    } catch (error) {
        console.error(`LLM Error (${selectedProvider}):`, error);
        return `Error: ${error.message}`;
    }
}

module.exports = {
    generateAgentResponse
};
