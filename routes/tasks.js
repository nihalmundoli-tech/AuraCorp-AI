// tasks.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// Helper to get current timestamp
const now = () => new Date().toISOString();

// Get all tasks
router.get('/', (req, res) => {
    db.all('SELECT * FROM tasks', [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Get task by id
router.get('/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }
        if (!row) return res.status(404).json({ error: 'Task not found' });
        res.json(row);
    });
});

// Create new task
router.post('/', (req, res) => {
    const { title, description, assigned_agent_id } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const sql = `INSERT INTO tasks (title, description, assigned_agent_id, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?)`;
    const params = [title, description || null, assigned_agent_id || null, now(), now()];
    db.run(sql, params, function (err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID });
    });
});

// Update task
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { title, description, status, assigned_agent_id } = req.body;
    const sql = `UPDATE tasks SET title = COALESCE(?, title),
               description = COALESCE(?, description),
               status = COALESCE(?, status),
               assigned_agent_id = COALESCE(?, assigned_agent_id),
               updated_at = ?
               WHERE id = ?`;
    const params = [title, description, status, assigned_agent_id, now(), id];
    db.run(sql, params, function (err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Task not found' });
        res.json({ updated: true });
    });
});

// Delete task
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM tasks WHERE id = ?', [id], function (err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Task not found' });
        res.json({ deleted: true });
    });
});

module.exports = router;
