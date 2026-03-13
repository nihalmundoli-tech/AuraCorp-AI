// middleware/auth.js
function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token && req.query.token) {
        // Allow token in query for simple socket/demo scenarios
        if (req.query.token === 'waa-agentic-secure-token-2024') return next();
    }

    if (token === 'waa-agentic-secure-token-2024') {
        return next();
    }

    res.status(403).json({ success: false, error: 'Unauthorized: Valid Session Token Required' });
}

module.exports = authMiddleware;
