// skills.js
const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * Get all available skills
 */
router.get('/', (req, res) => {
    db.all('SELECT * FROM skills', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

/**
 * Assign a skill to an agent
 */
router.post('/assign', (req, res) => {
    const { agent_id, skill_name, skill_description } = req.body;

    if (!agent_id || !skill_name) {
        return res.status(400).json({ error: 'agent_id and skill_name are required' });
    }

    // 1. Ensure the skill exists
    db.run(`INSERT OR IGNORE INTO skills (name, description) VALUES (?, ?)`, [skill_name, skill_description], function (err) {
        if (err) return res.status(500).json({ error: err.message });

        // 2. Get the skill ID
        db.get(`SELECT id FROM skills WHERE name = ?`, [skill_name], (err, skill) => {
            if (err || !skill) return res.status(500).json({ error: 'Skill not found after creation' });

            // 3. Link agent to skill
            db.run(`INSERT OR IGNORE INTO agent_skills (agent_id, skill_id) VALUES (?, ?)`, [agent_id, skill.id], function (err) {
                if (err) return res.status(500).json({ error: err.message });

                // Broadcast update via socket if possible
                if (req.io) {
                    req.io.emit('live_feed', {
                        agent: 'Skill Evaluator',
                        message: `Assigned new skill [${skill_name}] to Agent ID: ${agent_id}.`,
                        time: new Date().toISOString()
                    });
                }

                res.status(201).json({ success: true, agent_id, skill_id: skill.id });
            });
        });
    });
});

module.exports = router;
