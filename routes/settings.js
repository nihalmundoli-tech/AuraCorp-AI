const express = require('express');
const router = express.Router();
const db = require('../db');

// Get settings for the admin user (demo)
router.get('/', (req, res) => {
    const sql = `SELECT * FROM app_settings WHERE user_id = (SELECT id FROM users WHERE username = 'admin')`;
    db.get(sql, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
    });
});

// Save settings
router.post('/', (req, res) => {
    const { gemini_key, groq_key, openrouter_key, research_api_key } = req.body;
    const sql = `
        UPDATE app_settings 
        SET gemini_key = ?, groq_key = ?, openrouter_key = ?, research_api_key = ?
        WHERE user_id = (SELECT id FROM users WHERE username = 'admin')
    `;
    db.run(sql, [gemini_key, groq_key, openrouter_key, research_api_key], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;
