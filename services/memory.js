// services/memory.js
// Per-Agent Memory System — manages conversation history, long-term memories, and behavioral profiles

const db = require('../db');

/**
 * Load the last N conversation messages for a given agent
 * @returns {Array} [{role: 'user'|'assistant', content: string}]
 */
function loadConversationHistory(agentId, limit = 25) {
    return new Promise((resolve) => {
        db.all(
            `SELECT sender, message FROM chat_history 
             WHERE agent_id = ? 
             ORDER BY created_at DESC 
             LIMIT ?`,
            [agentId, limit],
            (err, rows) => {
                if (err || !rows) return resolve([]);
                // Reverse to chronological order, map to LLM message format
                const history = rows.reverse().map(r => ({
                    role: (r.sender === 'user') ? 'user' : 'assistant',
                    content: r.message
                }));
                resolve(history);
            }
        );
    });
}

/**
 * Load the top-importance memories for an agent
 * @returns {Array} memory objects
 */
function loadAgentMemories(agentId, limit = 15) {
    return new Promise((resolve) => {
        db.all(
            `SELECT id, memory_type, content, importance, context FROM agent_memory 
             WHERE agent_id = ? 
             ORDER BY importance DESC, last_accessed DESC 
             LIMIT ?`,
            [agentId, limit],
            (err, rows) => {
                if (err || !rows) return resolve([]);
                // Mark these memories as accessed
                rows.forEach(row => {
                    db.run(
                        `UPDATE agent_memory SET last_accessed = datetime('now'), access_count = access_count + 1 WHERE id = ?`,
                        [row.id]
                    );
                });
                resolve(rows);
            }
        );
    });
}

/**
 * Load the behavioral profile of an agent
 * @returns {Object} profile object
 */
function loadAgentProfile(agentId) {
    return new Promise((resolve) => {
        db.get(
            `SELECT ap.*, a.role, a.description
             FROM agent_profile ap
             JOIN agents a ON ap.agent_id = a.id
             WHERE ap.agent_id = ?`,
            [agentId],
            (err, row) => {
                if (err || !row) return resolve(null);
                try {
                    row.specialty_tags = JSON.parse(row.specialty_tags || '[]');
                    row.known_director_preferences = JSON.parse(row.known_director_preferences || '[]');
                } catch (e) {
                    row.specialty_tags = [];
                    row.known_director_preferences = [];
                }
                resolve(row);
            }
        );
    });
}

/**
 * Save a new memory entry for an agent
 * @param {number} agentId
 * @param {string} type - 'insight' | 'decision' | 'pattern' | 'director_preference' | 'skill_learned'
 * @param {string} content - The memory text
 * @param {number} importance - 1-10
 * @param {string} context - Optional context snippet
 */
function saveMemory(agentId, type, content, importance = 5, context = '') {
    return new Promise((resolve) => {
        // Avoid saving duplicate/near-duplicate memories
        db.get(
            `SELECT id FROM agent_memory WHERE agent_id = ? AND content = ? LIMIT 1`,
            [agentId, content],
            (err, existing) => {
                if (existing) {
                    // Update importance if already exists
                    db.run(`UPDATE agent_memory SET importance = MAX(importance, ?), last_accessed = datetime('now') WHERE id = ?`, 
                        [importance, existing.id]);
                    return resolve(existing.id);
                }
                db.run(
                    `INSERT INTO agent_memory (agent_id, memory_type, content, importance, context) VALUES (?, ?, ?, ?, ?)`,
                    [agentId, type, content, importance, context],
                    function(err) {
                        if (err) console.error('Memory save error:', err);
                        resolve(this?.lastID);
                    }
                );
            }
        );
    });
}

/**
 * Update the agent's behavioral profile after an interaction
 */
function updateProfile(agentId, { tasksIncrement = 0, preferenceNote = null, specialtyTag = null } = {}) {
    return new Promise((resolve) => {
        db.get(`SELECT * FROM agent_profile WHERE agent_id = ?`, [agentId], (err, profile) => {
            if (err || !profile) return resolve();

            let prefs = [];
            let tags = [];
            try { prefs = JSON.parse(profile.known_director_preferences || '[]'); } catch(e) {}
            try { tags = JSON.parse(profile.specialty_tags || '[]'); } catch(e) {}

            if (preferenceNote && !prefs.includes(preferenceNote)) {
                prefs.push(preferenceNote);
                if (prefs.length > 20) prefs.shift(); // Cap at 20
            }
            if (specialtyTag && !tags.includes(specialtyTag)) {
                tags.push(specialtyTag);
                if (tags.length > 10) tags.shift(); // Cap at 10
            }

            db.run(
                `UPDATE agent_profile SET 
                    total_interactions = total_interactions + 1,
                    total_tasks_done = total_tasks_done + ?,
                    known_director_preferences = ?,
                    specialty_tags = ?,
                    last_active = datetime('now')
                 WHERE agent_id = ?`,
                [tasksIncrement, JSON.stringify(prefs), JSON.stringify(tags), agentId],
                resolve
            );
        });
    });
}

/**
 * Load high-importance knowledge from across the entire company
 */
function getCompanyKnowledge(limit = 10) {
    return new Promise((resolve) => {
        db.all(
            `SELECT m.content, a.role, m.memory_type
             FROM agent_memory m
             JOIN agents a ON m.agent_id = a.id
             WHERE m.importance >= 7
             ORDER BY m.importance DESC, m.created_at DESC
             LIMIT ?`,
            [limit],
            (err, rows) => {
                if (err || !rows) return resolve([]);
                resolve(rows);
            }
        );
    });
}

/**
 * Build the full enriched system prompt for an agent by combining:
 * - Their role system prompt
 * - Behavioral profile (interactions, specialties)
 * - Top memories (insights, decisions, patterns)
 * - Conversation history
 * 
 * @returns {Object} { systemPrompt: string, messages: Array }
 */
async function buildEnrichedContext(agentId, baseSystemPrompt, currentMessage) {
    const [history, memories, profile, globalKnowledge] = await Promise.all([
        loadConversationHistory(agentId, 25),
        loadAgentMemories(agentId, 15),
        loadAgentProfile(agentId),
        getCompanyKnowledge(10)
    ]);

    let enrichedPrompt = baseSystemPrompt;

    // --- Profile Block ---
    if (profile && profile.total_interactions > 0) {
        enrichedPrompt += `\n\n--- YOUR PROFILE ---`;
        enrichedPrompt += `\nYou have completed ${profile.total_interactions} interactions and ${profile.total_tasks_done} tasks.`;
        
        if (profile.specialty_tags && profile.specialty_tags.length > 0) {
            enrichedPrompt += `\nYour known specialties: ${profile.specialty_tags.join(', ')}.`;
        }
        if (profile.known_director_preferences && profile.known_director_preferences.length > 0) {
            enrichedPrompt += `\nDirector's known preferences: ${profile.known_director_preferences.join('; ')}.`;
        }
        if (profile.behavioral_notes) {
            enrichedPrompt += `\n${profile.behavioral_notes}`;
        }
    }

    // --- Long-Term Memories Block ---
    if (memories && memories.length > 0) {
        enrichedPrompt += `\n\n--- YOUR MEMORIES ---`;
        memories.forEach(m => {
            const tag = m.memory_type.toUpperCase();
            enrichedPrompt += `\n[${tag}] ${m.content}`;
        });
    }

    // --- Global Company Knowledge Block ---
    if (globalKnowledge && globalKnowledge.length > 0) {
        enrichedPrompt += `\n\n--- AURA CORP OFFICE INTELLIGENCE ---`;
        globalKnowledge.forEach(k => {
            enrichedPrompt += `\n[${k.role}] ${k.content}`;
        });
    }

    // --- Conversation History as message array ---
    // We'll pass history as the messages array, with the new message appended
    const messages = [
        ...history,
        { role: 'user', content: currentMessage }
    ];

    return { systemPrompt: enrichedPrompt, messages };
}

/**
 * Auto-extract a memory insight from an agent's response using a lightweight heuristic.
 * No extra LLM call needed — just keyword analysis.
 */
async function extractAndSaveInsight(agentId, userMessage, agentResponse) {
    // Determine memory type and importance based on content signals
    const lower = agentResponse.toLowerCase();

    let memType = 'insight';
    let importance = 4;

    if (lower.includes('approved') || lower.includes('approve')) { memType = 'decision'; importance = 8; }
    else if (lower.includes('rejected') || lower.includes('reject')) { memType = 'decision'; importance = 8; }
    else if (lower.includes('skill') || lower.includes('capability')) { memType = 'skill_learned'; importance = 7; }
    else if (lower.includes('director') || lower.includes('prefer') || lower.includes('always') || lower.includes('priority')) { memType = 'director_preference'; importance = 7; }
    else if (lower.includes('pattern') || lower.includes('typically') || lower.includes('usually')) { memType = 'pattern'; importance = 6; }

    // Only save if the response is meaningful (not just an ack)
    if (agentResponse.length > 30) {
        const memoryContent = agentResponse.length > 200 
            ? agentResponse.substring(0, 200) + '...'
            : agentResponse;

        await saveMemory(agentId, memType, memoryContent, importance, userMessage.substring(0, 100));
    }

    // Update profile interaction count
    await updateProfile(agentId);
}

/**
 * Compress old low-importance memories to save space (runs periodically)
 * Keeps only top 100 memories per agent, deletes the rest
 */
function pruneOldMemories(agentId) {
    db.run(
        `DELETE FROM agent_memory WHERE agent_id = ? AND id NOT IN (
            SELECT id FROM agent_memory WHERE agent_id = ? 
            ORDER BY importance DESC, last_accessed DESC 
            LIMIT 100
        )`,
        [agentId, agentId]
    );
}

module.exports = {
    loadConversationHistory,
    loadAgentMemories,
    loadAgentProfile,
    saveMemory,
    buildEnrichedContext,
    getCompanyKnowledge,
    extractAndSaveInsight,
    pruneOldMemories
};
