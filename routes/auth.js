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

// Simple login (no JWT for free demo)
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Return a mock token
    const token = `mock-token-${user.id}`;
    res.json({ token, userId: user.id });
});

module.exports = router;
