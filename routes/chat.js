// chat.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// Get chat history for a specific agent
router.get('/:agent_id', (req, res) => {
    const { agent_id } = req.params;
    db.all('SELECT * FROM chat_history WHERE agent_id = ? ORDER BY created_at ASC', [agent_id], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Post a new message to an agent
router.post('/:agent_id', (req, res) => {
    let { agent_id } = req.params;
    const { message } = req.body;

    if (!message) return res.status(400).json({ error: 'Message content required' });

    // Handle "Company Room" (Virtual ID 0)
    const isCompanyRoom = agent_id == "0";
    
    // For Company Room, we always query for the CEO (Agent 1) to act as the responder
    const queryId = isCompanyRoom ? 1 : agent_id;

    db.get('SELECT * FROM agents WHERE id = ?', [queryId], (err, agent) => {
        if (err || !agent) {
            console.error('Agent lookup failed', err, 'ID:', queryId);
            return res.status(404).json({ error: 'Agent not found' });
        }

        const sqlUserMsg = `INSERT INTO chat_history (agent_id, user_id, sender, message) VALUES (?, 1, 'user', ?)`;

        db.run(sqlUserMsg, [agent_id, message], async function (err) {
            if (err) return res.status(500).json({ error: err.message });

            // 1. Emit the user message to the live feed
            if (req.io) {
                const feedPrefix = isCompanyRoom ? "[OFFICE SPACE]" : `(DM)`;
                req.io.emit('live_feed', {
                    agent: 'Director',
                    message: `${feedPrefix}: ${message}`,
                    time: new Date().toISOString(),
                    type: 'user'
                });
            }

            try {
                const { generateAgentResponse } = require('../services/llm');
                
                // --- Primary Response (CEO) ---
                let systemPrompt = agent.system_prompt;
                if (isCompanyRoom) {
                    systemPrompt = "You are the CEO presiding over the Company Room. " +
                                 "You are interacting with the whole team. " +
                                 "Address the user as 'Director'. Keep it decisive and strategic.";
                }

                const rawResponse = await generateAgentResponse(systemPrompt, message, {
                    agentId: queryId
                });

                let processedResponse = rawResponse;
                // If it's a tool call JSON, extract the "thought" or a simplified message
                if (rawResponse.startsWith('{') && rawResponse.includes('tool_call')) {
                    try {
                        const toolData = JSON.parse(rawResponse);
                        processedResponse = `[SYSTEM]: I am initiating "${toolData.call.name}" with parameters: ${JSON.stringify(toolData.call.args)}. I will update you once complete.`;
                    } catch (e) {
                        processedResponse = rawResponse;
                    }
                }

                // Save response
                const sqlAgentMsg = `INSERT INTO chat_history (agent_id, user_id, sender, message) VALUES (?, 1, ?, ?)`;
                db.run(sqlAgentMsg, [agent_id, processedResponse, isCompanyRoom ? 'CEO' : 'agent'], async function (err2) {
                    if (err2) console.error('Failed to save message', err2);

                    if (req.io) {
                        const feedPrefix = isCompanyRoom ? "[OFFICE SPACE]" : `(DM)`;
                        req.io.emit('live_feed', {
                            agent: isCompanyRoom ? "CEO" : agent.role,
                            message: `${feedPrefix}: ${processedResponse}`,
                            time: new Date().toISOString(),
                            type: 'agent'
                        });
                    }

                    // --- MEETING LOGIC: Multiple agents chime in ---
                    if (isCompanyRoom) {
                        db.all('SELECT * FROM agents WHERE id > 1 AND id != ? ORDER BY RANDOM() LIMIT 2', [queryId], async (err3, participants) => {
                            if (!err3 && participants) {
                                for (const sidekick of participants) {
                                    const sidekickPrompt = `You are ${sidekick.role}. ${sidekick.system_prompt}. You are in a meeting. Chime in briefly (1 sentence) to the discussion.`;
                                    try {
                                        const chimeIn = await generateAgentResponse(sidekickPrompt, `Director said: ${message}\nCEO said: ${processedResponse}`, { agentId: sidekick.id });
                                        
                                        db.run(sqlAgentMsg, [agent_id, chimeIn, sidekick.role], (err4) => {
                                            if (req.io && !err4) {
                                                req.io.emit('live_feed', { agent: sidekick.role, message: `[OFFICE SPACE]: ${chimeIn}`, time: new Date().toISOString(), type: 'agent' });
                                            }
                                        });
                                    } catch (e) {}
                                }
                            }
                        });
                    }

                    res.status(201).json({ reply: processedResponse });
                });
            } catch (llmErr) {
                console.error(llmErr);
                return res.status(500).json({ error: 'Failed to generate AI response' });
            }
        });
    });
});

module.exports = router;
