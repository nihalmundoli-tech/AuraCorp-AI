// auth.js
const express = require('express');
const router = express.Router();

// In-memory users for demo (replace with DB in production)
const users = [];

// Register endpoint
router.post('/register', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    const exists = users.find(u => u.email === email);
    if (exists) {
        return res.status(409).json({ error: 'User already exists' });
    }
    const newUser = { id: users.length + 1, email, password };
    users.push(newUser);
    res.status(201).json({ message: 'User registered', userId: newUser.id });
});

// Simple login with specific credentials
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    console.log(`[AUTH] Login attempt: username="${username}"`);
    
    if (username === 'workwalaa' && password === 'workwalaa@123') {
        process.stdout.write(`[AUTH] Login SUCCESS for: ${username}\n`);
        const token = 'waa-agentic-secure-token-2024';
        return res.json({ 
            success: true, 
            token, 
            user: { username: 'workwalaa', role: 'Chief Administrator' } 
        });
    }
    
    console.log(`[AUTH] Login FAILED for: ${username}`);
    res.status(401).json({ success: false, error: 'Access Denied: Invalid AI Credentials' });
});

module.exports = router;
