// services/llm.js
const { GoogleGenAI } = require('@google/genai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

let ai = null;
if (GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
} else {
    console.warn('GEMINI_API_KEY is not set. LLM calls will return mocked responses.');
}

async function generateAgentResponse(systemPrompt, userMessage) {
    if (!ai) {
        return `[MOCK RESPONSE] -> I am processings: "${userMessage}".`;
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                { role: 'user', parts: [{ text: `${systemPrompt}\n\nTask/Input:\n${userMessage}` }] }
            ],
            config: {
                temperature: 0.7,
            }
        });

        return response.text;
    } catch (error) {
        console.error('LLM Generation Error:', error);
        return `Error generating response: ${error.message}`;
    }
}

module.exports = {
    generateAgentResponse
};
