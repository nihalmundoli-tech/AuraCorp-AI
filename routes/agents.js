// agents.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// Get list of agents from database with their skills
router.get('/', (req, res) => {
    const sql = `
        SELECT a.*, GROUP_CONCAT(s.name) as skills
        FROM agents a
        LEFT JOIN agent_skills ask ON a.id = ask.agent_id
        LEFT JOIN skills s ON ask.skill_id = s.id
        GROUP BY a.id
    `;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }
        // Convert comma-separated skills string to array
        const agents = rows.map(a => ({
            ...a,
            skills: a.skills ? a.skills.split(',') : []
        }));
        res.json(agents);
    });
});

// Create new agent (Bot Creator flow)
router.post('/', (req, res) => {
    const { role, description, system_prompt } = req.body;
    if (!role || !description) return res.status(400).json({ error: 'Role and description required' });

    const sql = `INSERT INTO agents (role, description, system_prompt) VALUES (?, ?, ?)`;
    const defaultPrompt = system_prompt || `You are the ${role}. ${description}`;

    db.run(sql, [role, description, defaultPrompt], function (err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, role, description });
    });
});

module.exports = router;
