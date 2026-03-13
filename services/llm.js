// llm.js
const { GoogleGenAI } = require('@google/genai');
const db = require('../db');

/**
 * Dynamically fetches API keys from the persistent account system in the DB.
 */
const credentialManager = require('./credentialManager');

const getDynamicKeys = () => {
    return new Promise((resolve) => {
        const sql = `SELECT * FROM app_settings WHERE user_id = 1`;
        db.get(sql, [], (err, row) => {
            if (err || !row) {
                resolve({
                    gemini: process.env.GEMINI_API_KEY || '',
                    groq: process.env.GROQ_API_KEY || '',
                    openrouter: process.env.OPENROUTER_API_KEY || '',
                    research: process.env.RESEARCH_API_KEY || ''
                });
            } else {
                resolve({
                    gemini: credentialManager.decrypt(row.gemini_key) || process.env.GEMINI_API_KEY || '',
                    groq: credentialManager.decrypt(row.groq_key) || process.env.GROQ_API_KEY || '',
                    openrouter: credentialManager.decrypt(row.openrouter_key) || process.env.OPENROUTER_API_KEY || '',
                    research: credentialManager.decrypt(row.research_api_key) || process.env.RESEARCH_API_KEY || ''
                });
            }
        });
    });
};

/**
 * RECRUITMENT TOOL DEFINITIONS for Gemini
 */
const RECRUITMENT_TOOLS = [
    {
        name: "search_candidates",
        description: "Search internal database (Sheet 2) or external sites for candidates matched to a job title.",
        parameters: {
            type: "OBJECT",
            properties: {
                job_id: { type: "STRING", description: "The Job ID tracking number." },
                query: { type: "STRING", description: "Search terms (e.g., 'React Developer Mumbai')." },
                source: { type: "STRING", enum: ["internal", "external"], description: "Where to search." }
            },
            required: ["job_id", "query", "source"]
        }
    },
    {
        name: "update_job_status",
        description: "Update the status of a job in the Google Sheet trackers.",
        parameters: {
            type: "OBJECT",
            properties: {
                job_id: { type: "STRING", description: "The Job ID tracking number." },
                status: { type: "STRING", enum: ["Not Started", "Processing", "Done", "Failed"], description: "New status." },
                sheet_name: { type: "STRING", description: "Target sheet (e.g., 'Sheet 1')." }
            },
            required: ["job_id", "status", "sheet_name"]
        }
    },
    {
        name: "generate_social_post",
        description: "Generate a marketing post for social media based on job details.",
        parameters: {
            type: "OBJECT",
            properties: {
                platform: { type: "STRING", enum: ["LinkedIn", "WhatsApp", "Instagram"] },
                job_details: { type: "STRING", description: "Title, salary, location." }
            },
            required: ["platform", "job_details"]
        }
    }
];

/**
 * Main entry point for generating LLM responses.
 */
async function generateAgentResponse(systemPrompt, userMessage, options = {}) {
    const keys = await getDynamicKeys();
    const { provider = 'gemini', complexity = 'high', agentId = null } = options;

    let selectedProvider = provider;
    if (!keys[selectedProvider]) {
        if (keys.gemini) selectedProvider = 'gemini';
        else return `[AURA ERROR]: The "${provider}" API key is missing or invalid in Settings. Please update your Central API Manager vault.`;
    }

    let enrichedSystemPrompt = systemPrompt;
    let conversationMessages = [{ role: 'user', content: userMessage }];
    let memoryCtx = null;

    const numericId = parseInt(agentId);
    if (numericId && numericId > 0) {
        try {
            const memService = require('./memory');
            const { systemPrompt: enriched, messages } = await memService.buildEnrichedContext(numericId, systemPrompt, userMessage);
            enrichedSystemPrompt = enriched;
            conversationMessages = messages;
            memoryCtx = { service: memService, agentId: numericId };
        } catch (e) {
            console.warn('Memory enrichment failed:', e.message);
        }
    }

    try {
        let response = null;

        if (selectedProvider === 'openrouter') {
            // ... (keep existing openrouter logic)
            const models = [
                "google/gemini-2.0-flash-001", 
                "google/gemini-flash-1.5"
            ];

            let lastError = null;
            for (const modelId of models) {
                try {
                    const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${keys.openrouter}`,
                            "Content-Type": "application/json",
                            "HTTP-Referer": "https://auracorp-ai.local",
                            "X-Title": "AuraCorp Command Center"
                        },
                        body: JSON.stringify({
                            "model": modelId,
                            "max_tokens": 1500,
                            "messages": [
                                { "role": "system", "content": enrichedSystemPrompt },
                                ...conversationMessages
                            ],
                            "tools": RECRUITMENT_TOOLS.map(t => ({
                                type: "function",
                                function: {
                                    name: t.name,
                                    description: t.description,
                                    parameters: t.parameters
                                }
                            })),
                            "tool_choice": "auto"
                        })
                    });

                    if (orResponse.ok) {
                        const data = await orResponse.json();
                        const message = data.choices[0].message;
                        
                        if (message.tool_calls) {
                            const tc = message.tool_calls[0].function;
                            response = JSON.stringify({ 
                                type: 'tool_call', 
                                call: { name: tc.name, args: JSON.parse(tc.arguments) }
                            });
                        } else {
                            response = message.content;
                        }
                        break;
                    } else {
                        lastError = await orResponse.text();
                    }
                } catch (e) {
                    lastError = e.message;
                }
            }
        } 
        else if (selectedProvider === 'gemini') {
            const genAI = new GoogleGenAI(keys.gemini);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const chat = model.startChat({
                history: conversationMessages.slice(0, -1).map(m => ({
                    role: m.role === 'user' ? 'user' : 'model',
                    parts: [{ text: m.content }]
                })),
                generationConfig: { maxOutputTokens: 2000 }
            });

            const result = await chat.sendMessage(userMessage);
            response = result.response.text();
        }
        else if (selectedProvider === 'groq') {
            // Basic Groq fetch fallback
            const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${keys.groq}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "llama3-70b-8192",
                    messages: [
                        { role: "system", content: enrichedSystemPrompt },
                        ...conversationMessages
                    ]
                })
            });
            const data = await groqResponse.json();
            response = data.choices[0].message.content;
        }

        if (response && memoryCtx) {
            memoryCtx.service.extractAndSaveInsight(memoryCtx.agentId, userMessage, response)
                .catch(e => console.warn('Memory write failed:', e.message));
        }

        return response;

    } catch (error) {
        console.error(`LLM Error (${selectedProvider}):`, error);
        return `**[System: Error]** ${error.message}`;
    }
}

module.exports = { generateAgentResponse };
