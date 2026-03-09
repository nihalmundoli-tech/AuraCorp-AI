// services/orchestrator.js
const db = require('../db');
const { generateAgentResponse } = require('./llm');

/**
 * Handle a new task assigned to an agent. 
 * This simulates the agent "thinking" and working on the task.
 */
async function processTaskQueue(io) {
    db.all(`SELECT t.*, a.role, a.system_prompt 
            FROM tasks t 
            JOIN agents a ON t.assigned_agent_id = a.id 
            WHERE t.status = 'pending'`, [], async (err, tasks) => {
        if (err) return console.error('Error fetching pending tasks:', err);

        for (const task of tasks) {
            // 1. Mark as in-progress
            db.run(`UPDATE tasks SET status = 'in-progress' WHERE id = ?`, [task.id]);

            // Notify frontend
            io.emit('live_feed', {
                agent: task.role,
                message: `I have started working on task: "${task.title}".`,
                time: new Date().toISOString()
            });

            try {
                // 2. Agent does the work via LLM
                const prompt = `Task Title: ${task.title}\nDescription: ${task.description}\n\nPlease execute this task according to your role.`;
                const result = await generateAgentResponse(task.system_prompt, prompt);

                // 3. Save the result as a task step
                db.run(`INSERT INTO task_steps (task_id, agent_id, action_type, content) VALUES (?, ?, ?, ?)`,
                    [task.id, task.assigned_agent_id, 'execution', result]);

                // --- SPECIAL: Database Manager Agent logic ---
                if (task.role.includes('Database Manager')) {
                    try {
                        const { appendToSheet } = require('./googleSheets');
                        // These would come from .env in a real setup
                        const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
                        const CREDENTIALS = process.env.GOOGLE_SERVICE_ACCOUNT ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT) : null;

                        if (SPREADSHEET_ID && CREDENTIALS) {
                            await appendToSheet(SPREADSHEET_ID, 'Sheet1!A1', [
                                new Date().toISOString(),
                                task.title,
                                result.substring(0, 1000) // Truncate if too long for a cell
                            ], CREDENTIALS);

                            io.emit('live_feed', {
                                agent: task.role,
                                message: `Successfully pushed data from "${task.title}" to Google Sheets.`,
                                time: new Date().toISOString()
                            });
                        }
                    } catch (sheetErr) {
                        console.error('Failed to update Google Sheet:', sheetErr);
                    }
                }
                // ----------------------------------------------

                // 4. Decide Review Loop vs Completion
                // If it's the CEO acting, it's done. If it's a subordinate, it goes to review.
                if (task.role === 'CEO' || task.role === 'COO') {
                    db.run(`UPDATE tasks SET status = 'completed' WHERE id = ?`, [task.id]);
                    io.emit('live_feed', {
                        agent: task.role,
                        message: `Finalized and approved: "${task.title}".`,
                        time: new Date().toISOString()
                    });
                } else {
                    db.run(`UPDATE tasks SET status = 'review' WHERE id = ?`, [task.id]);
                    io.emit('live_feed', {
                        agent: task.role,
                        message: `Completed draft for "${task.title}". Sending to CEO/COO for review.`,
                        time: new Date().toISOString()
                    });
                }

            } catch (error) {
                console.error(`Agent ${task.role} failed to process task ${task.id}:`, error);
                db.run(`UPDATE tasks SET status = 'failed' WHERE id = ?`, [task.id]);
            }
        }
    });

    // Handle items in 'review' state
    db.all(`SELECT t.*, a.role AS original_role 
            FROM tasks t 
            JOIN agents a ON t.assigned_agent_id = a.id 
            WHERE t.status = 'review'`, [], async (err, reviewTasks) => {
        if (err) return;

        for (const task of reviewTasks) {
            // Get CEO/COO system prompt to enact review
            db.get(`SELECT id, role, system_prompt FROM agents WHERE role IN ('CEO', 'COO') LIMIT 1`, [], async (err, reviewer) => {
                if (err || !reviewer) return;

                db.run(`UPDATE tasks SET status = 'in-review' WHERE id = ?`, [task.id]);

                io.emit('live_feed', {
                    agent: reviewer.role,
                    message: `Reviewing work from ${task.original_role} on task: "${task.title}".`,
                    time: new Date().toISOString()
                });

                try {
                    // Fetch what they actually did
                    db.get(`SELECT content FROM task_steps WHERE task_id = ? AND action_type = 'execution' ORDER BY id DESC LIMIT 1`, [task.id], async (err, step) => {
                        if (err || !step) return;

                        const reviewPrompt = `Review this work submitted by the ${task.original_role}:\n\nTask: ${task.title}\nWork Submitted:\n${step.content}\n\nIs this approved? Provide feedback or reply with APPROVE.`;
                        const reviewResult = await generateAgentResponse(reviewer.system_prompt, reviewPrompt);

                        db.run(`INSERT INTO task_steps (task_id, agent_id, action_type, content) VALUES (?, ?, ?, ?)`,
                            [task.id, reviewer.id, 'review', reviewResult]);

                        // Simple rudimentary check mimicking AI decision
                        if (reviewResult.includes('APPROVE') || reviewResult.toLowerCase().includes('approved') || reviewResult.includes('[MOCK RESPONSE]')) {
                            db.run(`UPDATE tasks SET status = 'completed' WHERE id = ?`, [task.id]);
                            io.emit('live_feed', {
                                agent: reviewer.role,
                                message: `APPROVED work from ${task.original_role} on "${task.title}".`,
                                time: new Date().toISOString()
                            });
                        } else {
                            // Send back to pending for re-work
                            db.run(`UPDATE tasks SET status = 'pending' WHERE id = ?`, [task.id]);
                            io.emit('live_feed', {
                                agent: reviewer.role,
                                message: `REJECTED work from ${task.original_role}. Needs revisions. Sent back to queue.`,
                                time: new Date().toISOString()
                            });
                        }
                    });
                } catch (e) {
                    console.error('Review failed', e);
                }
            });
        }
    });
}

/**
 * Starts the Orchestrator loop 
 * Polling the DB every 10 seconds for pending tasks.
 */
function startOrchestrator(io) {
    console.log('Starting AI Agent Orchestrator loop...');
    setInterval(() => {
        processTaskQueue(io);
    }, 10000); // Check every 10s
}

module.exports = {
    startOrchestrator
};
