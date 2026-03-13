const express = require('express');
const router = express.Router();
const db = require('../db');

// Get settings for the admin user (demo)
router.get('/', (req, res) => {
    const sql = `SELECT * FROM app_settings WHERE user_id = 1`;
    db.get(sql, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
    });
});

// Save core AI settings
router.post('/', (req, res) => {
    const { gemini_key, groq_key, openrouter_key } = req.body;
    const sql = `
        UPDATE app_settings 
        SET gemini_key = ?, groq_key = ?, openrouter_key = ?
        WHERE user_id = 1
    `;
    db.run(sql, [gemini_key, groq_key, openrouter_key], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Save recruitment settings
router.post('/recruitment', (req, res) => {
    const { naukri_key, linkedin_key, whatsapp_key, spreadsheet_id } = req.body;
    const sql = `
        UPDATE app_settings 
        SET naukri_key = ?, linkedin_key = ?, whatsapp_key = ?, google_sheets_id = ?
        WHERE user_id = 1
    `;
    db.run(sql, [naukri_key, linkedin_key, whatsapp_key, spreadsheet_id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;
