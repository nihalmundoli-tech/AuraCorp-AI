const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const authRouter = require('./routes/auth');
const agentsRouter = require('./routes/agents');
const tasksRouter = require('./routes/tasks');
const chatRouter = require('./routes/chat');
const skillsRouter = require('./routes/skills');
const settingsRouter = require('./routes/settings');
const monitoringRouter = require('./routes/monitoring');
const { startOrchestrator } = require('./services/orchestrator');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Make io accessible in routes
app.use((req, res, next) => {
    req.io = io;
    next();
});

const authMiddleware = require('./middleware/auth');

app.use('/api/auth', authRouter);
app.use('/api/agents', authMiddleware, agentsRouter);
app.use('/api/tasks', authMiddleware, tasksRouter);
app.use('/api/chat', authMiddleware, chatRouter);
app.use('/api/skills', authMiddleware, skillsRouter);
app.use('/api/settings', authMiddleware, settingsRouter);
app.use('/api/monitoring', authMiddleware, monitoringRouter);

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('A client connected:', socket.id);

    // Send a welcome event to test the connection
    socket.emit('live_feed', {
        agent: 'System',
        message: 'Connected to Command Center.',
        time: new Date().toISOString()
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Simple health check route
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    // Start polling the DB for pending tasks to assign to bots
    startOrchestrator(io);

    // Start Real-Time Self-Healing service
    const { startSelfHealing } = require('./services/self_healing');
    startSelfHealing(io);

    // Start Bot Health Inspector
    const { startHealthInspector } = require('./services/healthInspector');
    startHealthInspector(io);
});
