const express = require('express');
const router = express.Router();
const db = require('../db');

const credentialManager = require('../services/credentialManager');

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
    
    const eGemini = credentialManager.encrypt(gemini_key);
    const eGroq = credentialManager.encrypt(groq_key);
    const eOpenrouter = credentialManager.encrypt(openrouter_key);

    const sql = `
        UPDATE app_settings 
        SET gemini_key = ?, groq_key = ?, openrouter_key = ?
        WHERE user_id = 1
    `;
    db.run(sql, [eGemini, eGroq, eOpenrouter], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Save recruitment settings
router.post('/recruitment', (req, res) => {
    const { naukri_key, linkedin_key, whatsapp_key, spreadsheet_id } = req.body;
    
    const eNaukri = credentialManager.encrypt(naukri_key);
    const eLinkedin = credentialManager.encrypt(linkedin_key);
    const eWhatsapp = credentialManager.encrypt(whatsapp_key);

    const sql = `
        UPDATE app_settings 
        SET naukri_key = ?, linkedin_key = ?, whatsapp_key = ?, google_sheets_id = ?
        WHERE user_id = 1
    `;
    db.run(sql, [eNaukri, eLinkedin, eWhatsapp, spreadsheet_id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});


module.exports = router;
