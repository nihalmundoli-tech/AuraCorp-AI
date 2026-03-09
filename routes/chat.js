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
    const { agent_id } = req.params;
    const { message } = req.body;

    if (!message) return res.status(400).json({ error: 'Message content required' });

    // 1. Get agent details first
    db.get('SELECT * FROM agents WHERE id = ?', [agent_id], (err, agent) => {
        if (err || !agent) return res.status(404).json({ error: 'Agent not found' });

        const sqlUserMsg = `INSERT INTO chat_history (agent_id, user_id, sender, message) VALUES (?, 1, 'user', ?)`;

        db.run(sqlUserMsg, [agent_id, message], async function (err) {
            if (err) return res.status(500).json({ error: err.message });

            try {
                // 2. Call the LLM with the agent's system prompt
                const { generateAgentResponse } = require('../services/llm');
                const agentResponse = await generateAgentResponse(agent.system_prompt, message);

                // 3. Save agent response
                const sqlAgentMsg = `INSERT INTO chat_history (agent_id, user_id, sender, message) VALUES (?, 1, 'agent', ?)`;
                db.run(sqlAgentMsg, [agent_id, agentResponse], function (err2) {
                    if (err2) return res.status(500).json({ error: err2.message });

                    // Also broadcast to live feed so others can see they chatted
                    if (req.io) {
                        req.io.emit('live_feed', {
                            agent: agent.role,
                            message: `(DM with Master User): ${agentResponse.substring(0, 50)}...`,
                            time: new Date().toISOString()
                        });
                    }

                    res.status(201).json({ reply: agentResponse });
                });
            } catch (llmErr) {
                return res.status(500).json({ error: 'Failed to generate AI response' });
            }
        });
    });
});

module.exports = router;
